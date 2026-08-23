-- INGLY OS V2 — Rollback 0023 fatture ricorrenti.
drop trigger if exists recurring_invoice_del_perm on public.recurring_invoice;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'sales.recurring';
delete from security.role_perm_cache where resource = 'sales.recurring';
delete from public.permission where resource = 'sales.recurring';
drop table if exists public.recurring_invoice;
