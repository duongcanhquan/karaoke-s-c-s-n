-- One open shift per staff (end_time IS NULL).
-- Run in Supabase SQL editor after deploying clockIn 23505 handling.

create unique index if not exists shifts_one_open_per_user
  on public.shifts (user_id)
  where end_time is null;
