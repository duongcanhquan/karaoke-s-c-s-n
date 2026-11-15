-- Batch-update remaining_qty for checkout audit (one round-trip instead of N).
-- Safe to re-run. App falls back to per-row updates if this function is missing.

create or replace function public.apply_invoice_item_audit(
  p_invoice_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_id uuid;
  remaining integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_id := (item->>'id')::uuid;
    remaining := (item->>'remaining_qty')::integer;

    if remaining is null or remaining < 0 then
      raise exception 'remaining_qty không hợp lệ';
    end if;

    update public.invoice_items
    set remaining_qty = remaining
    where id = item_id
      and invoice_id = p_invoice_id;

    if not found then
      raise exception 'Không tìm thấy dòng hóa đơn %', item_id;
    end if;
  end loop;
end;
$$;

grant execute on function public.apply_invoice_item_audit(uuid, jsonb) to anon, authenticated, service_role;
