-- INGLY OS V2 — Rollback 0021 impostazioni ERP per tenant.
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'settings.tenant';
delete from security.role_perm_cache where resource = 'settings.tenant';
delete from public.permission where resource = 'settings.tenant';
drop table if exists public.tenant_settings;
