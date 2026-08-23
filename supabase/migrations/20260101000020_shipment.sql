-- INGLY OS V2 — Logistica: spedizioni (shipment + shipment_line). STAGING ONLY.
-- Additiva e reversibile. Workflow Ordine → Preparazione → Picking → Packing →
-- Spedizione → Consegna. Lo SCARICO stock (movimenti OUT) avviene alla
-- SPEDIZIONE (merce che lascia il magazzino); la consegna aggiorna solo gli
-- stati → nessun movimento duplicato. Riusa RBAC/numerazione di 0006/0009 e il
-- ledger stock_movement (0015). NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0003 (crm_customer), 0006, 0007, 0009 (sales_order), 0015.
-- Rollback: supabase/rollback/20260101000020_shipment_down.sql
-- ==========================================================================

create table if not exists public.shipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  order_id uuid references public.sales_order(id) on delete set null,
  customer_id uuid references public.crm_customer(id) on delete set null,
  customer_name text,
  number text,
  status text not null default 'PREPARING'
    check (status in ('PREPARING','PICKED','PACKED','SHIPPED','DELIVERED','CANCELLED')),
  carrier text,
  tracking text,
  ship_address text,
  packages int,
  weight_kg numeric,
  expected_date date,
  shipped_date date,
  delivered_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, number)
);
create index if not exists shipment_tenant_idx on public.shipment (tenant_id);
create index if not exists shipment_order_idx on public.shipment (order_id);

create table if not exists public.shipment_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  shipment_id uuid not null references public.shipment(id) on delete cascade,
  product_id uuid references public.catalog_product(id) on delete set null,
  description text not null,
  qty_ordered numeric not null default 0,
  qty_prepared numeric not null default 0,
  qty_shipped numeric not null default 0,
  qty_delivered numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists shipment_line_ship_idx on public.shipment_line (shipment_id);

create table if not exists public.shipment_counter (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  next_val bigint not null default 1
);
alter table public.shipment_counter enable row level security;

create or replace function public.next_shipment_number(p_tenant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.shipment_counter as c (tenant_id, next_val) values (p_tenant, 2)
  on conflict (tenant_id) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;
  return 'SPED-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_shipment_number(uuid) from public;
grant execute on function public.next_shipment_number(uuid) to authenticated;

create or replace function public.shipment_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := public.next_shipment_number(new.tenant_id); end if;
  return new;
end;
$$;
drop trigger if exists shipment_bi on public.shipment;
create trigger shipment_bi before insert on public.shipment
  for each row execute function public.shipment_before_ins();

-- PERMESSI logistics.shipment (matrice CRM)
insert into public.permission (resource, action) values
  ('logistics.shipment','read'),('logistics.shipment','create'),
  ('logistics.shipment','update'),('logistics.shipment','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'logistics.shipment', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'logistics.shipment'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission (spedizione + righe, stesso resource)
alter table public.shipment enable row level security;
alter table public.shipment_line enable row level security;

drop policy if exists shipment_sel on public.shipment;
create policy shipment_sel on public.shipment for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','read') );
drop policy if exists shipment_ins on public.shipment;
create policy shipment_ins on public.shipment for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','create') );
drop policy if exists shipment_upd on public.shipment;
create policy shipment_upd on public.shipment for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists shipment_line_sel on public.shipment_line;
create policy shipment_line_sel on public.shipment_line for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','read') );
drop policy if exists shipment_line_ins on public.shipment_line;
create policy shipment_line_ins on public.shipment_line for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','update') );
drop policy if exists shipment_line_upd on public.shipment_line;
create policy shipment_line_upd on public.shipment_line for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists shipment_line_del on public.shipment_line;
create policy shipment_line_del on public.shipment_line for delete to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'logistics.shipment','update') );

drop trigger if exists shipment_del_perm on public.shipment;
create trigger shipment_del_perm before update on public.shipment
  for each row execute function public.crm_enforce_delete_perm('logistics.shipment');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
