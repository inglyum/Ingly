-- INGLY OS V2 — Catalogo prodotti/servizi (Fase ERP) — STAGING ONLY.
-- Additiva e reversibile. Riusa il modello RBAC di 0006 (has_permission +
-- trigger delete + soft-delete). NON tocca CRM/RBAC esistenti né produzione.
-- Dipende da: 0001 (tenant/role/permission), 0006 (has_permission, trigger fn).
-- Rollback: supabase/rollback/20260101000007_catalog_down.sql
-- ==========================================================================

-- 1) TABELLA catalog_product ------------------------------------------------
create table if not exists public.catalog_product (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  kind text not null default 'product' check (kind in ('product','service')),
  price numeric not null default 0,
  cost numeric not null default 0,
  unit text not null default 'pz',
  active boolean not null default true,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists catalog_product_tenant_idx on public.catalog_product (tenant_id);
create index if not exists catalog_product_name_idx on public.catalog_product (tenant_id, name);

-- 2) PERMESSI catalog.product (idempotenti) ---------------------------------
insert into public.permission (resource, action) values
  ('catalog.product','read'),('catalog.product','create'),
  ('catalog.product','update'),('catalog.product','delete')
on conflict (resource, action) do nothing;

-- role_perm_cache: read=tutti; create/update=OWNER/ADMIN/MANAGER/SALES;
-- delete=OWNER/ADMIN/MANAGER (stessa matrice del CRM).
insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'catalog.product', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where
  (a.action = 'read')
  or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
  or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

-- role_permission derivata (coerenza con public.permission)
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'catalog.product'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- 3) RLS = tenant + has_permission ------------------------------------------
alter table public.catalog_product enable row level security;

drop policy if exists catalog_product_sel on public.catalog_product;
create policy catalog_product_sel on public.catalog_product for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'catalog.product','read') );
drop policy if exists catalog_product_ins on public.catalog_product;
create policy catalog_product_ins on public.catalog_product for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'catalog.product','create') );
drop policy if exists catalog_product_upd on public.catalog_product;
create policy catalog_product_upd on public.catalog_product for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'catalog.product','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- 4) SOFT-DELETE: nessuna policy DELETE (hard-delete negato ai client);
-- il cambio di deleted_at richiede il permesso 'delete' (trigger riusato da 0006).
drop trigger if exists catalog_product_del_perm on public.catalog_product;
create trigger catalog_product_del_perm before update on public.catalog_product
  for each row execute function public.crm_enforce_delete_perm('catalog.product');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
