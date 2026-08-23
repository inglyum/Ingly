-- INGLY OS V2 — Produzione: distinte base + ordini di produzione. STAGING ONLY.
-- Additiva e reversibile. Integra Catalogo (prodotto finito + componenti) e
-- Magazzino (consumo componenti OUT + carico prodotto finito IN al completamento).
-- Riusa RBAC/numerazione di 0006/0009. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0006, 0007 (catalog_product).
-- Rollback: supabase/rollback/20260101000019_production_down.sql
-- ==========================================================================

-- Distinta base (BOM): quali componenti servono per un prodotto finito
create table if not exists public.production_bom (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  product_id uuid not null references public.catalog_product(id) on delete cascade,  -- prodotto finito
  name text not null,
  active boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists production_bom_tenant_idx on public.production_bom (tenant_id);
create index if not exists production_bom_product_idx on public.production_bom (tenant_id, product_id);

create table if not exists public.production_bom_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  bom_id uuid not null references public.production_bom(id) on delete cascade,
  component_product_id uuid not null references public.catalog_product(id) on delete cascade,
  quantity numeric not null default 1 check (quantity > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists production_bom_line_bom_idx on public.production_bom_line (bom_id);

-- Ordine di produzione
create table if not exists public.production_order (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  product_id uuid not null references public.catalog_product(id) on delete cascade,
  bom_id uuid references public.production_bom(id) on delete set null,
  number text,
  quantity numeric not null default 1 check (quantity > 0),
  status text not null default 'PLANNED'
    check (status in ('PLANNED','IN_PROGRESS','DONE','CANCELLED')),
  start_date date,
  due_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, number)
);
create index if not exists production_order_tenant_idx on public.production_order (tenant_id);

create table if not exists public.production_order_counter (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  next_val bigint not null default 1
);
alter table public.production_order_counter enable row level security;

create or replace function public.next_production_number(p_tenant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.production_order_counter as c (tenant_id, next_val) values (p_tenant, 2)
  on conflict (tenant_id) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;
  return 'PRD-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_production_number(uuid) from public;
grant execute on function public.next_production_number(uuid) to authenticated;

create or replace function public.production_order_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := public.next_production_number(new.tenant_id); end if;
  return new;
end;
$$;
drop trigger if exists production_order_bi on public.production_order;
create trigger production_order_bi before insert on public.production_order
  for each row execute function public.production_order_before_ins();

-- PERMESSI production.order (matrice CRM) — copre BOM e ordini
insert into public.permission (resource, action) values
  ('production.order','read'),('production.order','create'),
  ('production.order','update'),('production.order','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'production.order', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'production.order'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission (tutte e tre le tabelle, stesso resource)
do $$
declare t text;
begin
  foreach t in array array['production_bom','production_bom_line','production_order'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format($f$create policy %1$I_sel on public.%1$I for select to authenticated
      using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'production.order','read') )$f$, t);
    execute format('drop policy if exists %I_ins on public.%I', t, t);
    execute format($f$create policy %1$I_ins on public.%1$I for insert to authenticated
      with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'production.order','create') )$f$, t);
    execute format('drop policy if exists %I_upd on public.%I', t, t);
    execute format($f$create policy %1$I_upd on public.%1$I for update to authenticated
      using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'production.order','update') )
      with check ( tenant_id = any (public.current_tenant_ids()) )$f$, t);
    execute format('drop policy if exists %I_del on public.%I', t, t);
    execute format($f$create policy %1$I_del on public.%1$I for delete to authenticated
      using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'production.order','update') )$f$, t);
  end loop;
end $$;

drop trigger if exists production_order_del_perm on public.production_order;
create trigger production_order_del_perm before update on public.production_order
  for each row execute function public.crm_enforce_delete_perm('production.order');
drop trigger if exists production_bom_del_perm on public.production_bom;
create trigger production_bom_del_perm before update on public.production_bom
  for each row execute function public.crm_enforce_delete_perm('production.order');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
