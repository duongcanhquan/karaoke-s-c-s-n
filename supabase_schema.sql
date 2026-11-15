-- Karaoke management schema.
-- Paste into the Supabase SQL Editor.
-- Safe to run more than once (IF NOT EXISTS).
--
-- If the database already has old tables and is missing columns
-- (minibar, consumed_qty, …), also run update_schema.sql
-- then update_settings_schema.sql and inventory_trigger.sql.
--
-- RLS is disabled on purpose for the first development pass.
-- The publishable key can read/write every row, including PIN codes.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text not null default '',
  role text not null,
  pin_code text not null,
  customer_rate numeric(12, 2) not null default 0,
  staff_payout_rate numeric(12, 2) not null default 0,
  default_hourly_salary numeric(12, 2) not null default 0,
  constraint users_pin_code_key unique (pin_code),
  constraint users_customer_rate_check check (customer_rate >= 0),
  constraint users_staff_payout_rate_check check (staff_payout_rate >= 0),
  constraint users_rate_order_check check (customer_rate >= staff_payout_rate),
  constraint users_default_hourly_salary_check check (default_hourly_salary >= 0)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  hourly_rate numeric(12, 2) not null,
  status text not null default 'AVAILABLE',
  constraint rooms_name_key unique (name),
  constraint rooms_hourly_rate_check check (hourly_rate >= 0),
  constraint rooms_status_check check (status in ('AVAILABLE', 'IN_USE', 'CLEANING'))
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text not null default '',
  category text not null,
  cost_price numeric(12, 2) not null,
  selling_price numeric(12, 2) not null,
  stock_quantity integer not null default 0,
  is_minibar_item boolean not null default false,
  constraint products_category_check check (category in ('FOOD', 'DRINK', 'SERVICE')),
  constraint products_cost_price_check check (cost_price >= 0),
  constraint products_selling_price_check check (selling_price >= 0),
  constraint products_stock_quantity_check check (stock_quantity >= 0)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  room_total numeric(12, 2) not null default 0,
  service_total numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  payment_method text,
  cash_amount numeric(12, 2) not null default 0,
  transfer_amount numeric(12, 2) not null default 0,
  status text not null default 'ACTIVE',
  constraint invoices_room_id_fkey
    foreign key (room_id) references public.rooms (id) on delete restrict,
  constraint invoices_status_check check (status in ('ACTIVE', 'PAID')),
  constraint invoices_payment_method_check
    check (payment_method is null or payment_method in ('CASH', 'QR', 'SPLIT')),
  constraint invoices_room_total_check check (room_total >= 0),
  constraint invoices_service_total_check check (service_total >= 0),
  constraint invoices_grand_total_check check (grand_total >= 0),
  constraint invoices_time_order_check check (end_time is null or end_time >= start_time)
);

create index if not exists invoices_paid_end_time_idx
  on public.invoices (end_time desc)
  where status = 'PAID';

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  movement_type text not null,
  quantity_before integer not null,
  quantity_delta integer not null,
  quantity_after integer not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint stock_movements_product_id_fkey
    foreign key (product_id) references public.products (id) on delete restrict,
  constraint stock_movements_type_check
    check (movement_type in ('IN', 'STOCKTAKE', 'ADJUST')),
  constraint stock_movements_before_check check (quantity_before >= 0),
  constraint stock_movements_after_check check (quantity_after >= 0)
);

