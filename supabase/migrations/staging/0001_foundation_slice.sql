-- INGLY OS V2 — Foundation slice (Fase 4D) — STAGING ONLY — NON ESEGUITO
-- ==========================================================================
-- ATTENZIONE: scaffolding da revisionare. NON applicare in produzione.
-- Applicare SOLO su un progetto Supabase di staging dedicato, dopo review.
-- Slice: tenants, memberships, roles, permissions, role_permissions,
--        audit_log, domain_event, outbox, integration foundation, mutation_log.
-- Recepisce: RLS via claim JWT (HR-3), audit immutabile, outbox+aggregate_version.
-- ==========================================================================

create extension if not exists pgcrypto;

-- ---------- schemi interni (non esposti via PostgREST) ----------
create schema if not exists audit;
create schema if not exists events;
create schema if not exists integ;
create schema if not exists sync;
create schema if not exists security;

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
  id uuid primary key,                       -- = auth.users.id
  full_name text,
  locale text default 'it',
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  user_id uuid not null,                     -- auth.users.id
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
  user_id uuid not null,
  role_id uuid not null references public.role(id),
  primary key (tenant_id, user_id)
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
-- immutabilità: solo INSERT (nessun update/delete concesso ai ruoli normali)

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
  unique (idempotency_key),
  unique (tenant_id, aggregate_type, aggregate_id, aggregate_version)
);

create table if not exists events.outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events.domain_event(event_id) on delete cascade,
  status text not null default 'pending',    -- pending|dispatched|failed
  dispatched_at timestamptz
);

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

-- ============================ HELPER (claim-based, HR-3) ============================
-- Legge i tenant dal claim JWT (app_metadata.tenant_ids), NON da subquery ricorsive.
create or replace function public.current_tenant_ids()
returns uuid[]
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_agg((v)::uuid)
       from jsonb_array_elements_text(
         coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb
                    -> 'app_metadata' -> 'tenant_ids', '[]'::jsonb)) as v),
    array[]::uuid[]);
$$;
revoke execute on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;

-- has_permission: legge ruolo dal claim + mappa ruolo->permessi (cache in security)
-- (Scaffolding: implementazione completa nella fase di implementazione staging.)

-- ============================ RLS (enable + policy base) ============================
alter table public.tenant enable row level security;
alter table public.tenant_membership enable row level security;
alter table public.user_role enable row level security;
alter table integ.integration enable row level security;
-- (audit/events/sync: NON esposti; accesso solo service-role/Edge)

-- tenant: leggibile solo se membership dell'utente
drop policy if exists tenant_select on public.tenant;
create policy tenant_select on public.tenant
  for select using ( id = any (public.current_tenant_ids()) );

-- membership: self-membership (policy semplice, non ricorsiva — HR-3)
drop policy if exists membership_self on public.tenant_membership;
create policy membership_self on public.tenant_membership
  for select using ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists user_role_read on public.user_role;
create policy user_role_read on public.user_role
  for select using ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists integration_tenant on integ.integration;
create policy integration_tenant on integ.integration
  for all using ( tenant_id = any (public.current_tenant_ids()) )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- audit immutabile a livello di privilegi: nessun grant update/delete a authenticated
revoke update, delete on audit.audit_log from authenticated;

-- ROLLBACK (nota): drop delle tabelle/schema in ordine inverso; staging-only.
-- ==========================================================================
-- FINE SLICE — NON ESEGUITO IN QUESTA SESSIONE (staging non disponibile).
