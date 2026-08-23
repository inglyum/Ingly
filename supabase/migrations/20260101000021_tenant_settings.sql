-- INGLY OS V2 — Impostazioni ERP per tenant (tenant_settings). STAGING ONLY.
-- Additiva e reversibile. Singleton per tenant (PK = tenant_id): dati azienda,
-- fisco (IVA default), pricing (tariffa lavoro, sfrido, markup canale),
-- numerazione (prefissi), cassa profit-first (percentuali). I DEFAULT ricalcano
-- la Knowledge Base. NB: in questa fase le impostazioni sono SOLO memorizzate
-- (default-OFF): NON vengono ancora cablate nei calcoli di pricing/numerazione,
-- che restano autoritativi lato server con i valori KB correnti. Il cablaggio
-- sarà una modifica separata, esplicita e approvata (no cambio logica business).
-- Riusa RBAC/tenant di 0006. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0006.
-- Rollback: supabase/rollback/20260101000021_tenant_settings_down.sql
-- ==========================================================================

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  -- Azienda
  company_name text,
  vat_number text,
  address text,
  city text,
  email text,
  phone text,
  -- Fisco
  default_vat_rate numeric not null default 22 check (default_vat_rate >= 0 and default_vat_rate <= 100),
  -- Pricing (default = KB)
  labor_rate numeric not null default 18 check (labor_rate >= 0),
  sfrido_pct numeric not null default 15 check (sfrido_pct >= 0 and sfrido_pct <= 100),
  markup_b2c numeric not null default 3 check (markup_b2c > 0),
  markup_b2b numeric not null default 2.5 check (markup_b2b > 0),
  markup_etsy numeric not null default 3.5 check (markup_etsy > 0),
  -- Numerazione (prefissi documenti)
  quote_prefix text not null default 'PREV',
  order_prefix text not null default 'ORD',
  invoice_prefix text not null default 'FATT',
  -- Cassa profit-first (percentuali, default = KB 15/10/15/60)
  cash_tax_pct numeric not null default 15 check (cash_tax_pct >= 0 and cash_tax_pct <= 100),
  cash_reserve_pct numeric not null default 10 check (cash_reserve_pct >= 0 and cash_reserve_pct <= 100),
  cash_goals_pct numeric not null default 15 check (cash_goals_pct >= 0 and cash_goals_pct <= 100),
  cash_operational_pct numeric not null default 60 check (cash_operational_pct >= 0 and cash_operational_pct <= 100),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- PERMESSI settings.tenant: lettura a tutti; scrittura solo OWNER/ADMIN
-- (le impostazioni sono sensibili e governano numerazione/fisco/pricing).
insert into public.permission (resource, action) values
  ('settings.tenant','read'),('settings.tenant','update')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'settings.tenant', a.action
from public.role r
cross join (values ('read'),('update')) as a(action)
where (a.action = 'read')
   or (a.action = 'update' and r.key in ('OWNER','ADMIN'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'settings.tenant'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission. La INSERT del singleton è governata dal
-- permesso di update (prima scrittura = upsert delle impostazioni).
alter table public.tenant_settings enable row level security;
drop policy if exists tenant_settings_sel on public.tenant_settings;
create policy tenant_settings_sel on public.tenant_settings for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'settings.tenant','read') );
drop policy if exists tenant_settings_ins on public.tenant_settings;
create policy tenant_settings_ins on public.tenant_settings for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'settings.tenant','update') );
drop policy if exists tenant_settings_upd on public.tenant_settings;
create policy tenant_settings_upd on public.tenant_settings for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'settings.tenant','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
