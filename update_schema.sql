-- Upgrade an existing Karaoke database for minibar audit, staff bookings, and menu categories.
-- Run this in the Supabase SQL Editor after supabase_schema.sql.
-- Safe to run again. A brand-new database can use the updated supabase_schema.sql instead.
--
-- products.category becomes FOOD, DRINK, or SERVICE.
-- invoice_items.quantity is replaced by initial / ordered / remaining / consumed.
-- consumed_qty and booking profit are generated columns. Do not write them from the app.
-- The stock trigger deducts consumed_qty when an invoice becomes PAID.
-- Service products are not deducted from stock.

update public.products
set category = case upper(btrim(category))
  when 'FOOD' then 'FOOD'
  when 'DRINK' then 'DRINK'
  when 'SERVICE' then 'SERVICE'
  when 'ĐỒ ĂN' then 'FOOD'
  when 'DO AN' then 'FOOD'
  when 'ĐỒ UỐNG' then 'DRINK'
  when 'DO UONG' then 'DRINK'
  when 'DỊCH VỤ' then 'SERVICE'
  when 'DICH VU' then 'SERVICE'
  else category
end;

do $$
declare
  bad text;
begin
  select string_agg(distinct category, ', ')
    into bad
  from public.products
  where category not in ('FOOD', 'DRINK', 'SERVICE');

  if bad is not null then
    raise exception
      'products.category phải là FOOD, DRINK hoặc SERVICE. Đang có: %',
      bad;
  end if;
end $$;

alter table public.products
  add column if not exists is_minibar_item boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_category_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_category_check
      check (category in ('FOOD', 'DRINK', 'SERVICE'));
  end if;
end $$;

alter table public.invoice_items
  add column if not exists initial_qty integer not null default 0;

alter table public.invoice_items
  add column if not exists ordered_qty integer not null default 0;

alter table public.invoice_items
  add column if not exists remaining_qty integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoice_items'
      and column_name = 'quantity'
  ) then
    update public.invoice_items
    set ordered_qty = quantity
    where initial_qty = 0
      and ordered_qty = 0;

    alter table public.invoice_items
      drop constraint if exists invoice_items_quantity_check;

    alter table public.invoice_items
      drop column quantity;
  end if;
end $$;

do $$
declare
  generated text;
begin
  select is_generated
    into generated
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'invoice_items'
    and column_name = 'consumed_qty';

  if generated is null then
    alter table public.invoice_items
      add column consumed_qty integer
      generated always as (initial_qty + ordered_qty - remaining_qty) stored;
  elsif generated <> 'ALWAYS' then
    alter table public.invoice_items drop column consumed_qty;
    alter table public.invoice_items
      add column consumed_qty integer
      generated always as (initial_qty + ordered_qty - remaining_qty) stored;
  end if;
end $$;

alter table public.invoice_items
  drop constraint if exists invoice_items_initial_qty_check;
alter table public.invoice_items
  add constraint invoice_items_initial_qty_check check (initial_qty >= 0);

alter table public.invoice_items
  drop constraint if exists invoice_items_ordered_qty_check;
alter table public.invoice_items
  add constraint invoice_items_ordered_qty_check check (ordered_qty >= 0);

alter table public.invoice_items
  drop constraint if exists invoice_items_remaining_qty_check;
alter table public.invoice_items
  add constraint invoice_items_remaining_qty_check check (remaining_qty >= 0);

alter table public.invoice_items
  drop constraint if exists invoice_items_remaining_within_check;
alter table public.invoice_items
  add constraint invoice_items_remaining_within_check
  check (remaining_qty <= initial_qty + ordered_qty);

alter table public.invoice_items
  drop constraint if exists invoice_items_some_qty_check;
alter table public.invoice_items
  add constraint invoice_items_some_qty_check
  check (initial_qty + ordered_qty > 0);

with ranked as (
  select
    id,
    sum(initial_qty) over (partition by invoice_id, product_id) as initial_sum,
    sum(ordered_qty) over (partition by invoice_id, product_id) as ordered_sum,
    sum(remaining_qty) over (partition by invoice_id, product_id) as remaining_sum,
    row_number() over (partition by invoice_id, product_id order by id) as rn
  from public.invoice_items
)
update public.invoice_items as item
set
  initial_qty = ranked.initial_sum,
  ordered_qty = ranked.ordered_sum,
  remaining_qty = least(ranked.remaining_sum, ranked.initial_sum + ranked.ordered_sum)
