-- INGLY OS V2 — CRM RLS fix (Fase 13) — STAGING ONLY — NON APPLICATO QUI
-- ==========================================================================
-- CAUSA del "new row violates RLS for crm_customer":
--   le policy CRM (0003) usano current_tenant_ids(), che legge SOLO il claim JWT
--   (app_metadata.tenant_ids). Senza Auth Hook il claim è vuoto → INSERT/SELECT
--   con `= any(current_tenant_ids())` falliscono anche per un membro legittimo.
--
-- FIX (modello foundation esistente, nessun secondo tenant model):
--   Parte A) current_tenant_ids() risolve ANCHE dalla membership (auth.uid()),
--            come funzione SECURITY DEFINER (legge solo le PROPRIE membership →
--            nessun leakage). Il claim resta prioritario quando presente.
--   Parte B) (idempotente) riafferma le policy CRM SELECT/INSERT/UPDATE per tenant,
--            soft-delete (no hard delete ai client), crm_activity immutabile.
-- Dipende da: 0001 (current_tenant_ids, tenant_membership), 0003 (tabelle crm_*).
-- Rollback: supabase/rollback/20260101000005_crm_rls_down.sql
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- PARTE A — current_tenant_ids(): claim JWT + FALLBACK membership (auth.uid())
-- ─────────────────────────────────────────────────────────────────────────
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
      array[]::uuid[])
    ||
    coalesce(
      (select array_agg(m.tenant_id)
         from public.tenant_membership m
        where m.user_id = auth.uid() and m.status = 'active'),
      array[]::uuid[]);
$$;
revoke execute on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PARTE B — policy CRM (idempotenti). SELECT/INSERT/UPDATE per tenant del claim
-- o della membership; DELETE negato ai client (soft-delete); activity immutabile.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.crm_company  enable row level security;
alter table public.crm_customer enable row level security;
alter table public.crm_contact  enable row level security;
alter table public.crm_activity enable row level security;

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

-- crm_activity (append-only: solo SELECT/INSERT; niente UPDATE/DELETE ai client)
drop policy if exists crm_activity_sel on public.crm_activity;
create policy crm_activity_sel on public.crm_activity for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) );
drop policy if exists crm_activity_ins on public.crm_activity;
create policy crm_activity_ins on public.crm_activity for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- Soft-delete: nessun DELETE ai client (deleted_at via UPDATE/Edge). Activity immutabile.
revoke delete on public.crm_company, public.crm_customer, public.crm_contact, public.crm_activity from anon, authenticated;
revoke update on public.crm_activity from anon, authenticated;

-- NOTA RBAC (documentata): permission/role_permission NON sono ancora seminati,
-- quindi il confine di sicurezza server-side è il TENANT (RLS). L'RBAC per azione
-- (write: OWNER/ADMIN/MANAGER/SALES; VIEWER read-only; delete MANAGER+) è applicato
-- lato UI. L'affinamento server (has_permission + role_perm_cache) è una slice
-- successiva: NON indebolire la RLS tenant per aggirarlo.
-- ==========================================================================
