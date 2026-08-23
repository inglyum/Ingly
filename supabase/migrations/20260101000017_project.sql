-- INGLY OS V2 — Progetti/Commesse (project + project_task). STAGING ONLY.
-- Additiva e reversibile. Integra CRM → Cliente → Commessa → Ordini(ricavi) /
-- Acquisti(costi) → Margine, con task e avanzamento. Riusa RBAC/numerazione di
-- 0006/0009. Aggiunge project_id (nullable) a sales_order/purchase_order.
-- Dipende da: 0001, 0003 (crm_customer), 0006, 0009 (sales_order), 0014 (purchase_order).
-- Rollback: supabase/rollback/20260101000017_project_down.sql
-- ==========================================================================

create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid references public.crm_customer(id) on delete set null,
  code text,
  name text not null,
  status text not null default 'PLANNED'
    check (status in ('PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  customer_name text,               -- snapshot
  start_date date,
  due_date date,
  budget numeric not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, code)
);
create index if not exists project_tenant_idx on public.project (tenant_id);
create index if not exists project_customer_idx on public.project (tenant_id, customer_id);

create table if not exists public.project_task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  project_id uuid not null references public.project(id) on delete cascade,
  title text not null,
  status text not null default 'TODO' check (status in ('TODO','DOING','DONE')),
  assignee text,
  due_date date,
  estimated_hours numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists project_task_project_idx on public.project_task (project_id);

-- collegamento ordini/acquisti alla commessa (additivo, nullable)
alter table public.sales_order add column if not exists project_id uuid references public.project(id) on delete set null;
alter table public.purchase_order add column if not exists project_id uuid references public.project(id) on delete set null;
create index if not exists sales_order_project_idx on public.sales_order (project_id);
create index if not exists purchase_order_project_idx on public.purchase_order (project_id);

-- Numerazione per-tenant race-safe (PRJ-000001)
create table if not exists public.project_counter (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  next_val bigint not null default 1
);
alter table public.project_counter enable row level security;

create or replace function public.next_project_number(p_tenant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.project_counter as c (tenant_id, next_val) values (p_tenant, 2)
  on conflict (tenant_id) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;
  return 'PRJ-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_project_number(uuid) from public;
grant execute on function public.next_project_number(uuid) to authenticated;

create or replace function public.project_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.code is null then new.code := public.next_project_number(new.tenant_id); end if;
  return new;
end;
$$;
drop trigger if exists project_bi on public.project;
create trigger project_bi before insert on public.project
  for each row execute function public.project_before_ins();

-- PERMESSI project.project (matrice CRM)
insert into public.permission (resource, action) values
  ('project.project','read'),('project.project','create'),
  ('project.project','update'),('project.project','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'project.project', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'project.project'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission (project e task, stesso resource)
alter table public.project enable row level security;
alter table public.project_task enable row level security;

drop policy if exists project_sel on public.project;
create policy project_sel on public.project for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','read') );
drop policy if exists project_ins on public.project;
create policy project_ins on public.project for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','create') );
drop policy if exists project_upd on public.project;
create policy project_upd on public.project for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists project_task_sel on public.project_task;
create policy project_task_sel on public.project_task for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','read') );
drop policy if exists project_task_ins on public.project_task;
create policy project_task_ins on public.project_task for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','update') );
drop policy if exists project_task_upd on public.project_task;
create policy project_task_upd on public.project_task for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists project_task_del on public.project_task;
create policy project_task_del on public.project_task for delete to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'project.project','update') );

drop trigger if exists project_del_perm on public.project;
create trigger project_del_perm before update on public.project
  for each row execute function public.crm_enforce_delete_perm('project.project');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
