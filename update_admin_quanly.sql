-- Create/fix manager Quanly + PIN 1234 and allow anon login.
-- Run in Supabase Dashboard -> SQL Editor -> Run.
-- App uses the publishable key; RLS on users blocks login if left enabled.
-- For ALL tables (rooms/products/…), prefer update_disable_rls_all.sql.
--
-- CẢNH BÁO: câu UPDATE bên dưới đổi TÊN + PIN của MỌI user role=ADMIN thành Quanly/1234.
-- Chỉ chạy khi cần khôi phục đăng nhập quản lý — không chạy lại trên DB đang dùng thật
-- nếu đã đổi tên/PIN admin khác.

alter table public.users disable row level security;
grant select, insert, update, delete on public.users to anon, authenticated;

-- Free PIN 1234 if another non-admin user holds it.
update public.users
set pin_code = 'tmp' || substr(replace(id::text, '-', ''), 1, 6)
where pin_code = '1234'
  and role is distinct from 'ADMIN';

update public.users
set name = 'Quanly', pin_code = '1234'
where role = 'ADMIN';

insert into public.users (name, role, pin_code)
select 'Quanly', 'ADMIN', '1234'
where not exists (select 1 from public.users where role = 'ADMIN');
