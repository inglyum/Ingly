-- INGLY OS V2 — Attrezzature / Macchine (equipment) + costo/mq materiali.
-- STAGING ONLY. Additiva e reversibile. Anagrafica macchine con tariffe REALI
-- (€/min, €/h) che alimentano la categoria Laser/Macchina dello Smart Quoter
-- come "risorsa da listino". Aggiunge anche cost_per_mq al catalogo per
-- materiali/vernici. Nessuna seconda anagrafica risorse: il Quoter LEGGE queste.
-- Riusa RBAC/tenant di 0006. Dipende da: 0001, 0006, 0007 (catalog).
-- Rollback: supabase/rollback/20260101000029_equipment_down.sql
-- ==========================================================================

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  category text,                        -- laser/uv/cnc/printer/other (libero)
  cost_per_min numeric not null default 0 check (cost_per_min >= 0),
  hourly_cost numeric,                  -- opzionale (€/h)
  power_w numeric,                      -- opzionale (consumo)
  notes text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists equipment_tenant_idx on public.equipment (tenant_id);

-- Costo per mq per materiali/vernici del catalogo (nullable, additivo).
alter table public.catalog_product add column if not exists cost_per_mq numeric;

insert into public.permission (resource, action) values
  ('assets.equipment','read'),('assets.equipment','create'),
  ('assets.equipment','update'),('assets.equipment','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'assets.equipment', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'assets.equipment'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

alter table public.equipment enable row level security;
drop policy if exists equipment_sel on public.equipment;
create policy equipment_sel on public.equipment for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'assets.equipment','read') );
drop policy if exists equipment_ins on public.equipment;
create policy equipment_ins on public.equipment for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'assets.equipment','create') );
drop policy if exists equipment_upd on public.equipment;
create policy equipment_upd on public.equipment for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'assets.equipment','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists equipment_del_perm on public.equipment;
create trigger equipment_del_perm before update on public.equipment
  for each row execute function public.crm_enforce_delete_perm('assets.equipment');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
