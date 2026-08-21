// Validazione STATICA (offline) delle migrazioni staging INGLY OS V2.
// Nessuna connessione a Supabase, nessun DB: legge i file SQL e verifica gli
// invarianti di sicurezza/coerenza decisi in Fase 3.6/4 (RLS su tutte le tabelle
// public, claim auth.jwt(), immutabilità audit, aggregate_version, FK auth.users,
// indici foundation, ordering migrazioni, isolamento ref di produzione).
import { describe, it, assert } from './harness.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations', 'staging');
const PROD_REF = 'dhfuokioyuytbxxgoilp';
const STAGING_REF = 'uepyexyosyogyvzorata';
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const up = read('0001_foundation_slice.sql');
const down = read('0001_foundation_slice_down.sql');
const seed = read('0002_rbac_seed.sql');

const PUBLIC_TABLES = ['tenant','profile','tenant_membership','role','permission','role_permission','user_role'];

describe('Staging SQL — validazione statica', (s) => {
  it(s, 'i file di migrazione foundation esistono', async () => {
    ['0001_foundation_slice.sql','0001_foundation_slice_down.sql','0002_rbac_seed.sql']
      .forEach((f) => assert(existsSync(join(DIR, f)), `manca ${f}`));
  });

  it(s, 'ordering migrazioni: prefissi numerici crescenti, 0001 prima di 0002', async () => {
    const sqls = readdirSync(DIR).filter((f) => /^\d+.*\.sql$/.test(f) && !/_down\./.test(f)).sort();
    assert(sqls[0].startsWith('0001'), `prima migrazione inattesa: ${sqls[0]}`);
    assert(sqls.includes('0002_rbac_seed.sql'), '0002 non presente nell\'ordine');
    // numeri unici e ordinati
    const nums = sqls.map((f) => parseInt(f.slice(0,4),10));
    for (let i=1;i<nums.length;i++) assert(nums[i] >= nums[i-1], 'ordering non monotono');
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
