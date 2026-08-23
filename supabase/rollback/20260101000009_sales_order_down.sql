-- INGLY OS V2 — Rollback 0009 ordini. Rimuove tabelle/funzioni/permessi
-- sales.order. NON tocca CRM/Catalogo/Preventivi né il trigger condiviso (0006).
-- ==========================================================================
drop trigger if exists sales_order_del_perm on public.sales_order;
drop trigger if exists sales_order_line_aiud on public.sales_order_line;
drop trigger if exists sales_order_bi on public.sales_order;

drop function if exists public.sales_order_line_after();
drop function if exists public.sales_order_recalc(uuid);
drop function if exists public.sales_order_before_ins();
drop function if exists public.next_order_number(uuid);

delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'sales.order';
delete from security.role_perm_cache where resource = 'sales.order';
delete from public.permission where resource = 'sales.order';

drop table if exists public.sales_order_line;
drop table if exists public.sales_order_counter;
drop table if exists public.sales_order;
-- ==========================================================================
