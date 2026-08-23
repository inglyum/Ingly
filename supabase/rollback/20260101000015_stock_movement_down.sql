-- INGLY OS V2 — Rollback 0015 magazzino.
drop trigger if exists stock_movement_del_perm on public.stock_movement;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'inventory.movement';
delete from security.role_perm_cache where resource = 'inventory.movement';
delete from public.permission where resource = 'inventory.movement';
drop table if exists public.stock_movement;
