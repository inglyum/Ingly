-- INGLY OS V2 — Fornitori (supplier) — STAGING ONLY. Additiva e reversibile.
-- Base del ciclo passivo (Acquisti). Riusa RBAC/tenant di 0006. NON tocca
-- moduli esistenti/produzione.
-- Dipende da: 0001, 0006 (has_permission, crm_enforce_delete_perm).
-- Rollback: supabase/rollback/20260101000012_supplier_down.sql
-- ==========================================================================

create table if not exists public.supplier (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  vat text,
  email text,
  phone text,
  address jsonb,
  tags text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists supplier_tenant_idx on public.supplier (tenant_id);
create index if not exists supplier_name_idx on public.supplier (tenant_id, name);

-- PERMESSI purchasing.supplier (matrice CRM)
insert into public.permission (resource, action) values
  ('purchasing.supplier','read'),('purchasing.supplier','create'),
  ('purchasing.supplier','update'),('purchasing.supplier','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'purchasing.supplier', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'purchasing.supplier'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission
alter table public.supplier enable row level security;
drop policy if exists supplier_sel on public.supplier;
create policy supplier_sel on public.supplier for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.supplier','read') );
drop policy if exists supplier_ins on public.supplier;
create policy supplier_ins on public.supplier for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.supplier','create') );
drop policy if exists supplier_upd on public.supplier;
create policy supplier_upd on public.supplier for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.supplier','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists supplier_del_perm on public.supplier;
create trigger supplier_del_perm before update on public.supplier
  for each row execute function public.crm_enforce_delete_perm('purchasing.supplier');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
