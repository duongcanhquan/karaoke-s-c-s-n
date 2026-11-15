-- Cho phép nhiều nhân viên dùng cùng mã PIN.
-- Đăng nhập vẫn khớp theo TÊN + PIN (không chỉ PIN).
-- Safe to re-run.

alter table public.users drop constraint if exists users_pin_code_key;

-- Một số DB đặt unique qua index riêng
drop index if exists public.users_pin_code_key;
