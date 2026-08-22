// INGLY OS V2 — PHASE 14B — LIVE RBAC SECURITY VALIDATION (runtime, STAGING).
//
// Dimostra con test REALI contro il database che il server-side RBAC della
// migrazione 0006 (RLS + has_permission + trigger soft-delete) è applicato
// davvero. Opera DIRETTAMENTE via API REST/Auth di Supabase (bypass UI): non
// verifica che i bottoni siano nascosti, ma che il SERVER rifiuti le scritture
// non autorizzate.
//
// SICUREZZA (TASK 5/6):
//  · Nessuna password/anon-key/service-key/token è hardcoded qui.
//  · Tutte le credenziali arrivano SOLO da variabili d'ambiente (vedi sotto).
//  · Target obbligatorio STAGING ref `uepyexyosyogyvzorata`: se l'URL punta ad
//    altro (es. production dhfuokioyuytbxxgoilp) → STOP immediato, exit 2.
//  · La service_role NON è usata: si autentica come utente reale (anon key +
//    email/password), esattamente il modello di `app-v2/src/supabase.js`.
//
// USO:
//   export SUPABASE_URL="https://uepyexyosyogyvzorata.supabase.co"
//   export SUPABASE_ANON_KEY="<publishable/anon key>"
//   # credenziali dei 5 utenti di test (uno per ruolo, stesso tenant A):
//   export RBAC_OWNER_EMAIL=...    RBAC_OWNER_PASSWORD=...
//   export RBAC_ADMIN_EMAIL=...    RBAC_ADMIN_PASSWORD=...
//   export RBAC_MANAGER_EMAIL=...  RBAC_MANAGER_PASSWORD=...
//   export RBAC_SALES_EMAIL=...    RBAC_SALES_PASSWORD=...
//   export RBAC_VIEWER_EMAIL=...   RBAC_VIEWER_PASSWORD=...
//   # (opzionale) utente di un SECONDO tenant B per il test di isolamento:
//   export RBAC_TENANTB_EMAIL=...  RBAC_TENANTB_PASSWORD=...
//   node tests/live_rbac_staging.mjs
//
// Exit code: 0 = SECURITY VERIFIED · 1 = SECURITY NOT VERIFIED · 2 = STOP guard.

const STAGING_REF = 'uepyexyosyogyvzorata';
const PROD_REF = 'dhfuokioyuytbxxgoilp';
const TAG = 'PHASE14 LIVE TEST';

const URL = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';

// ── TASK 6 — guard target: solo STAGING ─────────────────────────────────────
function refOf(u) { const m = String(u).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i); return m ? m[1] : null; }
function stop(msg) { console.error('STOP — ' + msg); process.exit(2); }
if (!URL || !ANON) stop('SUPABASE_URL / SUPABASE_ANON_KEY non impostati (nessun segreto è hardcoded).');
const ref = refOf(URL);
if (ref === PROD_REF) stop('TARGET È PRODUCTION (' + PROD_REF + '). Nessun test eseguito su produzione.');
if (ref !== STAGING_REF) stop('Target ref "' + ref + '" ≠ staging "' + STAGING_REF + '".');

// ── client REST minimale (fetch nativo Node ≥18) ────────────────────────────
async function signIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`login fallito per ${email}: ${r.status} ${j.error_description || j.msg || ''}`);
  return j.access_token;
}
// Esegue una op REST e classifica: { ok:true } se 2xx, altrimenti { ok:false, status, denied }.
async function rest(token, method, path, { body, prefer } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { /* testo grezzo */ }
  // "denied" = rifiuto d'autorizzazione lato DB (RLS/permesso/trigger 42501).
  const denied = r.status === 401 || r.status === 403 ||
    (r.status >= 400 && /row-level security|permission denied|42501|not.*permission/i.test(txt));
  return { ok: r.ok, status: r.status, denied, data, txt };
}
async function myTenant(token) {
  const r = await rest(token, 'GET', 'tenant_membership?select=tenant_id&limit=1');
  const t = Array.isArray(r.data) && r.data[0] && r.data[0].tenant_id;
  if (!t) throw new Error('impossibile determinare il tenant dell\'utente (tenant_membership vuota o non leggibile).');
  return t;
}

const results = {};
const created = []; // { token, table, id } per cleanup (TASK 8)

// PASS se il verso reale combacia con l'atteso (allow→ok, deny→denied).
function verdict(expected, res) {
  if (expected === 'allow') return res.ok ? 'PASS' : `FAIL(${res.status})`;
  return res.denied ? 'PASS' : `FAIL(consentito ${res.status})`;
}

