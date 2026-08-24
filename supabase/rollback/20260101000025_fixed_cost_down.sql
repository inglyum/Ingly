-- INGLY OS V2 — Rollback 0025 costi fissi.
drop trigger if exists fixed_cost_del_perm on public.fixed_cost;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'finance.fixed_cost';
delete from security.role_perm_cache where resource = 'finance.fixed_cost';
delete from public.permission where resource = 'finance.fixed_cost';
drop table if exists public.fixed_cost;
