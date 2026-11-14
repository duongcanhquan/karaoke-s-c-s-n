-- Karaoke management schema.
-- Paste this into the Supabase SQL Editor for project qkjotgqzdyqekoochhhc.
--
-- RLS is disabled on purpose for the first development pass.
-- With these grants, the publishable key can read and write every row,
-- including staff PIN codes. Do not use this access model with real data.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  pin_code text not null,
  constraint users_pin_code_key unique (pin_code)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  hourly_rate numeric(12, 2) not null,
  status text not null default 'AVAILABLE',
  constraint rooms_name_key unique (name),
  constraint rooms_hourly_rate_check check (hourly_rate >= 0),
  constraint rooms_status_check check (status in ('AVAILABLE', 'IN_USE', 'CLEANING'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  room_total numeric(12, 2) not null default 0,
  service_total numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  status text not null default 'ACTIVE',
  constraint invoices_room_id_fkey
    foreign key (room_id) references public.rooms (id) on delete restrict,
  constraint invoices_status_check check (status in ('ACTIVE', 'PAID')),
  constraint invoices_room_total_check check (room_total >= 0),
  constraint invoices_service_total_check check (service_total >= 0),
  constraint invoices_grand_total_check check (grand_total >= 0),
  constraint invoices_time_order_check check (end_time is null or end_time >= start_time)
);

create table public.invoice_items (
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

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  amount numeric(12, 2) not null,
  date date not null default current_date,
  constraint expenses_amount_check check (amount >= 0)
);

create table public.shifts (
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

create table public.room_minibar_setup (
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

create table public.invoice_staff_bookings (
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

create index invoices_room_id_idx on public.invoices (room_id);
create index invoices_status_idx on public.invoices (status);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index invoice_items_product_id_idx on public.invoice_items (product_id);
create index shifts_user_id_idx on public.shifts (user_id);
create index expenses_date_idx on public.expenses (date);
create index room_minibar_setup_room_id_idx on public.room_minibar_setup (room_id);
create index invoice_staff_bookings_invoice_id_idx on public.invoice_staff_bookings (invoice_id);
create index invoice_staff_bookings_staff_id_idx on public.invoice_staff_bookings (staff_id);

alter table public.users disable row level security;
alter table public.rooms disable row level security;
alter table public.products disable row level security;
alter table public.invoices disable row level security;
alter table public.invoice_items disable row level security;
alter table public.expenses disable row level security;
alter table public.shifts disable row level security;
alter table public.room_minibar_setup disable row level security;
alter table public.invoice_staff_bookings disable row level security;

grant select, insert, update, delete on public.users to anon, authenticated;
grant select, insert, update, delete on public.rooms to anon, authenticated;
grant select, insert, update, delete on public.products to anon, authenticated;
grant select, insert, update, delete on public.invoices to anon, authenticated;
grant select, insert, update, delete on public.invoice_items to anon, authenticated;
grant select, insert, update, delete on public.expenses to anon, authenticated;
grant select, insert, update, delete on public.shifts to anon, authenticated;
grant select, insert, update, delete on public.room_minibar_setup to anon, authenticated;
grant select, insert, update, delete on public.invoice_staff_bookings to anon, authenticated;

grant all on public.users to service_role;
grant all on public.rooms to service_role;
grant all on public.products to service_role;
grant all on public.invoices to service_role;
grant all on public.invoice_items to service_role;
grant all on public.expenses to service_role;
grant all on public.shifts to service_role;
grant all on public.room_minibar_setup to service_role;
grant all on public.invoice_staff_bookings to service_role;
