-- INGLY OS V2 — Rollback 0011 pagamenti. Rimuove tabella/funzioni/permessi
-- sales.payment. NON tocca le fatture né il trigger condiviso 0006.
-- Nota: paid_total/status residui sulle fatture NON vengono ricalcolati qui;
-- restano all'ultimo valore propagato (le fatture non dipendono da questa tabella).
-- ==========================================================================
drop trigger if exists sales_payment_del_perm on public.sales_payment;
drop trigger if exists sales_payment_aiud on public.sales_payment;
drop trigger if exists sales_payment_biu on public.sales_payment;

drop function if exists public.sales_payment_after();
drop function if exists public.sales_payment_validate();
drop function if exists public.sales_invoice_apply_payments(uuid);

delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'sales.payment';
delete from security.role_perm_cache where resource = 'sales.payment';
delete from public.permission where resource = 'sales.payment';

drop table if exists public.sales_payment;
-- ==========================================================================
