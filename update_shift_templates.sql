-- Mẫu ca + lương linh hoạt (theo ca / theo tháng).
-- Chạy trong Supabase SQL Editor. Safe to re-run.

-- 1) Mẫu ca
create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  pay_mode text not null default 'HOURLY',
  default_amount numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint shift_templates_name_key unique (name),
  constraint shift_templates_pay_mode_check check (pay_mode in ('HOURLY', 'FIXED')),
  constraint shift_templates_default_amount_check check (default_amount >= 0)
);

-- 2) Users: chế độ lương
alter table public.users
  add column if not exists pay_type text not null default 'SHIFT';

alter table public.users
  add column if not exists monthly_salary numeric(12, 2) not null default 0;

alter table public.users
  add column if not exists require_clock_in boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_pay_type_check'
  ) then
    alter table public.users
      add constraint users_pay_type_check check (pay_type in ('SHIFT', 'MONTHLY'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'users_monthly_salary_check'
  ) then
    alter table public.users
      add constraint users_monthly_salary_check check (monthly_salary >= 0);
  end if;
end $$;

-- 3) Ghi đè mức theo NV × mẫu ca
create table if not exists public.staff_shift_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  template_id uuid not null,
  amount numeric(12, 2) not null,
  constraint staff_shift_rates_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade,
  constraint staff_shift_rates_template_id_fkey
    foreign key (template_id) references public.shift_templates (id) on delete cascade,
  constraint staff_shift_rates_user_template_key unique (user_id, template_id),
  constraint staff_shift_rates_amount_check check (amount >= 0)
);

-- 4) Shifts: gắn mẫu ca + kiểu trả (snapshot)
alter table public.shifts
  add column if not exists template_id uuid;

alter table public.shifts
  add column if not exists pay_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_template_id_fkey'
  ) then
    alter table public.shifts
      add constraint shifts_template_id_fkey
      foreign key (template_id) references public.shift_templates (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_pay_mode_check'
  ) then
    alter table public.shifts
      add constraint shifts_pay_mode_check
      check (pay_mode is null or pay_mode in ('HOURLY', 'FIXED', 'ATTENDANCE'));
  end if;
end $$;

-- Ca cũ chưa có pay_mode → coi như theo giờ
update public.shifts
set pay_mode = 'HOURLY'
where pay_mode is null;

-- 5) Quyền (app dùng anon key)
alter table public.shift_templates disable row level security;
alter table public.staff_shift_rates disable row level security;
grant select, insert, update, delete on public.shift_templates to anon, authenticated;
grant select, insert, update, delete on public.staff_shift_rates to anon, authenticated;
grant all on public.shift_templates to service_role;
grant all on public.staff_shift_rates to service_role;
