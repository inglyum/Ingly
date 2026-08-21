-- INGLY OS V2 — CRM slice ROLLBACK (down) — STAGING ONLY
-- Drop in ordine inverso alle dipendenze FK. Staging-only, non in produzione.
-- ==========================================================================
drop index if exists public.ix_crm_activity_customer;
drop index if exists public.ix_crm_contact_customer;
drop index if exists public.ix_crm_customer_email_trgm;
drop index if exists public.ix_crm_customer_name_trgm;
drop index if exists public.ix_crm_customer_company;
drop index if exists public.ix_crm_customer_tenant_del;
drop index if exists public.ix_crm_customer_tenant_type;
drop index if exists public.ix_crm_customer_tenant_seg;
drop index if exists public.ix_crm_company_name_trgm;
drop index if exists public.ix_crm_company_tenant;

drop table if exists public.crm_activity;
drop table if exists public.crm_contact;
drop table if exists public.crm_customer;
drop table if exists public.crm_company;
-- (pg_trgm resta installata: puo' servire ad altri moduli)
-- ==========================================================================