create index if not exists stock_movements_product_created_idx
  on public.stock_movements (product_id, created_at desc);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  product_id uuid not null,
  initial_qty integer not null default 0,
  ordered_qty integer not null default 0,
  remaining_qty integer not null default 0,
  consumed_qty integer generated always as (initial_qty + ordered_qty - remaining_qty) stored,
  price numeric(12, 2) not null,
  constraint invoice_items_invoice_id_fkey
    foreign key (invoice_id) references public.invoices (id) on delete cascade,
  constraint invoice_items_product_id_fkey
    foreign key (product_id) references public.products (id) on delete restrict,
  constraint invoice_items_initial_qty_check check (initial_qty >= 0),
  constraint invoice_items_ordered_qty_check check (ordered_qty >= 0),
  constraint invoice_items_remaining_qty_check check (remaining_qty >= 0),
  constraint invoice_items_remaining_within_check check (remaining_qty <= initial_qty + ordered_qty),
  constraint invoice_items_some_qty_check check (initial_qty + ordered_qty > 0),
  constraint invoice_items_price_check check (price >= 0),
  constraint invoice_items_invoice_product_key unique (invoice_id, product_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  amount numeric(12, 2) not null,
  date date not null default current_date,
  constraint expenses_amount_check check (amount >= 0)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  hourly_salary numeric(12, 2) not null,
  total_salary numeric(12, 2),
  constraint shifts_user_id_fkey
    foreign key (user_id) references public.users (id) on delete restrict,
  constraint shifts_hourly_salary_check check (hourly_salary >= 0),
  constraint shifts_total_salary_check check (total_salary is null or total_salary >= 0),
  constraint shifts_time_order_check check (end_time is null or end_time >= start_time)
);

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
  start_time timestamptz,
  end_time timestamptz,
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

create table if not exists public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null default 'Karaoke',
  shop_address text not null default '',
  shop_phone text not null default '',
  receipt_footer text not null default 'Cảm ơn quý khách',
  bank_bin text not null default '970436',
  bank_account_number text not null default '',
  bank_account_name text not null default '',
  printer_paper_mm integer not null default 80,
  printer_auto_print boolean not null default false,
  printer_copies integer not null default 1,
  printer_name text not null default ''
);

create index if not exists invoices_room_id_idx on public.invoices (room_id);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists invoice_items_product_id_idx on public.invoice_items (product_id);
create index if not exists shifts_user_id_idx on public.shifts (user_id);
create index if not exists expenses_date_idx on public.expenses (date);
create index if not exists room_minibar_setup_room_id_idx on public.room_minibar_setup (room_id);
create index if not exists invoice_staff_bookings_invoice_id_idx on public.invoice_staff_bookings (invoice_id);
create index if not exists invoice_staff_bookings_staff_id_idx on public.invoice_staff_bookings (staff_id);

insert into public.shop_settings (bank_bin, bank_account_number, bank_account_name)
select '970436', '', ''
where not exists (select 1 from public.shop_settings);

alter table public.users disable row level security;
alter table public.rooms disable row level security;
alter table public.products disable row level security;
alter table public.invoices disable row level security;
alter table public.invoice_items disable row level security;
alter table public.expenses disable row level security;
alter table public.shifts disable row level security;
alter table public.room_minibar_setup disable row level security;
alter table public.invoice_staff_bookings disable row level security;
alter table public.shop_settings disable row level security;
alter table public.stock_movements disable row level security;

grant select, insert, update, delete on public.users to anon, authenticated;
grant select, insert, update, delete on public.rooms to anon, authenticated;
grant select, insert, update, delete on public.products to anon, authenticated;
grant select, insert, update, delete on public.invoices to anon, authenticated;
grant select, insert, update, delete on public.invoice_items to anon, authenticated;
grant select, insert, update, delete on public.expenses to anon, authenticated;
grant select, insert, update, delete on public.shifts to anon, authenticated;
grant select, insert, update, delete on public.room_minibar_setup to anon, authenticated;
grant select, insert, update, delete on public.invoice_staff_bookings to anon, authenticated;
grant select, insert, update, delete on public.shop_settings to anon, authenticated;
grant select, insert, update, delete on public.stock_movements to anon, authenticated;

grant all on public.users to service_role;
grant all on public.rooms to service_role;
grant all on public.products to service_role;
grant all on public.invoices to service_role;
grant all on public.invoice_items to service_role;
grant all on public.expenses to service_role;
grant all on public.shifts to service_role;
grant all on public.room_minibar_setup to service_role;
grant all on public.invoice_staff_bookings to service_role;
grant all on public.stock_movements to service_role;
grant all on public.shop_settings to service_role;
