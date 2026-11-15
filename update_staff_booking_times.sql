-- Optional start/end times for service bookings on an invoice.
-- hours_worked remains the billing source of truth.
-- Safe to re-run.

alter table public.invoice_staff_bookings
  add column if not exists start_time timestamptz;

alter table public.invoice_staff_bookings
  add column if not exists end_time timestamptz;

comment on column public.invoice_staff_bookings.start_time is 'Giờ bắt đầu phục vụ (hiển thị trên bill)';
comment on column public.invoice_staff_bookings.end_time is 'Giờ kết thúc phục vụ (hiển thị trên bill)';
