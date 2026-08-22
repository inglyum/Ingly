// INGLY OS V2 — PHASE 14B — diagnosi login utenti RBAC (STAGING, read-only).
//
// NON modifica nulla. Verifica: (1) presenza/formato env, (2) stato Auth di
// ciascun utente via service-role (exists, email confirmed), (3) login reale
// via anon key (signInWithPassword equivalente). Nessun segreto stampato:
// solo PRESENT/MISSING, lunghezze, id utente ed esito PASS/FAIL.
//
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      RBAC_<ROLE>_EMAIL, RBAC_<ROLE>_PASSWORD  (ROLE ∈ OWNER..VIEWER)
// Uso: node scripts/check-rbac-login.mjs   ·   Exit 0 se tutti i login PASS.

const STAGING_REF = 'uepyexyosyogyvzorata';
const PROD_REF = 'dhfuokioyuytbxxgoilp';
const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'];

const URL = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function refOf(u) { const m = String(u).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i); return m ? m[1] : null; }
function stop(m) { console.error('STOP — ' + m); process.exit(2); }
if (!URL) stop('SUPABASE_URL non impostato.');
const ref = refOf(URL);
if (ref === PROD_REF) stop('TARGET È PRODUCTION. Nessuna operazione.');
if (ref !== STAGING_REF) stop(`Target ref "${ref}" ≠ staging "${STAGING_REF}".`);

const emailOf = (r) => process.env[`RBAC_${r}_EMAIL`] || '';
const pwdOf = (r) => process.env[`RBAC_${r}_PASSWORD`] || '';

// ── TASK 2 — presenza env (mai il contenuto) ────────────────────────────────
console.log('\n[env]');
console.log(`SUPABASE_URL: ${URL ? 'PRESENT' : 'MISSING'}`);
console.log(`SUPABASE_ANON_KEY: ${ANON ? 'PRESENT' : 'MISSING'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${SR ? 'PRESENT' : 'MISSING'}`);
for (const r of ROLES) {
  console.log(`${r} email env: ${emailOf(r) ? 'PRESENT' : 'MISSING'} · password env: ${pwdOf(r) ? 'PRESENT' : 'MISSING'}${pwdOf(r) ? ' (len ' + pwdOf(r).length + ')' : ''}`);
}

async function adminList() {
  const map = new Map();
  if (!SR) return map;
  for (let page = 1; page <= 20; page++) {
    const rsp = await fetch(`${URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: SR, Authorization: `Bearer ${SR}` },
    });
    const j = await rsp.json().catch(() => ({}));
    const users = Array.isArray(j.users) ? j.users : [];
    for (const u of users) if (u.email) map.set(u.email.toLowerCase(), u);
    if (users.length < 200) break;
  }
  return map;
}
async function login(email, password) {
  if (!ANON) return { ok: false, reason: 'anon key mancante' };
  const rsp = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await rsp.json().catch(() => ({}));
  return { ok: rsp.ok && !!j.access_token, status: rsp.status, reason: j.error_description || j.msg || j.error || '' };
}

(async () => {
  const admin = await adminList();
  console.log('\n[auth users]');
  for (const r of ROLES) {
    const e = emailOf(r); const u = e ? admin.get(e.toLowerCase()) : null;
    console.log(`${r}: email=${e || '—'} exists=${u ? 'yes' : 'no'} id=${u ? u.id : '—'} email confirmed=${u ? (u.email_confirmed_at ? 'yes' : 'no') : '—'}`);
  }

  console.log('\n[login]');
  const res = {};
  for (const r of ROLES) {
    const e = emailOf(r); const p = pwdOf(r);
    if (!e || !p) { res[r] = false; console.log(`${r} login: FAIL (email/password env mancante)`); continue; }
    const l = await login(e, p);
    res[r] = l.ok;
    console.log(`${r} login: ${l.ok ? 'PASS' : `FAIL (${l.status} ${l.reason})`}`);
  }
  const all = ROLES.every((r) => res[r]);
  console.log(`\n${all ? 'TUTTI PASS → puoi eseguire: node tests/live_rbac_staging.mjs'
    : 'Non tutti PASS → esegui scripts/reset-rbac-test-passwords.mjs (vedi doc 14C), poi ricontrolla.'}`);
  process.exit(all ? 0 : 1);
})().catch((e) => { console.error('ERRORE runtime:', e.message); process.exit(1); });