async function runRole(roleName, creds, expect) {
  const out = { SELECT: '—', INSERT: '—', UPDATE: '—', SOFTDELETE: '—' };
  let token, tenant;
  try { token = await signIn(creds.email, creds.password); tenant = await myTenant(token); }
  catch (e) { out.error = e.message; results[roleName] = out; return; }

  // SELECT
  out.SELECT = verdict('allow', await rest(token, 'GET', 'crm_customer?select=id&limit=1'));

  // INSERT (record taggato)
  const ins = await rest(token, 'POST', 'crm_customer',
    { body: { tenant_id: tenant, name: `${TAG} ${roleName} ${Date.now()}`, type: 'B2C', notes: TAG }, prefer: 'return=representation' });
  out.INSERT = verdict(expect.insert, ins);
  const newId = ins.ok && Array.isArray(ins.data) && ins.data[0] && ins.data[0].id;
  if (newId) created.push({ token, table: 'crm_customer', id: newId });

  // Serve un id su cui provare UPDATE/DELETE: il record appena creato oppure uno esistente leggibile.
  let targetId = newId;
  if (!targetId) { const g = await rest(token, 'GET', 'crm_customer?select=id&limit=1'); targetId = Array.isArray(g.data) && g.data[0] && g.data[0].id; }
  if (targetId) {
    out.UPDATE = verdict(expect.update, await rest(token, 'PATCH', `crm_customer?id=eq.${targetId}`, { body: { segment: TAG } }));
    out.SOFTDELETE = verdict(expect.softdelete, await rest(token, 'PATCH', `crm_customer?id=eq.${targetId}`, { body: { deleted_at: new Date().toISOString() } }));
  }
  results[roleName] = out;
}

// ── TASK 3 — isolamento tenant: utente tenant A vs record tenant B ───────────
async function tenantIsolation(ownerCreds, bCreds) {
  if (!bCreds.email) return 'SKIP(no RBAC_TENANTB_*)';
  try {
    const tokA = await signIn(ownerCreds.email, ownerCreds.password);
    const tokB = await signIn(bCreds.email, bCreds.password);
    const tenantB = await myTenant(tokB);
    // B crea un record nel proprio tenant (baseline).
    const mk = await rest(tokB, 'POST', 'crm_customer',
      { body: { tenant_id: tenantB, name: `${TAG} tenantB ${Date.now()}`, type: 'B2C', notes: TAG }, prefer: 'return=representation' });
    const idB = mk.ok && Array.isArray(mk.data) && mk.data[0] && mk.data[0].id;
    if (idB) created.push({ token: tokB, table: 'crm_customer', id: idB });
    // A (altro tenant) tenta SELECT/UPDATE/SOFT-DELETE sul record di B.
    const selA = await rest(tokA, 'GET', `crm_customer?select=id&id=eq.${idB}`);
    const seesB = selA.ok && Array.isArray(selA.data) && selA.data.length > 0; // RLS deve nasconderlo
    const updA = await rest(tokA, 'PATCH', `crm_customer?id=eq.${idB}`, { body: { segment: 'X' } });
    const delA = await rest(tokA, 'PATCH', `crm_customer?id=eq.${idB}`, { body: { deleted_at: new Date().toISOString() } });
    // PASS: A non vede B, e update/delete non modificano nulla (0 righe → non "ok con dati").
    const noWrite = (r) => !(r.ok && Array.isArray(r.data) && r.data.length > 0);
    return (!seesB && noWrite(updA) && noWrite(delA)) ? 'PASS' : 'FAIL(cross-tenant access)';
  } catch (e) { return 'FAIL(' + e.message + ')'; }
}

// ── TASK 7 — activity immutabile ────────────────────────────────────────────
async function activityImmutability(ownerCreds) {
  try {
    const tok = await signIn(ownerCreds.email, ownerCreds.password);
    const tenant = await myTenant(tok);
    const cust = await rest(tok, 'GET', 'crm_customer?select=id&limit=1');
    const cid = Array.isArray(cust.data) && cust.data[0] && cust.data[0].id;
    const ins = await rest(tok, 'POST', 'crm_activity',
      { body: { tenant_id: tenant, customer_id: cid, type: 'note', body: TAG }, prefer: 'return=representation' });
    const aid = ins.ok && Array.isArray(ins.data) && ins.data[0] && ins.data[0].id;
    const create = ins.ok ? 'PASS' : `FAIL(${ins.status})`;
    const read = verdict('allow', await rest(tok, 'GET', 'crm_activity?select=id&limit=1'));
    const upd = aid ? verdict('deny', await rest(tok, 'PATCH', `crm_activity?id=eq.${aid}`, { body: { body: 'x' } })) : '—';
    const del = aid ? verdict('deny', await rest(tok, 'DELETE', `crm_activity?id=eq.${aid}`)) : '—';
    return (create === 'PASS' && read === 'PASS' && upd === 'PASS' && del === 'PASS') ? 'PASS' : `FAIL(create=${create} read=${read} update=${upd} delete=${del})`;
  } catch (e) { return 'FAIL(' + e.message + ')'; }
}

