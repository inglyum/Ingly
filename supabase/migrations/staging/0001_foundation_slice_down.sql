-- INGLY OS V2 — Foundation slice ROLLBACK (down) — STAGING ONLY — NON ESEGUITO
-- Drop in ordine inverso. Staging-only. NON eseguire in produzione.
-- ==========================================================================
-- Funzione helper
drop function if exists public.current_tenant_ids();

-- Indici (drop espliciti; il drop delle tabelle li rimuove comunque)
drop index if exists integ.ix_integration_tenant;
drop index if exists public.ix_membership_user;
drop index if exists events.ix_dlq_event;
drop index if exists events.ix_outbox_status;
drop index if exists events.ix_domain_event_aggregate;
drop index if exists events.ix_domain_event_tenant;
drop index if exists audit.ix_audit_log_resource;
drop index if exists audit.ix_audit_log_tenant_time;

-- Tabelle (ordine inverso rispetto alle dipendenze FK)
drop table if exists sync.mutation_log;
drop table if exists integ.integration_credential;
drop table if exists integ.integration;
drop table if exists events.dlq;
drop table if exists events.outbox;
drop table if exists events.domain_event;
drop table if exists audit.audit_log;
drop table if exists public.user_role;
drop table if exists public.role_permission;
drop table if exists public.permission;
drop table if exists public.role;
drop table if exists public.tenant_membership;
drop table if exists public.profile;
drop table if exists public.tenant;

-- Schemi interni (solo se vuoti)
drop schema if exists sync   cascade;
drop schema if exists integ  cascade;
drop schema if exists events cascade;
drop schema if exists audit  cascade;
-- ==========================================================================
