-- Deduct product stock when an invoice becomes PAID.
-- Paste this into the Supabase SQL Editor after supabase_schema.sql.
-- update_schema.sql already replaces this function. Run that file on an older database.
-- Stock drops by consumed_qty (initial + ordered - remaining).
-- SERVICE products and zero-consumption lines are skipped.
-- A failed stock check rolls the payment back.

create or replace function public.deduct_stock_on_paid_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item record;
begin
  if tg_op <> 'UPDATE'
    or old.status is not distinct from 'PAID'
    or new.status is distinct from 'PAID' then
    return new;
  end if;

  for item in
    select
      p.id,
      p.name,
      p.category,
      p.stock_quantity,
      summed.quantity
    from (
      select product_id, sum(consumed_qty)::integer as quantity
      from public.invoice_items
      where invoice_id = new.id
      group by product_id
    ) as summed
    join public.products as p on p.id = summed.product_id
  loop
    if item.category = 'SERVICE' or item.quantity <= 0 then
      continue;
    end if;

    if item.stock_quantity < item.quantity then
      raise exception
        'Không đủ tồn kho cho %: còn %, hóa đơn cần %',
        item.name,
        item.stock_quantity,
        item.quantity;
    end if;

    update public.products
    set stock_quantity = stock_quantity - item.quantity
    where id = item.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists invoices_deduct_stock on public.invoices;

create trigger invoices_deduct_stock
  after update of status on public.invoices
  for each row
  when (old.status is distinct from 'PAID' and new.status = 'PAID')
  execute function public.deduct_stock_on_paid_invoice();
