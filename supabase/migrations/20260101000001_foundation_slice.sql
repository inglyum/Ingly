-- INGLY OS V2 — Foundation slice (Fase 4D) — STAGING ONLY — NON ESEGUITO
-- ==========================================================================
-- ATTENZIONE: scaffolding da revisionare. NON applicare in produzione.
-- Applicare SOLO su un progetto Supabase di staging dedicato, dopo review.
-- Slice: tenants, memberships, roles, permissions, role_permissions,
--        audit_log, domain_event, outbox, integration foundation, mutation_log.
-- Recepisce review V1 (B-1, W-1..W-11): RLS su TUTTE le tabelle public,
-- auth.jwt(), audit immutabile, aggregate_version CHECK, FK verso auth.users,
-- integration_credential protetta, indici foundation. Rollback: 0001_..._down.sql
-- RBAC seed + role_perm_cache: vedi 0002_rbac_seed.sql
-- ==========================================================================

create extension if not exists pgcrypto;

-- ---------- schemi interni (non esposti via PostgREST) ----------
create schema if not exists audit;
create schema if not exists events;
create schema if not exists integ;
create schema if not exists sync;
-- (schema `security` creato in 0002 dove serve role_perm_cache — W-11)

-- ============================ IDENTITY / TENANCY ============================
create table if not exists public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'starter',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.profile (
  id uuid primary key references auth.users(id) on delete cascade,  -- W-8
  full_name text,
  locale text default 'it',
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,  -- W-8
  status text not null default 'active',     -- active|invited|revoked
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- ============================ RBAC ============================
create table if not exists public.role (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,                  -- OWNER..VIEWER
  name text not null,
  level int not null
);

create table if not exists public.permission (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,                      -- create|read|update|delete|approve|export
  unique (resource, action)
);

create table if not exists public.role_permission (
  role_id uuid not null references public.role(id) on delete cascade,
  permission_id uuid not null references public.permission(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_role (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,  -- W-8
  role_id uuid not null references public.role(id),
  primary key (tenant_id, user_id)           -- un ruolo per utente/tenant (W-4 design)
);

-- ============================ AUDIT (immutabile) ============================
create table if not exists audit.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_id uuid,
  action text not null,
  resource text not null,
  resource_id uuid,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);

-- ============================ EVENTS / OUTBOX ============================
create table if not exists events.domain_event (
  event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  correlation_id uuid,
  causation_id uuid,
  idempotency_key text not null,
  processed_at timestamptz,
  status text not null default 'pending',
  constraint domain_event_aggver_positive check (aggregate_version > 0),  -- W-6
  unique (idempotency_key),
  unique (tenant_id, aggregate_type, aggregate_id, aggregate_version)
);

create table if not exists events.outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events.domain_event(event_id) on delete cascade,
  status text not null default 'pending',    -- pending|dispatched|failed
  dispatched_at timestamptz
);

-- dlq: nessun FK (conserva il riferimento anche se l'evento viene ripulito) — W-7
create table if not exists events.dlq (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  reason text,
  failed_at timestamptz not null default now()
);

-- ============================ INTEGRATION FOUNDATION ============================
create table if not exists integ.integration (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  kind text not null,                        -- stripe|whatsapp|sdi
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists integ.integration_credential (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  integration_id uuid not null references integ.integration(id) on delete cascade,
  secret_ref text not null                   -- riferimento a Vault, MAI il segreto in chiaro
);

-- ============================ SYNC / IDEMPOTENZA ============================
create table if not exists sync.mutation_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  client_mutation_id uuid not null,
  idempotency_key text not null,
  entity text not null,
  entity_id uuid,
  op text not null,
  applied_at timestamptz not null default now(),
  result text not null,                      -- applied|duplicate|conflict|rejected
  error text,
  unique (client_mutation_id),
  unique (idempotency_key)
);

-- ============================ INDICI FOUNDATION (W-9) ============================
create index if not exists ix_audit_log_tenant_time  on audit.audit_log (tenant_id, occurred_at);
create index if not exists ix_audit_log_resource     on audit.audit_log (resource, resource_id);
create index if not exists ix_domain_event_tenant    on events.domain_event (tenant_id, status, occurred_at);
create index if not exists ix_domain_event_aggregate on events.domain_event (aggregate_type, aggregate_id);
create index if not exists ix_outbox_status          on events.outbox (status);
create index if not exists ix_dlq_event              on events.dlq (event_id);
create index if not exists ix_membership_user        on public.tenant_membership (user_id);
create index if not exists ix_integration_tenant     on integ.integration (tenant_id);

-- ============================ HELPER (claim-based, HR-3 / W-1) ============================
-- Legge i tenant dal claim JWT via auth.jwt() (app_metadata.tenant_ids).
create or replace function public.current_tenant_ids()
returns uuid[]
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_agg((v)::uuid)
       from jsonb_array_elements_text(
         coalesce(auth.jwt() -> 'app_metadata' -> 'tenant_ids', '[]'::jsonb)) as v),
    array[]::uuid[]);
