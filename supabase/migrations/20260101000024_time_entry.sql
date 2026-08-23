-- INGLY OS V2 — Time Tracker (time_entry). STAGING ONLY.
-- Additiva e reversibile. Registra le ore di lavoro (fatturabili e non),
-- opzionalmente collegate a una commessa. Alimenta il KPI "ore fatturabili"
-- (KB ≥15h/settimana). Riusa RBAC/tenant di 0006. NON tocca moduli esistenti.
-- Dipende da: 0001, 0006, 0017 (project).
-- Rollback: supabase/rollback/20260101000024_time_entry_down.sql
-- ==========================================================================

create table if not exists public.time_entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  project_id uuid references public.project(id) on delete set null,
  description text not null,
  entry_date date not null default current_date,
  minutes int not null default 0 check (minutes >= 0),
  billable boolean not null default true,
  hourly_rate numeric not null default 18 check (hourly_rate >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists time_entry_tenant_idx on public.time_entry (tenant_id);
create index if not exists time_entry_date_idx on public.time_entry (entry_date) where deleted_at is null;
create index if not exists time_entry_project_idx on public.time_entry (project_id);

-- PERMESSI work.time (matrice CRM)
insert into public.permission (resource, action) values
  ('work.time','read'),('work.time','create'),
  ('work.time','update'),('work.time','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'work.time', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'work.time'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission
alter table public.time_entry enable row level security;
drop policy if exists time_entry_sel on public.time_entry;
create policy time_entry_sel on public.time_entry for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'work.time','read') );
drop policy if exists time_entry_ins on public.time_entry;
create policy time_entry_ins on public.time_entry for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'work.time','create') );
drop policy if exists time_entry_upd on public.time_entry;
create policy time_entry_upd on public.time_entry for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'work.time','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists time_entry_del_perm on public.time_entry;
create trigger time_entry_del_perm before update on public.time_entry
  for each row execute function public.crm_enforce_delete_perm('work.time');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
