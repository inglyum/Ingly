-- INGLY OS V2 — Rollback 0024 time tracker.
drop trigger if exists time_entry_del_perm on public.time_entry;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'work.time';
delete from security.role_perm_cache where resource = 'work.time';
delete from public.permission where resource = 'work.time';
drop table if exists public.time_entry;
