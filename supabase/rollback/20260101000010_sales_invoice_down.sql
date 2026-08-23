-- INGLY OS V2 — Rollback 0010 fatture. Rimuove tabelle/funzioni/permessi
-- sales.invoice. NON tocca CRM/Catalogo/Preventivi/Ordini né il trigger 0006.
-- ==========================================================================
drop trigger if exists sales_invoice_del_perm on public.sales_invoice;
drop trigger if exists sales_invoice_line_aiud on public.sales_invoice_line;
drop trigger if exists sales_invoice_bi on public.sales_invoice;

drop function if exists public.sales_invoice_line_after();
drop function if exists public.sales_invoice_recalc(uuid);
drop function if exists public.sales_invoice_before_ins();
drop function if exists public.next_invoice_number(uuid, int);

delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'sales.invoice';
delete from security.role_perm_cache where resource = 'sales.invoice';
delete from public.permission where resource = 'sales.invoice';

drop table if exists public.sales_invoice_line;
drop table if exists public.sales_invoice_counter;
drop table if exists public.sales_invoice;
-- ==========================================================================
