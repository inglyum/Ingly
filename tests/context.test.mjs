// INGLY OS V2 — test risoluzione contesto auth→tenant→ruolo→permessi (offline).
// Mock Supabase minimale del subset usato da loadContext.
import { describe, it, assert, assertEq } from './harness.mjs';
import { loadContext, claimsFromSession, permissionsForRole, can, roleForTenant } from '../app-v2/src/context.js';

function jwtFor(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}
function makeMock(data) {
  // data: { profile:{...}|null, membership:[], user_role:[], role:[] }
  function builder(table) {
    const st = { table, filters: [] };
    const api = {
      select() { return api; },
      eq(col, val) { st.filters.push((r) => String(r[col]) === String(val)); return api; },
      order() { return api; },
      maybeSingle() { return Promise.resolve({ data: pick(table)[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: pick(table), error: null }).then(res, rej); },
    };
    function pick(t) {
      let rows = (data[map(t)] || []).slice();
      rows = rows.filter((r) => st.filters.every((f) => f(r)));
      return rows;
    }
    function map(t) { return { profile: 'profile', tenant_membership: 'membership', user_role: 'user_role', role: 'role' }[t]; }
    return api;
  }
  return { from: (t) => builder(t) };
}

describe('Context — risoluzione auth→tenant→ruolo (offline)', (s) => {
  it(s, 'AUTHENTICATED con claim: usa tenant/ruolo dal JWT (source=claim)', async () => {
    const token = jwtFor({ sub: 'u1', email: 'a@b.it', app_metadata: { tenant_ids: ['t1'], roles: { t1: 'OWNER' }, active_tenant: 't1' } });
    const sb = makeMock({ profile: [{ id: 'u1' }], membership: [], user_role: [], role: [{ key: 'OWNER' }] });
    const ctx = await loadContext(sb, { access_token: token });
    assertEq(ctx.source, 'claim');
    assertEq(ctx.activeTenant, 't1');
    assertEq(roleForTenant(ctx, 't1'), 'OWNER');
  });

  it(s, 'AUTHENTICATED senza claim: FALLBACK dal DB (membership + user_role) → source=db', async () => {
    const token = jwtFor({ sub: 'u1', email: 'a@b.it', app_metadata: {} });
    const sb = makeMock({
      profile: [{ id: 'u1' }],
      membership: [{ user_id: 'u1', tenant_id: 't9', status: 'active' }],
      user_role: [{ user_id: 'u1', tenant_id: 't9', role: { key: 'SALES' } }],
      role: [{ key: 'SALES' }],
    });
    const ctx = await loadContext(sb, { access_token: token });
    assertEq(ctx.source, 'db');
    assertEq(ctx.activeTenant, 't9');
    assertEq(ctx.activeRole, 'SALES');
    assertEq(ctx.tenantIds.length, 1);
  });

  it(s, 'ANONYMOUS (nessuna sessione): nessun tenant/ruolo, source=none', async () => {
    const sb = makeMock({ profile: [], membership: [], user_role: [], role: [] });
    const ctx = await loadContext(sb, null);
    assertEq(ctx.source, 'none');
    assertEq(ctx.activeTenant, null);
    assertEq(ctx.tenantIds.length, 0);
  });

  it(s, 'NO-TENANT: sessione valida ma nessuna membership → tenant assente', async () => {
    const token = jwtFor({ sub: 'u1', email: 'a@b.it', app_metadata: {} });
    const sb = makeMock({ profile: [{ id: 'u1' }], membership: [], user_role: [], role: [] });
    const ctx = await loadContext(sb, { access_token: token });
    assertEq(ctx.tenantIds.length, 0);
    assertEq(ctx.activeTenant, null);
    assertEq(ctx.source, 'none');
  });

  it(s, 'NO-ROLE: membership presente ma nessun user_role → ruolo nullo', async () => {
    const token = jwtFor({ sub: 'u1', email: 'a@b.it', app_metadata: {} });
    const sb = makeMock({ profile: [{ id: 'u1' }], membership: [{ user_id: 'u1', tenant_id: 't9', status: 'active' }], user_role: [], role: [] });
    const ctx = await loadContext(sb, { access_token: token });
    assertEq(ctx.activeTenant, 't9');
    assertEq(ctx.activeRole, null);
  });

  it(s, 'PERMISSIONS: derivazione per ruolo + can()', async () => {
    assert(permissionsForRole('SALES').includes('create'), 'SALES crea');
    assert(!permissionsForRole('SALES').includes('delete'), 'SALES non elimina');
    assertEq(permissionsForRole('VIEWER').join(','), 'read');
    const ctx = { activeTenant: 't1', roles: { t1: 'MANAGER' } };
    assert(can(ctx, 'delete'), 'MANAGER elimina');
    assert(!can({ activeTenant: 't1', roles: { t1: 'VIEWER' } }, 'create'), 'VIEWER non crea');
  });
});
