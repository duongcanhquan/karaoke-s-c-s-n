-- Shop bank details for VietQR checkout.
-- Safe to run more than once.

create table if not exists public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  bank_bin text not null default '970436',
  bank_account_number text not null default '',
  bank_account_name text not null default ''
);

alter table public.shop_settings disable row level security;

grant select, insert, update, delete on public.shop_settings to anon, authenticated;
grant all on public.shop_settings to service_role;

insert into public.shop_settings (bank_bin, bank_account_number, bank_account_name)
select '970436', '', ''
where not exists (select 1 from public.shop_settings);
