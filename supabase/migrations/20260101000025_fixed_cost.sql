-- INGLY OS V2 — Costi fissi (fixed_cost). STAGING ONLY.
-- Additiva e reversibile. Costi ricorrenti strutturali (affitto, software,
-- utenze…) normalizzati al mese per il burn e il break-even. Riusa RBAC/tenant
-- di 0006. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0006.
-- Rollback: supabase/rollback/20260101000025_fixed_cost_down.sql
-- ==========================================================================

create table if not exists public.fixed_cost (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  category text,
  amount numeric not null default 0 check (amount >= 0),
  cadence text not null default 'monthly'
    check (cadence in ('weekly','monthly','quarterly','yearly')),
  active boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists fixed_cost_tenant_idx on public.fixed_cost (tenant_id);

insert into public.permission (resource, action) values
  ('finance.fixed_cost','read'),('finance.fixed_cost','create'),
  ('finance.fixed_cost','update'),('finance.fixed_cost','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'finance.fixed_cost', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'finance.fixed_cost'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

alter table public.fixed_cost enable row level security;
drop policy if exists fixed_cost_sel on public.fixed_cost;
create policy fixed_cost_sel on public.fixed_cost for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'finance.fixed_cost','read') );
drop policy if exists fixed_cost_ins on public.fixed_cost;
create policy fixed_cost_ins on public.fixed_cost for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'finance.fixed_cost','create') );
drop policy if exists fixed_cost_upd on public.fixed_cost;
create policy fixed_cost_upd on public.fixed_cost for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'finance.fixed_cost','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists fixed_cost_del_perm on public.fixed_cost;
create trigger fixed_cost_del_perm before update on public.fixed_cost
  for each row execute function public.crm_enforce_delete_perm('finance.fixed_cost');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
