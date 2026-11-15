-- Tắt RLS + cấp quyền anon/authenticated cho toàn bộ bảng app.
-- App dùng publishable key (anon), không dùng Supabase Auth.
-- Lỗi "new row violates row-level security policy" = chạy file này trong SQL Editor.
-- Safe to re-run. Bỏ qua bảng chưa tồn tại.

do $$
declare
  t text;
  tables text[] := array[
    'users',
    'rooms',
    'products',
    'invoices',
    'invoice_items',
    'expenses',
    'shifts',
    'room_minibar_setup',
    'invoice_staff_bookings',
    'shop_settings',
    'stock_movements',
    'inventory_units'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter table public.%I disable row level security', t);
      execute format(
        'grant select, insert, update, delete on public.%I to anon, authenticated',
        t
      );
      execute format('grant all on public.%I to service_role', t);
    exception
      when undefined_table then
        raise notice 'skip missing table: %', t;
    end;
  end loop;
end $$;
