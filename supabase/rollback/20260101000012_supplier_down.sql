-- INGLY OS V2 — Rollback 0012 fornitori.
drop trigger if exists supplier_del_perm on public.supplier;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'purchasing.supplier';
delete from security.role_perm_cache where resource = 'purchasing.supplier';
delete from public.permission where resource = 'purchasing.supplier';
drop table if exists public.supplier;
