-- INGLY OS V2 — Rollback 0026 audit log.
do $$
declare t text;
begin
  foreach t in array array['sales_invoice','sales_order','sales_payment','catalog_product','tenant_settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
  end loop;
end $$;
drop function if exists public.audit_row();
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'system.audit';
delete from security.role_perm_cache where resource = 'system.audit';
delete from public.permission where resource = 'system.audit';
drop table if exists public.audit_log;
