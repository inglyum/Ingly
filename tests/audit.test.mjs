// INGLY OS V2 — test Audit Log (lettura + RBAC UI + trigger server statico).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as AUD from '../app-v2/src/audit.js';
import { renderRows } from '../app-v2/src/audit-ui.js';

function makeMock(store) {
  function builder(table) {
    const st = { table, filters: [], orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; }, eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      is() { return api; }, or() { return api; }, order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; }, limit(n) { st.lim = n; return api; },
      then(res, rej) { return Promise.resolve({ data: run(st), error: null }).then(res, rej); },
    };
    return api;
  }
  function run(st) { let rows = (store[st.table] || []).filter((r) => st.filters.every((f) => f(r))); if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); }); if (st.lim) rows = rows.slice(0, st.lim); return rows; }
  return { from: (t) => builder(t) };
}

const store = () => ({
  audit_log: [
    { id: 'a1', tenant_id: 't1', table_name: 'sales_invoice', op: 'INSERT', row_id: 'inv1', actor: 'u1', at: '2026-08-20T10:00:00Z' },
    { id: 'a2', tenant_id: 't1', table_name: 'tenant_settings', op: 'UPDATE', row_id: 't1', actor: 'u1', at: '2026-08-21T11:00:00Z' },
    { id: 'a3', tenant_id: 't1', table_name: 'sales_payment', op: 'DELETE', row_id: 'pay1', actor: 'u2', at: '2026-08-22T09:00:00Z' },
  ],
});

describe('Audit — lettura', (s) => {
  it(s, 'listAudit ordina per data desc', async () => {
    const rows = await AUD.listAudit(makeMock(store()), {});
    assertEq(rows.length, 3); assertEq(rows[0].id, 'a3'); // più recente
  });
  it(s, 'filtro per entità e operazione', async () => {
    assertEq((await AUD.listAudit(makeMock(store()), { table: 'sales_invoice' })).length, 1);
    assertEq((await AUD.listAudit(makeMock(store()), { op: 'DELETE' })).length, 1);
  });
  it(s, 'label entità/operazione', async () => {
    assertEq(AUD.tableLabel('sales_invoice'), 'Fattura');
    assertEq(AUD.opLabel('DELETE'), 'Eliminazione');
    assertEq(AUD.tableLabel('sconosciuta'), 'sconosciuta');
  });
});

describe('Audit — render', (s) => {
  it(s, 'renderRows con badge e empty', async () => {
    assert(/Nessuna operazione/.test(renderRows([])), 'empty');
    const html = renderRows(store().audit_log);
    assert(/Fattura/.test(html) && /Eliminazione/.test(html), 'label');
    assert(/v2-ok/.test(html) && /v2-bad/.test(html), 'classi op create/delete');
  });
});

describe('Audit — migration 0026 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000026_audit_log.sql', import.meta.url), 'utf8');
  it(s, 'tabella + trigger SECURITY DEFINER + RLS read OWNER/ADMIN + trigger su tabelle sensibili', async () => {
    assert(/create table if not exists public\.audit_log\b/.test(sql), 'tabella');
    assert(/function public\.audit_row\(\)[\s\S]*security definer/.test(sql), 'trigger function security definer');
    assert(/r\.key in \('OWNER','ADMIN'\)/.test(sql), 'read solo OWNER/ADMIN');
    assert(/has_permission\(tenant_id,'system\.audit','read'\)/.test(sql), 'RLS read perm');
    assert(/sales_invoice','sales_order','sales_payment','catalog_product','tenant_settings'/.test(sql), 'tabelle sensibili tracciate');
    assert(!/for insert to authenticated/.test(sql), 'nessuna policy di scrittura via API');
  });
});
