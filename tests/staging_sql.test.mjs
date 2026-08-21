// Validazione STATICA (offline) delle migrazioni staging INGLY OS V2.
// Nessuna connessione a Supabase, nessun DB: legge i file SQL e verifica gli
// invarianti di sicurezza/coerenza decisi in Fase 3.6/4 (RLS su tutte le tabelle
// public, claim auth.jwt(), immutabilità audit, aggregate_version, FK auth.users,
// indici foundation, ordering migrazioni, isolamento ref di produzione).
import { describe, it, assert } from './harness.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(process.cwd(), 'supabase', 'migrations');       // up migrations (CLI discovery)
const ROLL = join(process.cwd(), 'supabase', 'rollback');        // rollback artifacts (NON discovery)
const PROD_REF = 'dhfuokioyuytbxxgoilp';
const STAGING_REF = 'uepyexyosyogyvzorata';
const UP_FOUNDATION = '20260101000001_foundation_slice.sql';
const UP_RBAC = '20260101000002_rbac_seed.sql';
const DOWN_FOUNDATION = '20260101000001_foundation_slice_down.sql';
const up = readFileSync(join(MIG, UP_FOUNDATION), 'utf8');
const seed = readFileSync(join(MIG, UP_RBAC), 'utf8');
const down = readFileSync(join(ROLL, DOWN_FOUNDATION), 'utf8');

const PUBLIC_TABLES = ['tenant','profile','tenant_membership','role','permission','role_permission','user_role'];

