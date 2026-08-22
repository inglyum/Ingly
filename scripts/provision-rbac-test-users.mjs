// INGLY OS V2 — PHASE 14C — Provisioning utenti di test RBAC (SOLO STAGING).
//
// Crea i 5 utenti auth di test e li lega al tenant `ingly-staging` con il ruolo
// corretto (OWNER/ADMIN/MANAGER/SALES/VIEWER). Idempotente.
//
// SICUREZZA (requisiti TASK 3):
//  · Legge TUTTO da env: nessuna password/anon/service-role/token hardcoded.
//  · Non salva né stampa password o chiavi (log = solo email + ruolo + esito).
//  · Guard: rifiuta qualunque project ref ≠ EXPECTED_PROJECT_REF (staging).
//    Se il target è production o diverso → STOP (exit 2). Nessuna scrittura.
//  · Usa la service-role SOLO lato server (Admin API + PostgREST), presa da env.
//
// ENV richieste:
//   EXPECTED_PROJECT_REF=uepyexyosyogyvzorata
//   SUPABASE_URL=https://uepyexyosyogyvzorata.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service-role STAGING>   (solo in env, mai nel repo)
//   RBAC_OWNER_PASSWORD / RBAC_ADMIN_PASSWORD / RBAC_MANAGER_PASSWORD /
//   RBAC_SALES_PASSWORD / RBAC_VIEWER_PASSWORD
//
// Uso:  node scripts/provision-rbac-test-users.mjs
// Exit: 0 ok · 1 errore · 2 STOP guard.

const STAGING_REF = 'uepyexyosyogyvzorata';
const PROD_REF = 'dhfuokioyuytbxxgoilp';
const TENANT_SLUG = 'ingly-staging';

const URL = process.env.SUPABASE_URL || '';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EXPECTED = process.env.EXPECTED_PROJECT_REF || STAGING_REF;

function refOf(u) { const m = String(u).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i); return m ? m[1] : null; }
function stop(msg) { console.error('STOP — ' + msg); process.exit(2); }

if (!URL || !SR) stop('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non impostati (nessun segreto è nel repo).');
const ref = refOf(URL);
if (EXPECTED !== STAGING_REF) stop(`EXPECTED_PROJECT_REF="${EXPECTED}" ≠ staging "${STAGING_REF}".`);
if (ref === PROD_REF) stop(`TARGET È PRODUCTION (${PROD_REF}). Nessuna operazione.`);
if (ref !== STAGING_REF) stop(`Target ref "${ref}" ≠ staging "${STAGING_REF}".`);

const USERS = [
  { role: 'OWNER', email: 'ingly-rbac-owner@staging.ingly.test' },
  { role: 'ADMIN', email: 'ingly-rbac-admin@staging.ingly.test' },
  { role: 'MANAGER', email: 'ingly-rbac-manager@staging.ingly.test' },
  { role: 'SALES', email: 'ingly-rbac-sales@staging.ingly.test' },
  { role: 'VIEWER', email: 'ingly-rbac-viewer@staging.ingly.test' },
];

const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

