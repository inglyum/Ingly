-- INGLY OS V2 — Rollback 0019 produzione.
drop trigger if exists production_order_del_perm on public.production_order;
drop trigger if exists production_bom_del_perm on public.production_bom;
drop trigger if exists production_order_bi on public.production_order;
drop function if exists public.production_order_before_ins();
drop function if exists public.next_production_number(uuid);
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'production.order';
delete from security.role_perm_cache where resource = 'production.order';
delete from public.permission where resource = 'production.order';
drop table if exists public.production_bom_line;
drop table if exists public.production_order;
drop table if exists public.production_order_counter;
drop table if exists public.production_bom;
