-- INGLY OS V2 — Preventivi (sales_quote + sales_quote_line) — STAGING ONLY.
-- Additiva e reversibile. Base del flusso Quote → Order → Invoice → Payment.
-- Riusa il modello RBAC di 0006 (has_permission + crm_enforce_delete_perm) e le
-- FK reali di CRM/Catalogo. NON tocca CRM/RBAC/produzione.
-- Dipende da: 0001, 0003 (crm_customer), 0006 (has_permission, trigger fn),
--             0007 (catalog_product).
-- Rollback: supabase/rollback/20260101000008_sales_quote_down.sql
-- ==========================================================================

-- 1) TESTATA preventivo ------------------------------------------------------
create table if not exists public.sales_quote (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid references public.crm_customer(id) on delete set null,
  number text,                       -- assegnato lato DB (trigger), per-tenant
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  customer_name text,                -- snapshot storico (indipendente dal CRM)
  issue_date date not null default current_date,
  valid_until date,                  -- default +7gg (trigger)
  notes text,
  subtotal numeric not null default 0,  -- ricalcolati lato DB dalle righe
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, number)
);
create index if not exists sales_quote_tenant_idx on public.sales_quote (tenant_id);
create index if not exists sales_quote_customer_idx on public.sales_quote (tenant_id, customer_id);

-- 2) RIGHE preventivo (snapshot prodotto: sopravvivono al delete del prodotto) -
create table if not exists public.sales_quote_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  quote_id uuid not null references public.sales_quote(id) on delete cascade,
  product_id uuid references public.catalog_product(id) on delete set null,
  description text not null,          -- snapshot: non dipende dal prodotto vivo
  quantity numeric not null default 1 check (quantity >= 0),
  unit_price numeric not null default 0,
  discount numeric not null default 0,  -- importo assoluto sulla riga
  tax numeric not null default 0,       -- importo assoluto sulla riga
  -- totale riga deterministico (colonna generata, mai dal browser)
  line_total numeric generated always as
    (round((quantity * unit_price) - discount + tax, 2)) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists sales_quote_line_quote_idx on public.sales_quote_line (quote_id);

-- 3) NUMERAZIONE per-tenant (race-safe) -------------------------------------
create table if not exists public.sales_quote_counter (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  next_val bigint not null default 1
);
alter table public.sales_quote_counter enable row level security;
-- nessuna policy: accessibile solo tramite la funzione SECURITY DEFINER.

create or replace function public.next_quote_number(p_tenant uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v bigint;
begin
  insert into public.sales_quote_counter as c (tenant_id, next_val)
    values (p_tenant, 2)
  on conflict (tenant_id) do update set next_val = c.next_val + 1
  returning c.next_val - 1 into v;   -- valore da consumare; il prossimo è +1
  return 'PREV-' || lpad(v::text, 6, '0');
end;
$$;
revoke execute on function public.next_quote_number(uuid) from public;
grant execute on function public.next_quote_number(uuid) to authenticated;

-- BEFORE INSERT: numero + valid_until di default (mai dal frontend)
create or replace function public.sales_quote_before_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := public.next_quote_number(new.tenant_id); end if;
  if new.valid_until is null then new.valid_until := coalesce(new.issue_date, current_date) + 7; end if;
  return new;
end;
$$;
drop trigger if exists sales_quote_bi on public.sales_quote;
create trigger sales_quote_bi before insert on public.sales_quote
  for each row execute function public.sales_quote_before_ins();

-- 4) TOTALI deterministici lato DB (ricalcolo dalle righe) -------------------
create or replace function public.sales_quote_recalc(p_quote uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sales_quote q set
    subtotal = coalesce((select sum(l.quantity * l.unit_price) from public.sales_quote_line l where l.quote_id = p_quote), 0),
    discount = coalesce((select sum(l.discount) from public.sales_quote_line l where l.quote_id = p_quote), 0),
    tax      = coalesce((select sum(l.tax) from public.sales_quote_line l where l.quote_id = p_quote), 0),
    total    = coalesce((select sum(l.line_total) from public.sales_quote_line l where l.quote_id = p_quote), 0),
    updated_at = now()
  where q.id = p_quote;
end;
$$;

create or replace function public.sales_quote_line_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sales_quote_recalc(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;
drop trigger if exists sales_quote_line_aiud on public.sales_quote_line;
create trigger sales_quote_line_aiud after insert or update or delete on public.sales_quote_line
  for each row execute function public.sales_quote_line_after();

-- 5) PERMESSI sales.quote (idempotenti, stessa matrice CRM) ------------------
insert into public.permission (resource, action) values
  ('sales.quote','read'),('sales.quote','create'),
  ('sales.quote','update'),('sales.quote','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'sales.quote', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'sales.quote'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- 6) RLS = tenant + has_permission (testata e righe, stesso resource) --------
alter table public.sales_quote enable row level security;
alter table public.sales_quote_line enable row level security;

drop policy if exists sales_quote_sel on public.sales_quote;
create policy sales_quote_sel on public.sales_quote for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','read') );
drop policy if exists sales_quote_ins on public.sales_quote;
create policy sales_quote_ins on public.sales_quote for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','create') );
drop policy if exists sales_quote_upd on public.sales_quote;
create policy sales_quote_upd on public.sales_quote for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists sales_quote_line_sel on public.sales_quote_line;
create policy sales_quote_line_sel on public.sales_quote_line for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','read') );
drop policy if exists sales_quote_line_ins on public.sales_quote_line;
create policy sales_quote_line_ins on public.sales_quote_line for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','update') );
drop policy if exists sales_quote_line_upd on public.sales_quote_line;
create policy sales_quote_line_upd on public.sales_quote_line for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists sales_quote_line_del on public.sales_quote_line;
create policy sales_quote_line_del on public.sales_quote_line for delete to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.quote','update') );

-- 7) SOFT-DELETE testata: nessuna policy DELETE; cambio deleted_at richiede
--    il permesso 'delete' (trigger condiviso di 0006).
drop trigger if exists sales_quote_del_perm on public.sales_quote;
create trigger sales_quote_del_perm before update on public.sales_quote
  for each row execute function public.crm_enforce_delete_perm('sales.quote');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