async function adminApi(method, path, body) {
  const r = await fetch(`${URL}/auth/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
async function rest(method, path, body, prefer) {
  const headers = { ...H }; if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { /* */ }
  return { ok: r.ok, status: r.status, data, txt };
}

// Cerca un utente auth per email paginando l'Admin API (GoTrue non ha un
// filtro ?email affidabile). Ritorna l'id o null.
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const q = await adminApi('GET', `admin/users?page=${page}&per_page=200`);
    const users = q.ok && Array.isArray(q.j.users) ? q.j.users : [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return { id: hit.id, existed: true };
    if (users.length < 200) break; // ultima pagina
  }
  return null;
}

// Idempotente: crea se assente; se già esiste NON tocca la password.
async function ensureUser(email, password) {
  const c = password
    ? await adminApi('POST', 'admin/users', { email, password, email_confirm: true })
    : { ok: false, status: 0, j: {} };
  if (c.ok && c.j.id) return { id: c.j.id, created: true };
  // già esistente (422 email_exists) o password mancante → cerca l'id senza modificarla
  const found = await findUserByEmail(email);
  if (found) return { id: found.id, created: false };
  if (!password) throw new Error(`utente ${email} assente e nessuna password in env per crearlo`);
  throw new Error(`creazione utente fallita ${email}: ${c.status} ${c.j.error_code || c.j.msg || ''}`);
}

async function tenantId() {
  const r = await rest('GET', `tenant?select=id&slug=eq.${TENANT_SLUG}&limit=1`);
  const t = Array.isArray(r.data) && r.data[0] && r.data[0].id;
  if (!t) throw new Error(`tenant ${TENANT_SLUG} assente: applica 0004_staging_bootstrap`);
  return t;
}
async function roleId(key) {
  const r = await rest('GET', `role?select=id&key=eq.${key}&limit=1`);
  const id = Array.isArray(r.data) && r.data[0] && r.data[0].id;
  if (!id) throw new Error(`ruolo ${key} assente (atteso da 0002_rbac_seed)`);
  return id;
}

// Verifica read-back (equivalente alla SELECT di join richiesta): per ogni
// utente conferma membership 'active' e user_role→role.key nel tenant.
async function verify(tid) {
  const out = {};
  for (const u of USERS) {
    const f = await findUserByEmail(u.email);
    if (!f) { out[u.role] = { present: false }; continue; }
    const m = await rest('GET', `tenant_membership?select=status&tenant_id=eq.${tid}&user_id=eq.${f.id}`);
    const ur = await rest('GET', `user_role?select=role:role_id(key)&tenant_id=eq.${tid}&user_id=eq.${f.id}`);
    const status = Array.isArray(m.data) && m.data[0] && m.data[0].status;
    const rkey = Array.isArray(ur.data) && ur.data[0] && ur.data[0].role && ur.data[0].role.key;
    out[u.role] = { present: true, status, role: rkey };
  }
  return out;
}

(async () => {
  const tid = await tenantId();
  const state = {};
  for (const u of USERS) {
    try {
      const pwd = process.env[`RBAC_${u.role}_PASSWORD`] || '';
      const { id: uid, created } = await ensureUser(u.email, pwd);
      const rid = await roleId(u.role);
      // service-role bypassa RLS: upsert membership + ruolo (idempotente).
      await rest('POST', 'profile', { id: uid, full_name: `${u.role} Test`, locale: 'it' }, 'resolution=ignore-duplicates');
      await rest('POST', 'tenant_membership', { tenant_id: tid, user_id: uid, status: 'active' }, 'resolution=merge-duplicates');
      await rest('POST', 'user_role', { tenant_id: tid, user_id: uid, role_id: rid }, 'resolution=merge-duplicates');
      state[u.role] = created ? 'CREATED' : 'PRESENT';
    } catch (e) {
      state[u.role] = 'ERRORE: ' + e.message;
    }
  }

  const v = await verify(tid);
  const membOk = USERS.every((u) => v[u.role] && v[u.role].status === 'active');
  const roleOk = USERS.every((u) => v[u.role] && v[u.role].role === u.role);

  // ── REPORT (formato PHASE 14C PROVISIONING) ───────────────────────────────
  console.log('\nPHASE 14C PROVISIONING\n');
  console.log(`Project: ${ref}`);
  console.log('Environment: STAGING\n');
  for (const u of USERS) {
    const s = String(state[u.role] || '—');
    const r = (v[u.role] && v[u.role].role) || '—';
    console.log(`${u.role.padEnd(8)} ${s.startsWith('ERRORE') ? s : s.padEnd(9) + ' ' + r}`);
  }
  console.log(`\nTenant membership: ${membOk ? 'PASS' : 'FAIL'}`);
  console.log(`Role assignment: ${roleOk ? 'PASS' : 'FAIL'}`);
  console.log('\nProduction touched: NO');
  console.log('V96 touched: NO');
  console.log('Migration changed: NO');
  console.log(`\nNext step:\n${membOk && roleOk ? 'READY FOR PHASE 14B' : 'FIX PROVISIONING (vedi righe ERRORE sopra)'}`);
  process.exit(membOk && roleOk ? 0 : 1);
})().catch((e) => { console.error('ERRORE runtime:', e.message); process.exit(1); });