describe('Staging SQL — validazione statica', (s) => {
  it(s, 'le up-migration foundation sono nella root migrations (CLI discovery)', async () => {
    assert(existsSync(join(MIG, UP_FOUNDATION)), `manca ${UP_FOUNDATION} in migrations/`);
    assert(existsSync(join(MIG, UP_RBAC)), `manca ${UP_RBAC} in migrations/`);
  });

  it(s, 'la down-migration è un ARTEFATTO di rollback, NON in migrations/ (non deve essere una up)', async () => {
    assert(existsSync(join(ROLL, DOWN_FOUNDATION)), `manca il rollback ${DOWN_FOUNDATION}`);
    const inMig = readdirSync(MIG).some((f) => /_down\./i.test(f));
    assert(!inMig, 'una down-migration è finita in supabase/migrations/ (verrebbe applicata come up!)');
  });

  it(s, 'ordering: foundation < rbac < stripe (nomi timestamp Supabase, lessicografico)', async () => {
    const sqls = readdirSync(MIG).filter((f) => /^\d{8,}.*\.sql$/.test(f)).sort();
    const iF = sqls.indexOf(UP_FOUNDATION);
    const iR = sqls.indexOf(UP_RBAC);
    const iS = sqls.indexOf('20260817_stripe.sql');
    assert(iF >= 0 && iR >= 0, 'foundation/rbac non trovati nella root');
    assert(iF < iR, 'foundation deve precedere rbac');
    if (iS >= 0) assert(iR < iS, 'foundation/rbac devono precedere la migrazione stripe legacy');
  });

  it(s, 'ogni tabella public della foundation crea la tabella', async () => {
    PUBLIC_TABLES.forEach((t) => {
      const re = new RegExp(`create table if not exists public\\.${t}\\b`, 'i');
      assert(re.test(up), `manca create table public.${t}`);
    });
  });

  it(s, 'RLS abilitata su TUTTE le tabelle public (B-1)', async () => {
    PUBLIC_TABLES.forEach((t) => {
      const re = new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i');
      assert(re.test(up), `RLS non abilitata su public.${t}`);
    });
  });

  it(s, 'ogni tabella public ha almeno una policy', async () => {
    PUBLIC_TABLES.forEach((t) => {
      const re = new RegExp(`create policy [\\w_]+ on public\\.${t}\\b`, 'i');
      assert(re.test(up), `nessuna policy su public.${t}`);
    });
  });

  it(s, 'claim via auth.jwt() e non current_setting (W-1)', async () => {
    assert(/auth\.jwt\(\)/.test(up), 'auth.jwt() non usato');
    assert(!/current_setting\(\s*'request\.jwt\.claims'/.test(up), 'current_setting ancora presente');
  });

  it(s, 'current_tenant_ids() è SECURITY DEFINER con search_path vuoto e revoke da public', async () => {
    assert(/create or replace function public\.current_tenant_ids\(\)/i.test(up), 'funzione mancante');
    assert(/security definer/i.test(up), 'manca SECURITY DEFINER');
    assert(/set search_path\s*=\s*''/.test(up), "manca set search_path = ''");
    assert(/revoke execute on function public\.current_tenant_ids\(\) from public/i.test(up), 'manca revoke da public');
  });

  it(s, 'domain_event: CHECK aggregate_version>0 + UNIQUE per aggregato (W-6/HR-5)', async () => {
    assert(/aggregate_version\s+bigint\s+not null/i.test(up), 'aggregate_version mancante');
    assert(/check\s*\(\s*aggregate_version\s*>\s*0\s*\)/i.test(up), 'manca CHECK aggregate_version>0');
    assert(/unique\s*\(\s*tenant_id,\s*aggregate_type,\s*aggregate_id,\s*aggregate_version\s*\)/i.test(up), 'manca UNIQUE per aggregato');
    assert(/unique\s*\(\s*idempotency_key\s*\)/i.test(up), 'manca UNIQUE idempotency_key');
  });

  it(s, 'audit_log immutabile: revoke update,delete da anon,authenticated (W-5)', async () => {
    assert(/revoke update,\s*delete on audit\.audit_log from anon,\s*authenticated/i.test(up), 'audit non reso immutabile');
  });

  it(s, 'integration_credential protetta: revoke all da anon,authenticated (W-3)', async () => {
    assert(/revoke all on integ\.integration_credential from anon,\s*authenticated/i.test(up), 'credenziali non protette');
    assert(/alter table integ\.integration_credential\s+enable row level security/i.test(up), 'RLS non abilitata su credential');
  });

  it(s, 'FK verso auth.users(id) su profile/membership/user_role (W-8)', async () => {
    ['profile','tenant_membership','user_role'].forEach(() => {});
    const c = (up.match(/references auth\.users\(id\)/gi) || []).length;
    assert(c >= 3, `attese >=3 FK verso auth.users, trovate ${c}`);
  });

  it(s, 'indici foundation presenti (W-9)', async () => {
    ['ix_audit_log_tenant_time','ix_domain_event_tenant','ix_outbox_status','ix_membership_user']
      .forEach((ix) => assert(new RegExp(ix).test(up), `manca indice ${ix}`));
  });

  it(s, 'down migration droppa tutte le tabelle public create', async () => {
    PUBLIC_TABLES.forEach((t) => {
      const re = new RegExp(`drop table if exists public\\.${t}\\b`, 'i');
      assert(re.test(down), `down non droppa public.${t}`);
    });
    assert(/drop function if exists public\.current_tenant_ids/i.test(down), 'down non droppa la funzione');
  });

  it(s, '0002 crea role_perm_cache + schema security + semina i ruoli (W-2)', async () => {
    assert(/create schema if not exists security/i.test(seed), 'manca schema security');
    assert(/create table if not exists security\.role_perm_cache/i.test(seed), 'manca role_perm_cache');
    ['OWNER','ADMIN','MANAGER','SALES','DESIGNER','PRODUCTION','WAREHOUSE','FINANCE','VIEWER']
      .forEach((r) => assert(new RegExp(`'${r}'`).test(seed), `ruolo ${r} non seminato`));
  });

  it(s, 'nessun ref di PRODUZIONE nelle migrazioni staging', async () => {
    [up, down, seed].forEach((sql) => assert(!sql.includes(PROD_REF), 'ref di produzione presente in una migrazione staging!'));
  });

  it(s, 'lo staging ref non è uguale al ref di produzione', async () => {
    assert(STAGING_REF !== PROD_REF, 'staging ref == produzione');
  });

  it(s, 'bilanciamento base $$ nelle funzioni', async () => {
    const dollars = (up.match(/\$\$/g) || []).length;
    assert(dollars % 2 === 0, 'delimitatori $$ non bilanciati');
  });
});

// ── CRM slice (Fase 10) ────────────────────────────────────────────────────
const CRM_UP = '20260101000003_crm.sql';
const CRM_DOWN = '20260101000003_crm_down.sql';
const crm = readFileSync(join(MIG, CRM_UP), 'utf8');
const crmDown = readFileSync(join(ROLL, CRM_DOWN), 'utf8');
const CRM_TABLES = ['crm_company', 'crm_customer', 'crm_contact', 'crm_activity'];

describe('CRM slice — validazione statica', (s) => {
  it(s, 'la migrazione e il down CRM esistono nelle cartelle corrette', async () => {
    assert(existsSync(join(MIG, CRM_UP)), 'manca migrazione CRM in migrations/');
    assert(existsSync(join(ROLL, CRM_DOWN)), 'manca il down CRM in rollback/');
    assert(!readdirSync(MIG).includes(CRM_DOWN), 'down CRM non deve stare in migrations/');
  });
  it(s, 'ordering: CRM (000003) dopo foundation/rbac', async () => {
    assert('20260101000003' > '20260101000002', 'ordering CRM errato');
  });
  it(s, 'crea le 4 tabelle CRM previste dal design', async () => {
    CRM_TABLES.forEach((t) => assert(new RegExp(`create table if not exists public\\.${t}\\b`, 'i').test(crm), `manca ${t}`));
  });
  it(s, 'ogni tabella CRM ha tenant_id NOT NULL + FK a tenant', async () => {
    CRM_TABLES.forEach(() => {});
    const fk = (crm.match(/tenant_id uuid not null references public\.tenant\(id\)/gi) || []).length;
    assert(fk >= 4, `attese >=4 FK tenant, trovate ${fk}`);
  });
  it(s, 'relazioni FK: customer→company, contact→customer, activity→customer', async () => {
    assert(/company_id uuid references public\.crm_company\(id\)/i.test(crm), 'FK customer->company mancante');
    assert(/customer_id uuid not null references public\.crm_customer\(id\)/i.test(crm), 'FK contact->customer mancante');
    assert(/customer_id uuid references public\.crm_customer\(id\)/i.test(crm), 'FK activity->customer mancante');
  });
  it(s, 'RLS abilitata su TUTTE le tabelle CRM', async () => {
    CRM_TABLES.forEach((t) => assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(crm), `RLS off su ${t}`));
  });
  it(s, 'policy select+insert per ogni tabella CRM (per tenant/claim)', async () => {
    CRM_TABLES.forEach((t) => {
      assert(new RegExp(`create policy [\\w]+ on public\\.${t} for select`, 'i').test(crm), `no SELECT policy ${t}`);
      assert(new RegExp(`create policy [\\w]+ on public\\.${t} for insert`, 'i').test(crm), `no INSERT policy ${t}`);
    });
    assert(/current_tenant_ids\(\)/.test(crm), 'policy non usano il claim tenant');
  });
  it(s, 'soft-delete: revoke delete ai client; activity immutabile (revoke update)', async () => {
    assert(/revoke delete on[\s\S]*crm_customer[\s\S]*from anon, authenticated/i.test(crm), 'delete non revocato');
    assert(/revoke update on public\.crm_activity from anon, authenticated/i.test(crm), 'activity non immutabile');
  });
  it(s, 'indici di ricerca trigram su customer(name,email) e company(name)', async () => {
    ['ix_crm_customer_name_trgm', 'ix_crm_customer_email_trgm', 'ix_crm_company_name_trgm']
      .forEach((ix) => assert(crm.includes(ix), `manca indice ${ix}`));
    assert(/using gin \([a-z_]+ gin_trgm_ops\)/i.test(crm), 'trigram gin non usato');
    assert(/create extension if not exists pg_trgm/i.test(crm), 'pg_trgm non abilitata');
  });
  it(s, 'type check constraints (B2C/B2B, tipi attività)', async () => {
    assert(/check \(type in \('B2C','B2B'\)\)/i.test(crm), 'check tipo cliente mancante');
    assert(/check \(type in \('note','call','email','meeting','followup'\)\)/i.test(crm), 'check tipo attività mancante');
  });
  it(s, 'down CRM droppa tutte le tabelle CRM', async () => {
    CRM_TABLES.forEach((t) => assert(new RegExp(`drop table if exists public\\.${t}\\b`, 'i').test(crmDown), `down non droppa ${t}`));
  });
  it(s, 'nessun ref di PRODUZIONE nella slice CRM', async () => {
    assert(!crm.includes(PROD_REF) && !crmDown.includes(PROD_REF), 'ref di produzione nella slice CRM');
  });
});
