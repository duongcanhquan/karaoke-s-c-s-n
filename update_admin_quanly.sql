-- Đặt tài khoản quản lý: tên Quanly, PIN 1234.
-- Chạy trong Supabase SQL Editor.

update public.users
set name = 'Quanly', pin_code = '1234'
where role = 'ADMIN';

insert into public.users (name, role, pin_code)
select 'Quanly', 'ADMIN', '1234'
where not exists (select 1 from public.users where role = 'ADMIN');
