-- INGLY OS V2 — Campi fiscali per Fattura Elettronica / SDI. STAGING ONLY.
-- Additiva e reversibile: aggiunge colonne NULLABLE (nessun valore inventato,
-- le compila l'utente) al cedente (tenant_settings) e al cessionario
-- (crm_customer). Nessun dato esistente viene modificato o rimosso. Servono per
-- generare una FatturaPA valida; finché non compilati, il generatore rifiuta
-- l'emissione e mostra un report di validazione (mai un file finto).
-- Dipende da: 0003 (crm_customer), 0021 (tenant_settings).
-- Rollback: supabase/rollback/20260101000022_fiscal_fields_down.sql
-- ==========================================================================

-- CEDENTE/PRESTATORE (dati azienda per la fattura elettronica)
alter table public.tenant_settings add column if not exists fiscal_code text;      -- Codice Fiscale
alter table public.tenant_settings add column if not exists tax_regime text;        -- RegimeFiscale (es. RF01, RF19)
alter table public.tenant_settings add column if not exists rea_office text;         -- Ufficio REA (provincia)
alter table public.tenant_settings add column if not exists rea_number text;         -- Numero REA
alter table public.tenant_settings add column if not exists sede_cap text;
alter table public.tenant_settings add column if not exists sede_comune text;
alter table public.tenant_settings add column if not exists sede_provincia text;
alter table public.tenant_settings add column if not exists sede_nazione text default 'IT';

-- CESSIONARIO/COMMITTENTE (dati fiscali del cliente)
alter table public.crm_customer add column if not exists fiscal_code text;           -- Codice Fiscale
alter table public.crm_customer add column if not exists sdi_code text;              -- Codice Destinatario (7 char)
alter table public.crm_customer add column if not exists pec text;                   -- PEC (alternativa allo SDI)
alter table public.crm_customer add column if not exists address text;
alter table public.crm_customer add column if not exists cap text;
alter table public.crm_customer add column if not exists comune text;
alter table public.crm_customer add column if not exists provincia text;
alter table public.crm_customer add column if not exists nazione text default 'IT';
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
