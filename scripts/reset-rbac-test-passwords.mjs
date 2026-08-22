// INGLY OS V2 — PHASE 14B — reset password utenti RBAC di test (STAGING).
//
// Allinea la password Auth di ciascun utente di test al valore in env, così il
// login del harness combacia. NON ricrea utenti, NON tocca ruoli/membership/
// schema. Idempotente. Nessuna password stampata o salvata.
//
// Fa SOLO: find-by-email → admin update { password, email_confirm:true }.
//
// SICUREZZA:
//  · Guard: rifiuta ogni project ref ≠ uepyexyosyogyvzorata (STOP, exit 2).
//  · Service-role e password SOLO da env; niente hardcode, niente log dei valori.
//  · Placeholder di password rifiutati (es. INSERISCI_PASSWORD, PASSWORD_OWNER).
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      RBAC_<ROLE>_EMAIL (opz., default naming test), RBAC_<ROLE>_PASSWORD
// Uso: node scripts/reset-rbac-test-passwords.mjs   ·   Exit 0 se tutti OK.

const STAGING_REF = 'uepyexyosyogyvzorata';
const PROD_REF = 'dhfuokioyuytbxxgoilp';
const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'];
const DEFAULT_EMAIL = (r) => `ingly-rbac-${r.toLowerCase()}@staging.ingly.test`;

// Valori placeholder che NON sono password reali.
const PLACEHOLDERS = new Set([
  'INSERISCI_PASSWORD', 'INSERISCI_PASSWORD_OWNER', 'INSERISCI_PASSWORD_REALE',
  'CHANGE_ME', 'CHANGEME', 'LA_TUA_PASSWORD',
  'PASSWORD_OWNER', 'PASSWORD_ADMIN', 'PASSWORD_MANAGER', 'PASSWORD_SALES', 'PASSWORD_VIEWER',
  '<...>', 'password', 'PASSWORD',
]);

const URL = process.env.SUPABASE_URL || '';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function refOf(u) { const m = String(u).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i); return m ? m[1] : null; }
function stop(m) { console.error('STOP — ' + m); process.exit(2); }
if (!URL || !SR) stop('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non impostati (nessun segreto nel repo).');
const ref = refOf(URL);
if (ref === PROD_REF) stop('TARGET È PRODUCTION. Nessuna operazione.');
if (ref !== STAGING_REF) stop(`Target ref "${ref}" ≠ staging "${STAGING_REF}".`);

const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };
const emailOf = (r) => process.env[`RBAC_${r}_EMAIL`] || DEFAULT_EMAIL(r);
const pwdOf = (r) => process.env[`RBAC_${r}_PASSWORD`] || '';

// Valida che tutte le password siano presenti e NON placeholder — prima di scrivere.
const bad = [];
for (const r of ROLES) {
  const p = pwdOf(r);
  if (!p) bad.push(`${r}: MISSING`);
  else if (PLACEHOLDERS.has(p) || p.length < 8) bad.push(`${r}: placeholder/troppo corta`);
}
if (bad.length) {
  console.error('STOP — password non valide (nessuna scrittura):\n  ' + bad.join('\n  '));
  console.error('\nImposta password reali (≥8 char) in env e riprova. Le password non vengono mai stampate né salvate.');
  process.exit(2);
}

async function findByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const rsp = await fetch(`${URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
    const j = await rsp.json().catch(() => ({}));
    const users = Array.isArray(j.users) ? j.users : [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}
async function setPassword(id, password) {
  const rsp = await fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT', headers: H, body: JSON.stringify({ password, email_confirm: true }),
  });
  const j = await rsp.json().catch(() => ({}));
  return { ok: rsp.ok, status: rsp.status, reason: j.error_description || j.msg || j.error || '' };
}

(async () => {
  const out = [];
  let okAll = true;
  for (const r of ROLES) {
    const e = emailOf(r);
    const u = await findByEmail(e);
    if (!u) { out.push(`${r.padEnd(8)} ${e}  → NON TROVATO (esegui prima il provisioning 14C)`); okAll = false; continue; }
    const res = await setPassword(u.id, pwdOf(r));
    if (!res.ok) { out.push(`${r.padEnd(8)} ${e}  → ERRORE ${res.status} ${res.reason}`); okAll = false; }
    else out.push(`${r.padEnd(8)} ${e}  → PASSWORD AGGIORNATA · email confermata`);
  }
  console.log(`\nPHASE 14B — reset password (staging ${ref}):`);
  console.log(out.join('\n'));
  console.log(`\n${okAll ? 'OK. Ora verifica i login: node scripts/check-rbac-login.mjs' : 'Correggi le righe sopra e riprova.'}`);
  process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error('ERRORE runtime:', e.message); process.exit(1); });
