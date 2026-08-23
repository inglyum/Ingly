-- INGLY OS V2 — Rollback 0018 pagamenti fornitori.
drop trigger if exists supplier_payment_del_perm on public.supplier_payment;
drop trigger if exists supplier_payment_biu on public.supplier_payment;
drop function if exists public.supplier_payment_validate();
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'finance.payment';
delete from security.role_perm_cache where resource = 'finance.payment';
delete from public.permission where resource = 'finance.payment';
drop table if exists public.supplier_payment;
