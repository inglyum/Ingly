-- INGLY OS V2 — CRM server-side RBAC ROLLBACK (down) — STAGING ONLY — NON APPLICATO
-- Ripristina le policy CRM tenant-only (0005), rimuove trigger/helper/seed RBAC.
-- ==========================================================================
-- 7) trigger
drop trigger if exists crm_customer_del_perm on public.crm_customer;
drop trigger if exists crm_company_del_perm  on public.crm_company;
drop trigger if exists crm_contact_del_perm  on public.crm_contact;
drop function if exists public.crm_enforce_delete_perm();

-- 6) policy CRM → tenant-only (come 0005)
do $$
declare t text; begin
  foreach t in array array['crm_company','crm_customer','crm_contact','crm_activity'] loop
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format('create policy %I_sel on public.%I for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) )', t, t);
    execute format('drop policy if exists %I_ins on public.%I', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check ( tenant_id = any (public.current_tenant_ids()) )', t, t);
  end loop;
  foreach t in array array['crm_company','crm_customer','crm_contact'] loop
    execute format('drop policy if exists %I_upd on public.%I', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using ( tenant_id = any (public.current_tenant_ids()) ) with check ( tenant_id = any (public.current_tenant_ids()) )', t, t);
  end loop;
end $$;

-- 4) helper RBAC
drop function if exists public.has_permission(uuid, text, text);
drop function if exists public.current_user_role(uuid);

-- 3/2/1) seed RBAC crm.*
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource like 'crm.%';
delete from security.role_perm_cache where resource like 'crm.%';
delete from public.permission where resource like 'crm.%';

-- 5) colonna soft-delete contact (reversibile in staging)
alter table public.crm_contact drop column if exists deleted_at;
-- ==========================================================================
