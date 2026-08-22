// INGLY OS V2 — test Dashboard (data-layer + render), offline con mock Supabase.
import { describe, it, assert, assertEq } from './harness.mjs';
import { loadDashboard } from '../app-v2/src/dashboard.js';
import { renderDashboard } from '../app-v2/src/dashboard-ui.js';

// Mock minimale del subset usato da CRM.list* (select/is/eq/or/order/limit/then).
function makeMock(store) {
  function builder(table) {
    const st = { table, filters: [], orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(col, val) { st.filters.push((r) => r[col] === val || (val === null && r[col] == null)); return api; },
      eq(col, val) { st.filters.push((r) => String(r[col]) === String(val)); return api; },
      or() { return api; },
      order(col, o) { st.orderBy = col; st.asc = !o || o.ascending; return api; },
      limit(n) { st.lim = n; return api; },
      then(res, rej) { return Promise.resolve(run(st)).then(res, rej); },
    };
    return api;
  }
  function run(st) {
    let rows = (store[st.table] || []).filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => (a[st.orderBy] > b[st.orderBy] ? 1 : -1) * (st.asc ? 1 : -1));
    if (st.lim) rows = rows.slice(0, st.lim);
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

function seed() {
  return {
    crm_customer: [
      { id: 'c1', tenant_id: 't1', name: 'Mario', type: 'B2C', value_cached: 100, deleted_at: null },
      { id: 'c2', tenant_id: 't1', name: 'Blu Srl', type: 'B2B', value_cached: 900, deleted_at: null },
      { id: 'c3', tenant_id: 't1', name: 'Rmvd', type: 'B2C', value_cached: 5, deleted_at: '2026-01-01' },
    ],
    crm_company: [{ id: 'co1', tenant_id: 't1', name: 'Blu', deleted_at: null }],
    crm_activity: [
      { id: 'a1', tenant_id: 't1', customer_id: 'c1', type: 'note', body: 'x', occurred_at: '2026-01-01' },
      { id: 'a2', tenant_id: 't1', customer_id: 'c2', type: 'call', body: 'y', occurred_at: '2026-02-01' },
    ],
  };
}

describe('Dashboard data-layer (offline)', (s) => {
  it(s, 'loadDashboard aggrega conteggi e valore escludendo soft-deleted', async () => {
    const d = await loadDashboard(makeMock(seed()));
    assertEq(d.customers, 2); assertEq(d.companies, 1); assertEq(d.activities, 2);
    assertEq(d.b2b, 1); assertEq(d.b2c, 1); assertEq(d.totalValue, 1000);
    assertEq(d.recentActivities[0].id, 'a2'); // ordinamento desc
    assertEq(d.error, null);
  });
  it(s, 'loadDashboard non lancia: errori → metriche a 0', async () => {
    const broken = { from() { throw new Error('boom'); } };
    const d = await loadDashboard(broken);
    assertEq(d.customers, 0); assert(d.error, 'error non impostato');
  });
});

describe('Dashboard render (offline)', (s) => {
  it(s, 'renderDashboard mostra KPI reali e liste', async () => {
    const html = renderDashboard({ customers: 2, companies: 1, activities: 2, b2b: 1, b2c: 1, totalValue: 1000,
      recentCustomers: [{ name: 'Mario', type: 'B2C', value_cached: 100 }],
      recentActivities: [{ type: 'note', body: 'x', occurred_at: '2026-01-01' }] });
    assert(/Clienti/.test(html) && />2</.test(html), 'conteggio clienti');
    assert(/€\s?1\.?000|€1000|1\.000/.test(html), 'valore totale');
    assert(/Mario/.test(html), 'ultimo cliente');
  });
  it(s, 'renderDashboard: stati vuoti onesti', async () => {
    const html = renderDashboard({ customers: 0, companies: 0, activities: 0, b2b: 0, b2c: 0, totalValue: 0, recentCustomers: [], recentActivities: [] });
    assert(/Nessun cliente ancora/.test(html), 'empty clienti');
    assert(/Nessuna attività/.test(html), 'empty attività');
  });
});