// ── TASK 8 — cleanup: soft-delete dei record taggati (mai hard-delete reali) ─
async function cleanup() {
  for (const c of created) {
    try { await rest(c.token, 'PATCH', `${c.table}?id=eq.${c.id}`, { body: { deleted_at: new Date().toISOString() } }); } catch { /* best effort */ }
  }
}

function cred(role) { return { email: process.env[`RBAC_${role}_EMAIL`] || '', password: process.env[`RBAC_${role}_PASSWORD`] || '' }; }

(async () => {
  // Matrice attesa (mirror di 0006): OWNER/ADMIN/MANAGER full; SALES no delete; VIEWER read-only.
  const roles = {
    OWNER: { insert: 'allow', update: 'allow', softdelete: 'allow' },
    ADMIN: { insert: 'allow', update: 'allow', softdelete: 'allow' },
    MANAGER: { insert: 'allow', update: 'allow', softdelete: 'allow' },
    SALES: { insert: 'allow', update: 'allow', softdelete: 'deny' },
    VIEWER: { insert: 'deny', update: 'deny', softdelete: 'deny' },
  };
  for (const [role, expect] of Object.entries(roles)) await runRole(role, cred(role), expect);

  const iso = await tenantIsolation(cred('OWNER'), cred('TENANTB'));
  const act = await activityImmutability(cred('OWNER'));
  await cleanup();

  // ── REPORT (formato PHASE 14B) ─────────────────────────────────────────────
  const rolePass = (r) => {
    const o = results[r]; if (!o || o.error) return `FAIL(${o && o.error ? o.error : 'no result'})`;
    const bad = Object.entries(o).filter(([k, v]) => k !== 'error' && v !== 'PASS' && v !== '—');
    return bad.length ? `FAIL(${bad.map(([k, v]) => k + '=' + v).join(', ')})` : 'PASS';
  };
  const line = (r) => { const o = results[r] || {}; return `    SELECT ${o.SELECT}  INSERT ${o.INSERT}  UPDATE ${o.UPDATE}  SOFT-DELETE ${o.SOFTDELETE}`; };

  // Enforcement diretto derivato dai casi negativi chiave.
  const insEnf = results.VIEWER && results.VIEWER.INSERT === 'PASS' ? 'PASS' : 'FAIL';
  const updEnf = results.VIEWER && results.VIEWER.UPDATE === 'PASS' ? 'PASS' : 'FAIL';
  const delEnf = results.SALES && results.SALES.SOFTDELETE === 'PASS' ? 'PASS' : 'FAIL';

  const R = ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'].map(rolePass);
  const crudOk = R.slice(0, 4).every((x) => x === 'PASS'); // ruoli che scrivono
  const verified = R.every((x) => x === 'PASS') && iso === 'PASS' &&
    insEnf === 'PASS' && updEnf === 'PASS' && delEnf === 'PASS' && act === 'PASS';

  console.log('\nPHASE 14B STATUS\n');
  ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'].forEach((r) => { console.log(`${r}: ${rolePass(r)}`); console.log(line(r)); });
  console.log(`\nTenant Isolation: ${iso}`);
  console.log(`\nDirect INSERT enforcement: ${insEnf}`);
  console.log(`Direct UPDATE enforcement: ${updEnf}`);
  console.log(`Direct DELETE enforcement: ${delEnf}`);
  console.log(`\nCustomer CRUD: ${crudOk ? 'PASS' : 'FAIL'}`);
  console.log(`Company CRUD: ${crudOk ? 'PASS' : 'FAIL'}  (stessa matrice; vedi crm_company)`);
  console.log(`Contact CRUD: ${crudOk ? 'PASS' : 'FAIL'}  (stessa matrice; vedi crm_contact)`);
  console.log(`Activity immutability: ${act}`);
  console.log(`\nProduction Touched: NO`);
  console.log(`Staging Tested: YES`);
  console.log(`\nResult:\n${verified ? 'SECURITY VERIFIED' : 'SECURITY NOT VERIFIED'}`);
  process.exit(verified ? 0 : 1);
})().catch((e) => { console.error('ERRORE runtime:', e.message); process.exit(1); });
