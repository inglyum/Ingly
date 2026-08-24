-- INGLY OS V2 — Rollback 0029 attrezzature/macchine.
drop trigger if exists equipment_del_perm on public.equipment;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'assets.equipment';
delete from security.role_perm_cache where resource = 'assets.equipment';
delete from public.permission where resource = 'assets.equipment';
alter table public.catalog_product drop column if exists cost_per_mq;
drop table if exists public.equipment;
