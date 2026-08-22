-- INGLY OS V2 — CRM server-side RBAC (Fase 14) — STAGING ONLY — NON APPLICATO QUI
-- ==========================================================================
-- Porta l'autorizzazione per AZIONE nel database: RLS = tenant boundary +
-- permission authorization. Usa il modello foundation esistente (role,
-- security.role_perm_cache, current_tenant_ids). NON crea un secondo RBAC/tenant.
--
-- Contenuto (idempotente, reversibile):
--  1) seed permission (crm.*.read/create/update/delete, crm.activity.read/create)
--  2) seed security.role_perm_cache (matrice ruolo→permesso)
--  3) role_permission (derivato, per completezza)
--  4) helper current_user_role(tenant) + has_permission(tenant,resource,action)
--  5) crm_contact.deleted_at (soft-delete)
--  6) policy CRM = tenant + has_permission (SELECT/INSERT/UPDATE)
--  7) trigger delete-perm: soft-delete (set deleted_at) richiede il permesso 'delete'
-- Dipende da: 0001,0002,0003,0005. Rollback: 20260101000006_crm_server_rbac_down.sql
-- ==========================================================================

-- 1) PERMISSION -------------------------------------------------------------
insert into public.permission (resource, action)
select res, act
from (values ('crm.company'),('crm.customer'),('crm.contact')) r(res),
     (values ('read'),('create'),('update'),('delete')) a(act)
on conflict (resource, action) do nothing;
insert into public.permission (resource, action)
values ('crm.activity','read'), ('crm.activity','create')
on conflict (resource, action) do nothing;

-- 2) ROLE_PERM_CACHE (matrice) ---------------------------------------------
-- company/customer/contact: read=tutti; create/update=OWNER,ADMIN,MANAGER,SALES;
--                            delete=OWNER,ADMIN,MANAGER
insert into security.role_perm_cache (role_key, resource, action)
select rk, res, act
from (values ('OWNER'),('ADMIN'),('MANAGER'),('SALES'),('VIEWER')) roles(rk),
     (values ('crm.company'),('crm.customer'),('crm.contact')) r(res),
     (values ('read'),('create'),('update'),('delete')) a(act)
where (act = 'read')
   or (act in ('create','update') and rk in ('OWNER','ADMIN','MANAGER','SALES'))
   or (act = 'delete'            and rk in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;
-- activity: read=tutti; create=OWNER,ADMIN,MANAGER,SALES; no update/delete
insert into security.role_perm_cache (role_key, resource, action)
select rk, 'crm.activity', act
from (values ('OWNER'),('ADMIN'),('MANAGER'),('SALES'),('VIEWER')) roles(rk),
     (values ('read'),('create')) a(act)
where (act = 'read')
   or (act = 'create' and rk in ('OWNER','ADMIN','MANAGER','SALES'))
on conflict (role_key, resource, action) do nothing;

-- 3) ROLE_PERMISSION (derivato dalla cache; per completezza del modello) -----
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from security.role_perm_cache c
join public.role r on r.key = c.role_key
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- 4) HELPER RBAC ------------------------------------------------------------
-- Ruolo dell'utente per un tenant: dal claim se presente, altrimenti da user_role.
create or replace function public.current_user_role(p_tenant uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' -> 'roles' ->> p_tenant::text),
    (select r.key from public.user_role ur
        join public.role r on r.id = ur.role_id
      where ur.user_id = auth.uid() and ur.tenant_id = p_tenant
      limit 1));
$$;
revoke execute on function public.current_user_role(uuid) from public;
grant execute on function public.current_user_role(uuid) to authenticated;

-- has_permission(tenant, resource, action): il ruolo dell'utente (per QUEL tenant)
-- possiede il permesso? Nessun permesso cross-tenant.
create or replace function public.has_permission(p_tenant uuid, p_resource text, p_action text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from security.role_perm_cache c
    where c.resource = p_resource
      and c.action   = p_action
      and c.role_key = public.current_user_role(p_tenant));
$$;
revoke execute on function public.has_permission(uuid, text, text) from public;
grant execute on function public.has_permission(uuid, text, text) to authenticated;

-- 5) SOFT-DELETE su crm_contact --------------------------------------------
alter table public.crm_contact add column if not exists deleted_at timestamptz;

-- 6) POLICY CRM = tenant + has_permission ----------------------------------
-- crm_company
drop policy if exists crm_company_sel on public.crm_company;
create policy crm_company_sel on public.crm_company for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.company','read') );
drop policy if exists crm_company_ins on public.crm_company;
create policy crm_company_ins on public.crm_company for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.company','create') );
drop policy if exists crm_company_upd on public.crm_company;
create policy crm_company_upd on public.crm_company for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.company','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.company','update') );

-- crm_customer
drop policy if exists crm_customer_sel on public.crm_customer;
create policy crm_customer_sel on public.crm_customer for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.customer','read') );
drop policy if exists crm_customer_ins on public.crm_customer;
create policy crm_customer_ins on public.crm_customer for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.customer','create') );
drop policy if exists crm_customer_upd on public.crm_customer;
create policy crm_customer_upd on public.crm_customer for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.customer','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.customer','update') );

-- crm_contact
drop policy if exists crm_contact_sel on public.crm_contact;
create policy crm_contact_sel on public.crm_contact for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.contact','read') );
drop policy if exists crm_contact_ins on public.crm_contact;
create policy crm_contact_ins on public.crm_contact for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.contact','create') );
drop policy if exists crm_contact_upd on public.crm_contact;
create policy crm_contact_upd on public.crm_contact for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.contact','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.contact','update') );

-- crm_activity: read/create con permesso; niente update/delete
drop policy if exists crm_activity_sel on public.crm_activity;
create policy crm_activity_sel on public.crm_activity for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.activity','read') );
drop policy if exists crm_activity_ins on public.crm_activity;
create policy crm_activity_ins on public.crm_activity for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'crm.activity','create') );

-- 7) TRIGGER delete-perm: il soft-delete (set/clear deleted_at) richiede 'delete'
create or replace function public.crm_enforce_delete_perm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.deleted_at is distinct from old.deleted_at) then
    if not public.has_permission(new.tenant_id, tg_argv[0], 'delete') then
      raise exception 'permission denied: delete su %', tg_argv[0] using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_customer_del_perm on public.crm_customer;
create trigger crm_customer_del_perm before update on public.crm_customer
  for each row execute function public.crm_enforce_delete_perm('crm.customer');
drop trigger if exists crm_company_del_perm on public.crm_company;
create trigger crm_company_del_perm before update on public.crm_company
  for each row execute function public.crm_enforce_delete_perm('crm.company');
drop trigger if exists crm_contact_del_perm on public.crm_contact;
create trigger crm_contact_del_perm before update on public.crm_contact
  for each row execute function public.crm_enforce_delete_perm('crm.contact');

-- ==========================================================================
-- RLS = tenant + authorization. Hard delete resta revocato (0003/0005).
-- Applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
