-- Shop bank + profile + printer. Prefer update_shop_settings_full.sql for existing DBs.
-- Safe to run more than once.

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

alter table public.shop_settings disable row level security;

grant select, insert, update, delete on public.shop_settings to anon, authenticated;
grant all on public.shop_settings to service_role;

insert into public.shop_settings (bank_bin, bank_account_number, bank_account_name, shop_name)
select '970436', '', '', 'Karaoke'
where not exists (select 1 from public.shop_settings);
