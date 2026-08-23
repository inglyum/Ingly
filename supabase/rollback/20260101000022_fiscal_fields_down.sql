-- INGLY OS V2 — Rollback 0022 campi fiscali SDI.
alter table public.tenant_settings drop column if exists fiscal_code;
alter table public.tenant_settings drop column if exists tax_regime;
alter table public.tenant_settings drop column if exists rea_office;
alter table public.tenant_settings drop column if exists rea_number;
alter table public.tenant_settings drop column if exists sede_cap;
alter table public.tenant_settings drop column if exists sede_comune;
alter table public.tenant_settings drop column if exists sede_provincia;
alter table public.tenant_settings drop column if exists sede_nazione;
alter table public.crm_customer drop column if exists fiscal_code;
alter table public.crm_customer drop column if exists sdi_code;
alter table public.crm_customer drop column if exists pec;
alter table public.crm_customer drop column if exists address;
alter table public.crm_customer drop column if exists cap;
alter table public.crm_customer drop column if exists comune;
alter table public.crm_customer drop column if exists provincia;
alter table public.crm_customer drop column if exists nazione;
