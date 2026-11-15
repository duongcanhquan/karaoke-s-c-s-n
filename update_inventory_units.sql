-- Units + product stock meta for clearer receiving.
-- Run in Supabase SQL Editor after update_inventory_movements.sql.

alter table public.products disable row level security;

alter table public.products
  add column if not exists unit text not null default 'cái';

alter table public.products
  add column if not exists pack_unit text not null default 'thùng';

alter table public.products
  add column if not exists units_per_pack integer not null default 1;

alter table public.products
  add column if not exists stock_kind text not null default 'CONSUMABLE';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_units_per_pack_check'
  ) then
    alter table public.products
      add constraint products_units_per_pack_check check (units_per_pack >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_stock_kind_check'
  ) then
    alter table public.products
      add constraint products_stock_kind_check
      check (stock_kind in ('CONSUMABLE', 'REUSABLE'));
  end if;
end $$;

create table if not exists public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  constraint inventory_units_name_key unique (name)
);

alter table public.inventory_units disable row level security;
grant select, insert, update, delete on public.inventory_units to anon, authenticated;
grant all on public.inventory_units to service_role;

insert into public.inventory_units (name, sort_order)
values
  ('cái', 10),
  ('chiếc', 20),
  ('chai', 30),
  ('lon', 40),
  ('ly', 50),
  ('đĩa', 60),
  ('hộp', 70),
  ('thùng', 80),
  ('bộ', 90),
  ('kg', 100)
on conflict (name) do nothing;

-- Skip REUSABLE items when deducting stock on paid invoices.
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
      coalesce(p.stock_kind, 'CONSUMABLE') as stock_kind,
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
    if item.category = 'SERVICE'
      or item.stock_kind = 'REUSABLE'
      or item.quantity <= 0 then
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