from ranked
where item.id = ranked.id
  and ranked.rn = 1;

-- CẢNH BÁO: xóa vĩnh viễn dòng invoice_items trùng (invoice_id, product_id).
-- Chỉ dùng khi migrate schema cũ — không chạy lại trên DB production đã ổn định.
delete from public.invoice_items as item
using (
  select
    id,
    row_number() over (partition by invoice_id, product_id order by id) as rn
  from public.invoice_items
) as ranked
where item.id = ranked.id
  and ranked.rn > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoice_items_invoice_product_key'
      and conrelid = 'public.invoice_items'::regclass
  ) then
    alter table public.invoice_items
      add constraint invoice_items_invoice_product_key unique (invoice_id, product_id);
  end if;
end $$;

create table if not exists public.room_minibar_setup (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  product_id uuid not null,
  default_quantity integer not null,
  constraint room_minibar_setup_room_id_fkey
    foreign key (room_id) references public.rooms (id) on delete cascade,
  constraint room_minibar_setup_product_id_fkey
    foreign key (product_id) references public.products (id) on delete restrict,
  constraint room_minibar_setup_room_product_key unique (room_id, product_id),
  constraint room_minibar_setup_default_quantity_check check (default_quantity > 0)
);

create table if not exists public.invoice_staff_bookings (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  staff_id uuid not null,
  hours_worked numeric(8, 2) not null,
  customer_rate numeric(12, 2) not null,
  staff_payout_rate numeric(12, 2) not null,
  profit numeric(12, 2) generated always as (customer_rate - staff_payout_rate) stored,
  constraint invoice_staff_bookings_invoice_id_fkey
    foreign key (invoice_id) references public.invoices (id) on delete cascade,
  constraint invoice_staff_bookings_staff_id_fkey
    foreign key (staff_id) references public.users (id) on delete restrict,
  constraint invoice_staff_bookings_hours_worked_check check (hours_worked > 0),
  constraint invoice_staff_bookings_customer_rate_check check (customer_rate >= 0),
  constraint invoice_staff_bookings_staff_payout_rate_check check (staff_payout_rate >= 0),
  constraint invoice_staff_bookings_rate_order_check check (customer_rate >= staff_payout_rate)
);

create index if not exists room_minibar_setup_room_id_idx
  on public.room_minibar_setup (room_id);
create index if not exists invoice_staff_bookings_invoice_id_idx
  on public.invoice_staff_bookings (invoice_id);
create index if not exists invoice_staff_bookings_staff_id_idx
  on public.invoice_staff_bookings (staff_id);

alter table public.room_minibar_setup disable row level security;
alter table public.invoice_staff_bookings disable row level security;

grant select, insert, update, delete on public.room_minibar_setup to anon, authenticated;
grant select, insert, update, delete on public.invoice_staff_bookings to anon, authenticated;
grant all on public.room_minibar_setup to service_role;
grant all on public.invoice_staff_bookings to service_role;

create or replace function public.deduct_stock_on_paid_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item record;
begin
  if tg_op <> 'UPDATE'
    or old.status is not distinct from 'PAID'
    or new.status is distinct from 'PAID' then
    return new;
  end if;

  for item in
    select
      p.id,
      p.name,
      p.category,
      p.stock_quantity,
      summed.quantity
    from (
      select product_id, sum(consumed_qty)::integer as quantity
      from public.invoice_items
      where invoice_id = new.id
      group by product_id
    ) as summed
    join public.products as p on p.id = summed.product_id
  loop
    if item.category = 'SERVICE' or item.quantity <= 0 then
      continue;
    end if;

    if item.stock_quantity < item.quantity then
      raise exception
        'Không đủ tồn kho cho %: còn %, hóa đơn cần %',
        item.name,
        item.stock_quantity,
        item.quantity;
    end if;

    update public.products
    set stock_quantity = stock_quantity - item.quantity
    where id = item.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists invoices_deduct_stock on public.invoices;

create trigger invoices_deduct_stock
  after update of status on public.invoices
  for each row
  when (old.status is distinct from 'PAID' and new.status = 'PAID')
  execute function public.deduct_stock_on_paid_invoice();
