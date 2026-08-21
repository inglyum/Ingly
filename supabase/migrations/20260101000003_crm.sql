-- INGLY OS V2 — CRM slice (Fase 10) — STAGING ONLY
-- Implementa il design approvato (docs/v2/PHASE-9-CRM-DESIGN.md):
-- crm_company, crm_customer, crm_contact, crm_activity.
-- Tenant isolation (RLS via claim), FK, timestamps, soft-delete, indici (trigram),
-- audit/eventi delegati alle Edge/comandi (foundation gia' presente).
-- Rollback: supabase/rollback/20260101000003_crm_down.sql
-- Dipende da: 20260101000001_foundation_slice (tenant, current_tenant_ids()).
-- ==========================================================================

create extension if not exists pg_trgm;

-- ============================ CRM_COMPANY (aziende B2B) ============================
create table if not exists public.crm_company (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  vat text,
  address jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  deleted_at timestamptz
);

-- ============================ CRM_CUSTOMER (B2C/B2B) ============================
create table if not exists public.crm_customer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  company_id uuid references public.crm_company(id) on delete set null,
  type text not null default 'B2C' check (type in ('B2C','B2B')),
  name text not null,
  email text,
  phone text,
  address jsonb,
  segment text,
  tags text[] not null default '{}',
  notes text,
  value_cached numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  deleted_at timestamptz
);

-- ============================ CRM_CONTACT ============================
create table if not exists public.crm_contact (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.crm_customer(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- ============================ CRM_ACTIVITY (note/attività/follow-up) ============================
create table if not exists public.crm_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid references public.crm_customer(id) on delete cascade,
  type text not null default 'note' check (type in ('note','call','email','meeting','followup')),
  body text,
  occurred_at timestamptz not null default now(),
  actor_id uuid
);

-- ============================ INDICI (incl. trigram per ricerca) ============================
create index if not exists ix_crm_company_tenant   on public.crm_company (tenant_id);
create index if not exists ix_crm_company_name_trgm on public.crm_company using gin (name gin_trgm_ops);
create index if not exists ix_crm_customer_tenant_seg  on public.crm_customer (tenant_id, segment);
create index if not exists ix_crm_customer_tenant_type on public.crm_customer (tenant_id, type);
create index if not exists ix_crm_customer_tenant_del  on public.crm_customer (tenant_id, deleted_at);
create index if not exists ix_crm_customer_company     on public.crm_customer (tenant_id, company_id);
create index if not exists ix_crm_customer_name_trgm   on public.crm_customer using gin (name gin_trgm_ops);
create index if not exists ix_crm_customer_email_trgm  on public.crm_customer using gin (email gin_trgm_ops);
create index if not exists ix_crm_contact_customer  on public.crm_contact (tenant_id, customer_id);
create index if not exists ix_crm_activity_customer on public.crm_activity (tenant_id, customer_id, occurred_at);

-- ============================ RLS (tutte le tabelle public crm_*) ============================
alter table public.crm_company  enable row level security;
alter table public.crm_customer enable row level security;
alter table public.crm_contact  enable row level security;
alter table public.crm_activity enable row level security;

-- Pattern per tabella: SELECT/INSERT/UPDATE per tenant dell'utente (claim);
-- l'affinamento per azione/ruolo (has_permission) arriva con la cache permessi
-- (0002/0003 RBAC) — qui il confine primario e' il tenant (claim JWT).
-- crm_company
drop policy if exists crm_company_sel on public.crm_company;
create policy crm_company_sel on public.crm_company for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_company_ins on public.crm_company;
create policy crm_company_ins on public.crm_company for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_company_upd on public.crm_company;
create policy crm_company_upd on public.crm_company for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- crm_customer
drop policy if exists crm_customer_sel on public.crm_customer;
create policy crm_customer_sel on public.crm_customer for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_customer_ins on public.crm_customer;
create policy crm_customer_ins on public.crm_customer for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_customer_upd on public.crm_customer;
create policy crm_customer_upd on public.crm_customer for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- crm_contact
drop policy if exists crm_contact_sel on public.crm_contact;
create policy crm_contact_sel on public.crm_contact for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_contact_ins on public.crm_contact;
create policy crm_contact_ins on public.crm_contact for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_contact_upd on public.crm_contact;
create policy crm_contact_upd on public.crm_contact for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- crm_activity (append-only: no update/delete dai client)
drop policy if exists crm_activity_sel on public.crm_activity;
create policy crm_activity_sel on public.crm_activity for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_activity_ins on public.crm_activity;
create policy crm_activity_ins on public.crm_activity for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- Soft-delete: nessun DELETE per i client (si usa deleted_at via UPDATE/Edge).
revoke delete on public.crm_company, public.crm_customer, public.crm_contact, public.crm_activity from anon, authenticated;
-- crm_activity immutabile lato client
revoke update on public.crm_activity from anon, authenticated;

-- ==========================================================================
-- FINE CRM SLICE — applicare SOLO in staging, dopo review. Non toccare produzione.
-- ==========================================================================
