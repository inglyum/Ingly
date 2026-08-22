-- INGLY OS V2 — Staging bootstrap (Fase 12B) — STAGING ONLY — NON APPLICATO QUI
-- ==========================================================================
-- Scopo: permettere alla V2 di risolvere tenant/ruolo per l'utente autenticato.
-- Parte A: fix policy RLS di BOOTSTRAP (self-read via auth.uid()) — risolve il
--          chicken-and-egg (senza allargare l'accesso ai dati di business).
-- Parte B: seed IDEMPOTENTE dati minimi per mrgiuseppe.inglima@gmail.com
--          (1 tenant, 1 profile, 1 membership, 1 user_role=OWNER già seminato in 0002).
-- Dipende da: 0001_foundation_slice, 0002_rbac_seed.
-- Rollback: supabase/rollback/20260101000004_staging_bootstrap_down.sql
-- NON eseguire in produzione. Idempotente (rieseguibile).
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- PARTE A — RLS BOOTSTRAP: consenti all'utente di leggere la PROPRIA
-- membership/ruolo tramite auth.uid() (non più solo via claim vuoto).
-- Non allarga l'accesso ai dati business: riguarda solo le righe dove
-- user_id = auth.uid() (le proprie associazioni).
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists membership_self on public.tenant_membership;
create policy membership_self on public.tenant_membership
  for select to authenticated
  using ( user_id = auth.uid() or tenant_id = any (public.current_tenant_ids()) );

drop policy if exists user_role_read on public.user_role;
create policy user_role_read on public.user_role
  for select to authenticated
  using ( user_id = auth.uid() or tenant_id = any (public.current_tenant_ids()) );

-- ─────────────────────────────────────────────────────────────────────────
-- PARTE B — SEED IDEMPOTENTE per l'utente di staging.
-- No-op se l'utente auth non esiste. Nessun duplicato di ruoli/permessi
-- (usa il ruolo OWNER già seminato in 0002).
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_uid  uuid;
  v_tid  uuid;
  v_rid  uuid;
begin
  select id into v_uid from auth.users where email = 'mrgiuseppe.inglima@gmail.com' limit 1;
  if v_uid is null then
    raise notice 'Utente auth non trovato: seed saltato (no-op).';
    return;
  end if;

  -- 1) tenant di staging (uno solo, per slug)
  select id into v_tid from public.tenant where slug = 'ingly-staging' limit 1;
  if v_tid is null then
    insert into public.tenant (name, slug, plan, status)
      values ('Ingly Staging', 'ingly-staging', 'enterprise', 'active')
      returning id into v_tid;
  end if;

  -- 2) profile (self)
  insert into public.profile (id, full_name, locale)
    values (v_uid, 'Giuseppe Inglima', 'it')
    on conflict (id) do nothing;

  -- 3) membership attiva
  insert into public.tenant_membership (tenant_id, user_id, status)
    values (v_tid, v_uid, 'active')
    on conflict (tenant_id, user_id) do update set status = 'active';

  -- 4) ruolo OWNER (già seminato in 0002)
  select id into v_rid from public.role where key = 'OWNER' limit 1;
  if v_rid is not null then
    insert into public.user_role (tenant_id, user_id, role_id)
      values (v_tid, v_uid, v_rid)
      on conflict (tenant_id, user_id) do update set role_id = excluded.role_id;
  end if;

  raise notice 'Bootstrap staging completato per %', v_uid;
end $$;
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo review. Non toccare produzione.
-- ==========================================================================
