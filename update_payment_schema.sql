-- Payment method + cash/QR split on paid invoices.
-- Paste into Supabase SQL Editor (safe to re-run).

alter table public.invoices
  add column if not exists payment_method text;

alter table public.invoices
  add column if not exists cash_amount numeric(12, 2) not null default 0;

alter table public.invoices
  add column if not exists transfer_amount numeric(12, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_payment_method_check'
  ) then
    alter table public.invoices
      add constraint invoices_payment_method_check
      check (payment_method is null or payment_method in ('CASH', 'QR', 'SPLIT'));
  end if;
end $$;

create index if not exists invoices_paid_end_time_idx
  on public.invoices (end_time desc)
  where status = 'PAID';
