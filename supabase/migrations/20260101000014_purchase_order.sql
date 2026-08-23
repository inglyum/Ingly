-- INGLY OS V2 — Ordini di acquisto (purchase_order + purchase_order_line).
-- STAGING ONLY. Additiva e reversibile. Ciclo passivo: Supplier → Purchase Order
-- → (ricezione a magazzino, blocco 2). Riusa RBAC/numerazione/totali di
-- 0006/0009. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0006, 0007 (catalog_product), 0012 (supplier).
-- Rollback: supabase/rollback/20260101000014_purchase_order_down.sql
-- ==========================================================================

create table if not exists public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  supplier_id uuid references public.supplier(id) on delete set null,
  number text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  supplier_name text,               -- snapshot storico
  order_date date not null default current_date,
  expected_date date,               -- ricezione prevista
  notes text,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, number)
);
create index if not exists purchase_order_tenant_idx on public.purchase_order (tenant_id);
create index if not exists purchase_order_supplier_idx on public.purchase_order (tenant_id, supplier_id);

create table if not exists public.purchase_order_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_order(id) on delete cascade,
  product_id uuid references public.catalog_product(id) on delete set null,
  description text not null,
  quantity numeric not null default 1 check (quantity >= 0),
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  line_total numeric generated always as
    (round((quantity * unit_price) - discount + tax, 2)) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists purchase_order_line_po_idx on public.purchase_order_line (purchase_order_id);

-- Numerazione per-tenant race-safe (ACQ-000001)
create table if not exists public.purchase_order_counter (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  next_val bigint not null default 1
);
alter table public.purchase_order_counter enable row level security;

create or replace function public.next_purchase_number(p_tenant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.purchase_order_counter as c (tenant_id, next_val)
    values (p_tenant, 2)
  on conflict (tenant_id) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;
  return 'ACQ-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_purchase_number(uuid) from public;
grant execute on function public.next_purchase_number(uuid) to authenticated;

create or replace function public.purchase_order_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := public.next_purchase_number(new.tenant_id); end if;
  return new;
end;
$$;
drop trigger if exists purchase_order_bi on public.purchase_order;
create trigger purchase_order_bi before insert on public.purchase_order
  for each row execute function public.purchase_order_before_ins();

create or replace function public.purchase_order_recalc(p_po uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.purchase_order o set
    subtotal = coalesce((select sum(l.quantity * l.unit_price) from public.purchase_order_line l where l.purchase_order_id = p_po), 0),
    discount = coalesce((select sum(l.discount) from public.purchase_order_line l where l.purchase_order_id = p_po), 0),
    tax      = coalesce((select sum(l.tax) from public.purchase_order_line l where l.purchase_order_id = p_po), 0),
    total    = coalesce((select sum(l.line_total) from public.purchase_order_line l where l.purchase_order_id = p_po), 0),
    updated_at = now()
  where o.id = p_po;
end;
$$;
create or replace function public.purchase_order_line_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.purchase_order_recalc(coalesce(new.purchase_order_id, old.purchase_order_id));
  return null;
end;
$$;
drop trigger if exists purchase_order_line_aiud on public.purchase_order_line;
create trigger purchase_order_line_aiud after insert or update or delete on public.purchase_order_line
  for each row execute function public.purchase_order_line_after();

-- PERMESSI purchasing.order (matrice CRM)
insert into public.permission (resource, action) values
  ('purchasing.order','read'),('purchasing.order','create'),
  ('purchasing.order','update'),('purchasing.order','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'purchasing.order', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'purchasing.order'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission
alter table public.purchase_order enable row level security;
alter table public.purchase_order_line enable row level security;

drop policy if exists purchase_order_sel on public.purchase_order;
create policy purchase_order_sel on public.purchase_order for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','read') );
drop policy if exists purchase_order_ins on public.purchase_order;
create policy purchase_order_ins on public.purchase_order for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','create') );
drop policy if exists purchase_order_upd on public.purchase_order;
create policy purchase_order_upd on public.purchase_order for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists purchase_order_line_sel on public.purchase_order_line;
create policy purchase_order_line_sel on public.purchase_order_line for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','read') );
drop policy if exists purchase_order_line_ins on public.purchase_order_line;
create policy purchase_order_line_ins on public.purchase_order_line for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','update') );
drop policy if exists purchase_order_line_upd on public.purchase_order_line;
create policy purchase_order_line_upd on public.purchase_order_line for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists purchase_order_line_del on public.purchase_order_line;
create policy purchase_order_line_del on public.purchase_order_line for delete to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'purchasing.order','update') );

drop trigger if exists purchase_order_del_perm on public.purchase_order;
create trigger purchase_order_del_perm before update on public.purchase_order
  for each row execute function public.crm_enforce_delete_perm('purchasing.order');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
