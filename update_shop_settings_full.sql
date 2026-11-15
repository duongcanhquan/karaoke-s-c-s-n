-- Full shop + printer settings for receipts / VietQR.
-- Run in Supabase SQL Editor (safe to re-run).

alter table public.shop_settings disable row level security;

alter table public.shop_settings
  add column if not exists shop_name text not null default 'Karaoke';

alter table public.shop_settings
  add column if not exists shop_address text not null default '';

alter table public.shop_settings
  add column if not exists shop_phone text not null default '';

alter table public.shop_settings
  add column if not exists receipt_footer text not null default 'Cảm ơn quý khách';

alter table public.shop_settings
  add column if not exists printer_paper_mm integer not null default 80;

alter table public.shop_settings
  add column if not exists printer_auto_print boolean not null default false;

alter table public.shop_settings
  add column if not exists printer_copies integer not null default 1;

alter table public.shop_settings
  add column if not exists printer_name text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_settings_paper_mm_check'
  ) then
    alter table public.shop_settings
      add constraint shop_settings_paper_mm_check
      check (printer_paper_mm in (58, 80));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_settings_copies_check'
  ) then
    alter table public.shop_settings
      add constraint shop_settings_copies_check
      check (printer_copies >= 1 and printer_copies <= 3);
  end if;
end $$;

insert into public.shop_settings (bank_bin, bank_account_number, bank_account_name, shop_name)
select '970436', '', '', 'Karaoke'
where not exists (select 1 from public.shop_settings);