$$;
revoke execute on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;

-- ============================ RLS — TUTTE le tabelle public (B-1) ============================
alter table public.tenant            enable row level security;
alter table public.profile           enable row level security;
alter table public.tenant_membership enable row level security;
alter table public.role              enable row level security;
alter table public.permission        enable row level security;
alter table public.role_permission   enable row level security;
alter table public.user_role         enable row level security;
-- integ.* non è esposto via PostgREST, ma abilitiamo RLS per difesa in profondità
alter table integ.integration            enable row level security;
alter table integ.integration_credential enable row level security;

-- tenant: leggibile solo se membership dell'utente
drop policy if exists tenant_select on public.tenant;
create policy tenant_select on public.tenant
  for select to authenticated using ( id = any (public.current_tenant_ids()) );

-- profile: self read/update (B-1)
drop policy if exists profile_self_select on public.profile;
create policy profile_self_select on public.profile
  for select to authenticated using ( id = auth.uid() );
drop policy if exists profile_self_update on public.profile;
create policy profile_self_update on public.profile
  for update to authenticated using ( id = auth.uid() ) with check ( id = auth.uid() );

-- membership: self (policy semplice, non ricorsiva — HR-3)
drop policy if exists membership_self on public.tenant_membership;
create policy membership_self on public.tenant_membership
  for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) );

-- role / permission / role_permission: lookup globali → sola lettura (B-1)
drop policy if exists role_read on public.role;
create policy role_read on public.role
  for select to authenticated using ( true );
drop policy if exists permission_read on public.permission;
create policy permission_read on public.permission
  for select to authenticated using ( true );
drop policy if exists role_permission_read on public.role_permission;
create policy role_permission_read on public.role_permission
  for select to authenticated using ( true );
-- Nessuna policy di scrittura per authenticated su role/permission/role_permission
-- → INSERT/UPDATE/DELETE negati (solo service-role via Edge).

-- user_role: lettura ristretta al tenant
drop policy if exists user_role_read on public.user_role;
create policy user_role_read on public.user_role
  for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) );

-- integ.integration: per tenant
drop policy if exists integration_tenant on integ.integration;
create policy integration_tenant on integ.integration
  for all to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- integ.integration_credential: NESSUNA policy per authenticated → deny totale (B-2 / W-3)
-- (accesso solo service-role/Edge). Rafforziamo con revoke esplicito sotto.

-- ============================ IMMUTABILITÀ / PRIVILEGI (W-5) ============================
-- audit_log: solo INSERT; mai UPDATE/DELETE per ruoli client
revoke update, delete on audit.audit_log from anon, authenticated;
-- credenziali: nessun accesso ai ruoli client
revoke all on integ.integration_credential from anon, authenticated;

-- ==========================================================================
-- FINE SLICE — NON ESEGUITO IN QUESTA SESSIONE (staging non disponibile).
-- Rollback: supabase/rollback/20260101000001_foundation_slice_down.sql
-- ==========================================================================
