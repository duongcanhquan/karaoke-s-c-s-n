-- Display names (invoice / POS) + service staff default rates.
-- Run in Supabase SQL Editor. Safe to re-run.

alter table public.users disable row level security;
alter table public.products disable row level security;

-- Staff: tên hiển thị + giá phục vụ mặc định
alter table public.users
  add column if not exists display_name text;

alter table public.users
  add column if not exists customer_rate numeric(12, 2) not null default 0;

alter table public.users
  add column if not exists staff_payout_rate numeric(12, 2) not null default 0;

alter table public.users
  add column if not exists default_hourly_salary numeric(12, 2) not null default 0;

update public.users
set display_name = name
where display_name is null or btrim(display_name) = '';

alter table public.users
  alter column display_name set default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_customer_rate_check'
  ) then
    alter table public.users
      add constraint users_customer_rate_check check (customer_rate >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'users_staff_payout_rate_check'
  ) then
    alter table public.users
      add constraint users_staff_payout_rate_check check (staff_payout_rate >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'users_rate_order_check'
  ) then
    alter table public.users
      add constraint users_rate_order_check check (customer_rate >= staff_payout_rate);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'users_default_hourly_salary_check'
  ) then
    alter table public.users
      add constraint users_default_hourly_salary_check check (default_hourly_salary >= 0);
  end if;
end $$;

-- Products / services: tên hiển thị trên màn hình & hóa đơn
alter table public.products
  add column if not exists display_name text;

update public.products
set display_name = name
where display_name is null or btrim(display_name) = '';

alter table public.products
  alter column display_name set default '';
