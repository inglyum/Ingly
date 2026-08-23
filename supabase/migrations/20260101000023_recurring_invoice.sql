-- INGLY OS V2 — Fatture ricorrenti (recurring_invoice). STAGING ONLY.
-- Additiva e reversibile. Template di fatturazione periodica: alla scadenza
-- genera una fattura reale riusando il ciclo fatture esistente (numerazione
-- fiscale, RLS). NON duplica le fatture: è solo la sorgente del template.
-- Riusa RBAC/tenant di 0006. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0003 (crm_customer), 0006, 0010 (sales_invoice).
-- Rollback: supabase/rollback/20260101000023_recurring_invoice_down.sql
-- ==========================================================================

create table if not exists public.recurring_invoice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid references public.crm_customer(id) on delete set null,
  customer_name text,
  description text not null,
  amount numeric not null default 0 check (amount >= 0),   -- imponibile per emissione
  vat_rate numeric not null default 22 check (vat_rate >= 0 and vat_rate <= 100),
  cadence text not null default 'monthly'
    check (cadence in ('weekly','monthly','quarterly','yearly')),
  next_run_date date not null default current_date,
  active boolean not null default true,
  notes text,
  last_generated_at timestamptz,
  last_invoice_id uuid references public.sales_invoice(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists recurring_invoice_tenant_idx on public.recurring_invoice (tenant_id);
create index if not exists recurring_invoice_next_idx on public.recurring_invoice (next_run_date) where deleted_at is null and active;

-- PERMESSI sales.recurring (matrice CRM)
insert into public.permission (resource, action) values
  ('sales.recurring','read'),('sales.recurring','create'),
  ('sales.recurring','update'),('sales.recurring','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'sales.recurring', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'sales.recurring'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission
alter table public.recurring_invoice enable row level security;
drop policy if exists recurring_invoice_sel on public.recurring_invoice;
create policy recurring_invoice_sel on public.recurring_invoice for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.recurring','read') );
drop policy if exists recurring_invoice_ins on public.recurring_invoice;
create policy recurring_invoice_ins on public.recurring_invoice for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.recurring','create') );
drop policy if exists recurring_invoice_upd on public.recurring_invoice;
create policy recurring_invoice_upd on public.recurring_invoice for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.recurring','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists recurring_invoice_del_perm on public.recurring_invoice;
create trigger recurring_invoice_del_perm before update on public.recurring_invoice
  for each row execute function public.crm_enforce_delete_perm('sales.recurring');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
