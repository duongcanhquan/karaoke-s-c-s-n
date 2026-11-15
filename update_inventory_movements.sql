-- Sổ kho: nhập kho + kiểm kê (không đụng trigger trừ kho khi thanh toán).
-- Chạy trong Supabase SQL Editor.

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  movement_type text not null,
  quantity_before integer not null,
  quantity_delta integer not null,
  quantity_after integer not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint stock_movements_product_id_fkey
    foreign key (product_id) references public.products (id) on delete restrict,
  constraint stock_movements_type_check
    check (movement_type in ('IN', 'STOCKTAKE', 'ADJUST')),
  constraint stock_movements_before_check check (quantity_before >= 0),
  constraint stock_movements_after_check check (quantity_after >= 0)
);

create index if not exists stock_movements_product_created_idx
  on public.stock_movements (product_id, created_at desc);

create index if not exists stock_movements_created_idx
  on public.stock_movements (created_at desc);

alter table public.stock_movements disable row level security;

grant select, insert, update, delete on public.stock_movements to anon, authenticated;
grant all on public.stock_movements to service_role;
