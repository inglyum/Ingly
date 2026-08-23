-- INGLY OS V2 — Fatture (sales_invoice + sales_invoice_line) — STAGING ONLY.
-- Additiva e reversibile. Terzo stadio: Order → Invoice → Payment.
-- Riusa RBAC/numerazione/totali di 0006/0008/0009. Numero fiscale con
-- progressivo ANNUALE per-tenant. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0003 (crm_customer), 0006 (has_permission, trigger fn),
--             0009 (sales_order).
-- Rollback: supabase/rollback/20260101000010_sales_invoice_down.sql
-- ==========================================================================

-- 1) TESTATA fattura ---------------------------------------------------------
create table if not exists public.sales_invoice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid references public.crm_customer(id) on delete set null,
  order_id uuid references public.sales_order(id) on delete set null,   -- provenienza
  number text,
  year int not null default extract(year from current_date)::int,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED')),
  customer_name text,               -- snapshot storico
  issue_date date not null default current_date,
  due_date date,                    -- default +30gg (trigger)
  notes text,
  subtotal numeric not null default 0,  -- imponibile
  discount numeric not null default 0,
  tax numeric not null default 0,       -- IVA
  total numeric not null default 0,
  paid_total numeric not null default 0, -- aggiornato dai pagamenti (modulo 0011)
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, number)
);
create index if not exists sales_invoice_tenant_idx on public.sales_invoice (tenant_id);
create index if not exists sales_invoice_customer_idx on public.sales_invoice (tenant_id, customer_id);

-- 2) RIGHE fattura (snapshot prodotto) --------------------------------------
create table if not exists public.sales_invoice_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  invoice_id uuid not null references public.sales_invoice(id) on delete cascade,
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
create index if not exists sales_invoice_line_invoice_idx on public.sales_invoice_line (invoice_id);

-- 3) NUMERAZIONE fiscale: progressivo ANNUALE per-tenant (FATT-2026-000001) --
create table if not exists public.sales_invoice_counter (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  year int not null,
  next_val bigint not null default 1,
  primary key (tenant_id, year)
);
alter table public.sales_invoice_counter enable row level security;

create or replace function public.next_invoice_number(p_tenant uuid, p_year int)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.sales_invoice_counter as c (tenant_id, year, next_val)
    values (p_tenant, p_year, 2)
  on conflict (tenant_id, year) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;
  return 'FATT-' || p_year::text || '-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_invoice_number(uuid, int) from public;
grant execute on function public.next_invoice_number(uuid, int) to authenticated;

create or replace function public.sales_invoice_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.year is null then new.year := extract(year from coalesce(new.issue_date, current_date))::int; end if;
  if new.number is null then new.number := public.next_invoice_number(new.tenant_id, new.year); end if;
  if new.due_date is null then new.due_date := coalesce(new.issue_date, current_date) + 30; end if;
  return new;
end;
$$;
drop trigger if exists sales_invoice_bi on public.sales_invoice;
create trigger sales_invoice_bi before insert on public.sales_invoice
  for each row execute function public.sales_invoice_before_ins();

-- 4) TOTALI deterministici lato DB ------------------------------------------
create or replace function public.sales_invoice_recalc(p_invoice uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sales_invoice i set
    subtotal = coalesce((select sum(l.quantity * l.unit_price) from public.sales_invoice_line l where l.invoice_id = p_invoice), 0),
    discount = coalesce((select sum(l.discount) from public.sales_invoice_line l where l.invoice_id = p_invoice), 0),
    tax      = coalesce((select sum(l.tax) from public.sales_invoice_line l where l.invoice_id = p_invoice), 0),
    total    = coalesce((select sum(l.line_total) from public.sales_invoice_line l where l.invoice_id = p_invoice), 0),
    updated_at = now()
  where i.id = p_invoice;
end;
$$;
create or replace function public.sales_invoice_line_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sales_invoice_recalc(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
drop trigger if exists sales_invoice_line_aiud on public.sales_invoice_line;
create trigger sales_invoice_line_aiud after insert or update or delete on public.sales_invoice_line
  for each row execute function public.sales_invoice_line_after();

-- 5) PERMESSI sales.invoice (idempotenti, stessa matrice CRM) ----------------
insert into public.permission (resource, action) values
  ('sales.invoice','read'),('sales.invoice','create'),
  ('sales.invoice','update'),('sales.invoice','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'sales.invoice', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'sales.invoice'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- 6) RLS = tenant + has_permission ------------------------------------------
alter table public.sales_invoice enable row level security;
alter table public.sales_invoice_line enable row level security;

drop policy if exists sales_invoice_sel on public.sales_invoice;
create policy sales_invoice_sel on public.sales_invoice for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','read') );
drop policy if exists sales_invoice_ins on public.sales_invoice;
create policy sales_invoice_ins on public.sales_invoice for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','create') );
drop policy if exists sales_invoice_upd on public.sales_invoice;
create policy sales_invoice_upd on public.sales_invoice for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists sales_invoice_line_sel on public.sales_invoice_line;
create policy sales_invoice_line_sel on public.sales_invoice_line for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','read') );
drop policy if exists sales_invoice_line_ins on public.sales_invoice_line;
create policy sales_invoice_line_ins on public.sales_invoice_line for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','update') );
drop policy if exists sales_invoice_line_upd on public.sales_invoice_line;
create policy sales_invoice_line_upd on public.sales_invoice_line for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists sales_invoice_line_del on public.sales_invoice_line;
create policy sales_invoice_line_del on public.sales_invoice_line for delete to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.invoice','update') );

-- 7) SOFT-DELETE testata (trigger condiviso di 0006) ------------------------
drop trigger if exists sales_invoice_del_perm on public.sales_invoice;
create trigger sales_invoice_del_perm before update on public.sales_invoice
  for each row execute function public.crm_enforce_delete_perm('sales.invoice');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
