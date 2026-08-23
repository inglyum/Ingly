-- INGLY OS V2 — Rollback 0020 logistica/spedizioni.
drop trigger if exists shipment_del_perm on public.shipment;
drop trigger if exists shipment_bi on public.shipment;
drop function if exists public.shipment_before_ins();
drop function if exists public.next_shipment_number(uuid);
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'logistics.shipment';
delete from security.role_perm_cache where resource = 'logistics.shipment';
delete from public.permission where resource = 'logistics.shipment';
drop table if exists public.shipment_line;
drop table if exists public.shipment_counter;
drop table if exists public.shipment;
