-- INGLY OS V2 — Ordini (sales_order + sales_order_line) — STAGING ONLY.
-- Additiva e reversibile. Secondo stadio del flusso Quote → Order → Invoice →
-- Payment. Riusa il modello RBAC/numerazione/totali di 0006/0008. NON tocca
-- CRM/Preventivi/RBAC/produzione.
-- Dipende da: 0001, 0003 (crm_customer), 0006 (has_permission, trigger fn),
--             0007 (catalog_product), 0008 (sales_quote).
-- Rollback: supabase/rollback/20260101000009_sales_order_down.sql
-- ==========================================================================

-- 1) TESTATA ordine ----------------------------------------------------------
create table if not exists public.sales_order (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid references public.crm_customer(id) on delete set null,
  quote_id uuid references public.sales_quote(id) on delete set null,  -- provenienza
  number text,
  status text not null default 'CONFIRMED'
    check (status in ('CONFIRMED','IN_PRODUCTION','READY','DELIVERED','CANCELLED')),
  customer_name text,               -- snapshot storico
  order_date date not null default current_date,
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
create index if not exists sales_order_tenant_idx on public.sales_order (tenant_id);
create index if not exists sales_order_customer_idx on public.sales_order (tenant_id, customer_id);

-- 2) RIGHE ordine (snapshot prodotto) ---------------------------------------
create table if not exists public.sales_order_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  order_id uuid not null references public.sales_order(id) on delete cascade,
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
create index if not exists sales_order_line_order_idx on public.sales_order_line (order_id);

-- 3) NUMERAZIONE per-tenant race-safe (ORD-000001) --------------------------
create table if not exists public.sales_order_counter (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  next_val bigint not null default 1
);
alter table public.sales_order_counter enable row level security;

create or replace function public.next_order_number(p_tenant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.sales_order_counter as c (tenant_id, next_val)
    values (p_tenant, 2)
  on conflict (tenant_id) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;
  return 'ORD-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_order_number(uuid) from public;
grant execute on function public.next_order_number(uuid) to authenticated;

create or replace function public.sales_order_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := public.next_order_number(new.tenant_id); end if;
  return new;
end;
$$;
drop trigger if exists sales_order_bi on public.sales_order;
create trigger sales_order_bi before insert on public.sales_order
  for each row execute function public.sales_order_before_ins();

-- 4) TOTALI deterministici lato DB ------------------------------------------
create or replace function public.sales_order_recalc(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sales_order o set
    subtotal = coalesce((select sum(l.quantity * l.unit_price) from public.sales_order_line l where l.order_id = p_order), 0),
    discount = coalesce((select sum(l.discount) from public.sales_order_line l where l.order_id = p_order), 0),
    tax      = coalesce((select sum(l.tax) from public.sales_order_line l where l.order_id = p_order), 0),
    total    = coalesce((select sum(l.line_total) from public.sales_order_line l where l.order_id = p_order), 0),
    updated_at = now()
  where o.id = p_order;
end;
$$;
create or replace function public.sales_order_line_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sales_order_recalc(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
drop trigger if exists sales_order_line_aiud on public.sales_order_line;
create trigger sales_order_line_aiud after insert or update or delete on public.sales_order_line
  for each row execute function public.sales_order_line_after();

-- 5) PERMESSI sales.order (idempotenti, stessa matrice CRM) ------------------
insert into public.permission (resource, action) values
  ('sales.order','read'),('sales.order','create'),
  ('sales.order','update'),('sales.order','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'sales.order', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'sales.order'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- 6) RLS = tenant + has_permission ------------------------------------------
alter table public.sales_order enable row level security;
alter table public.sales_order_line enable row level security;

drop policy if exists sales_order_sel on public.sales_order;
create policy sales_order_sel on public.sales_order for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','read') );
drop policy if exists sales_order_ins on public.sales_order;
create policy sales_order_ins on public.sales_order for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','create') );
drop policy if exists sales_order_upd on public.sales_order;
create policy sales_order_upd on public.sales_order for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists sales_order_line_sel on public.sales_order_line;
create policy sales_order_line_sel on public.sales_order_line for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','read') );
drop policy if exists sales_order_line_ins on public.sales_order_line;
create policy sales_order_line_ins on public.sales_order_line for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','update') );
drop policy if exists sales_order_line_upd on public.sales_order_line;
create policy sales_order_line_upd on public.sales_order_line for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists sales_order_line_del on public.sales_order_line;
create policy sales_order_line_del on public.sales_order_line for delete to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.order','update') );

-- 7) SOFT-DELETE testata (trigger condiviso di 0006) ------------------------
drop trigger if exists sales_order_del_perm on public.sales_order;
create trigger sales_order_del_perm before update on public.sales_order
  for each row execute function public.crm_enforce_delete_perm('sales.order');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
