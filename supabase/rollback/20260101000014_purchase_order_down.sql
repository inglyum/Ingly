-- INGLY OS V2 — Rollback 0014 ordini di acquisto.
drop trigger if exists purchase_order_del_perm on public.purchase_order;
drop trigger if exists purchase_order_line_aiud on public.purchase_order_line;
drop trigger if exists purchase_order_bi on public.purchase_order;
drop function if exists public.purchase_order_line_after();
drop function if exists public.purchase_order_recalc(uuid);
drop function if exists public.purchase_order_before_ins();
drop function if exists public.next_purchase_number(uuid);
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'purchasing.order';
delete from security.role_perm_cache where resource = 'purchasing.order';
delete from public.permission where resource = 'purchasing.order';
drop table if exists public.purchase_order_line;
drop table if exists public.purchase_order_counter;
drop table if exists public.purchase_order;
