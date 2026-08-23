// INGLY OS V2 — test Fatture ricorrenti (template + generazione fattura reale).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as REC from '../app-v2/src/recurring.js';
import { renderRows, renderForm } from '../app-v2/src/recurring-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {};
  function onInsert(table, row) {
    if (table === 'sales_invoice') { const y = row.issue_date ? Number(String(row.issue_date).slice(0, 4)) : 2026; const k = table + row.tenant_id + y; counters[k] = (counters[k] || 0) + 1; row.year = y; row.number = 'FATT-' + y + '-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; }
    if (table.endsWith('_line')) row.line_total = Math.round((row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0)) * 100) / 100;
  }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or() { return api; }, order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; }, limit(n) { st.lim = n; return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; },
      update(row) { st.op = 'update'; st.payload = row; return api; },
      single() { return Promise.resolve(run(st, 'single')); },
      maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; onInsert(st.table, row); arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const iso = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => iso(new Date(Date.now() + n * 86400000));

describe('Ricorrenti — logica date', (s) => {
  it(s, 'advanceDate per cadenza', async () => {
    assertEq(REC.advanceDate('2026-01-15', 'weekly'), '2026-01-22');
    assertEq(REC.advanceDate('2026-01-15', 'monthly'), '2026-02-15');
    assertEq(REC.advanceDate('2026-01-15', 'quarterly'), '2026-04-15');
    assertEq(REC.advanceDate('2026-01-15', 'yearly'), '2027-01-15');
  });
  it(s, 'dueList: solo attivi con next_run_date <= oggi', async () => {
    const rows = [
      { id: 'a', active: true, next_run_date: daysFromNow(-1), deleted_at: null },
      { id: 'b', active: true, next_run_date: daysFromNow(3), deleted_at: null },
      { id: 'c', active: false, next_run_date: daysFromNow(-5), deleted_at: null },
    ];
    const due = REC.dueList(rows);
    assertEq(due.length, 1); assertEq(due[0].id, 'a');
  });
});

describe('Ricorrenti — CRUD + generazione', (s) => {
  it(s, 'createRecurring: default + descrizione obbligatoria', async () => {
    const sb = makeMock({});
    const r = await REC.createRecurring(sb, 't1', { description: 'Canone mensile', amount: 100 });
    assertEq(r.cadence, 'monthly'); assertEq(r.vat_rate, 22); assert(r.active, 'attivo default');
    let threw = false; try { await REC.createRecurring(sb, 't1', { amount: 5 }); } catch { threw = true; }
    assert(threw, 'descrizione mancante deve fallire');
  });
  it(s, 'cadenza non valida → monthly', async () => {
    const sb = makeMock({});
    const r = await REC.createRecurring(sb, 't1', { description: 'X', cadence: 'daily' });
    assertEq(r.cadence, 'monthly');
  });
  it(s, 'generateOne: crea fattura reale + riga, avanza next_run_date', async () => {
    const store = {}; const sb = makeMock(store);
    const r = await REC.createRecurring(sb, 't1', { description: 'Canone', amount: 100, vat_rate: 22, cadence: 'monthly', next_run_date: '2026-01-31', customer_name: 'ACME' });
    const inv = await REC.generateOne(sb, 't1', r.id);
    assert(/^FATT-/.test(inv.number), 'numero fiscale');
    const line = store.sales_invoice_line[0];
    assertEq(line.unit_price, 100); assertEq(line.tax, 22); // 100 * 22%
    const updated = store.recurring_invoice[0];
    assertEq(updated.next_run_date, '2026-02-28'); // 31 gen + 1 mese (JS → 28 feb 2026)
    assertEq(updated.last_invoice_id, inv.id);
  });
  it(s, 'generateDue: genera solo le scadute', async () => {
    const store = {}; const sb = makeMock(store);
    await REC.createRecurring(sb, 't1', { description: 'Scaduta', amount: 50, next_run_date: daysFromNow(-2) });
    await REC.createRecurring(sb, 't1', { description: 'Futura', amount: 50, next_run_date: daysFromNow(10) });
    const n = await REC.generateDue(sb, 't1');
    assertEq(n, 1);
    assertEq((store.sales_invoice || []).length, 1);
  });
});

describe('Ricorrenti — render', (s) => {
  it(s, 'renderRows evidenzia le scadute; empty', async () => {
    assert(/Nessun template/.test(renderRows([])), 'empty');
    const html = renderRows([{ id: 'r1', description: 'Canone', customer_name: 'ACME', amount: 100, cadence: 'monthly', next_run_date: daysFromNow(-1), active: true }]);
    assert(/v2-row-warn/.test(html) && /data-gen="r1"/.test(html), 'scaduta evidenziata + azione');
  });
  it(s, 'renderForm nuovo/esistente', async () => {
    assert(/Nuovo template/.test(renderForm(null, [])), 'nuovo');
    assert(/Modifica template/.test(renderForm({ id: 'r1', description: 'X', cadence: 'monthly' }, [])), 'modifica');
  });
});

describe('Ricorrenti — migration 0023 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000023_recurring_invoice.sql', import.meta.url), 'utf8');
  it(s, 'tabella + RLS + has_permission(sales.recurring) + trigger delete', async () => {
    assert(/create table if not exists public\.recurring_invoice\b/.test(sql), 'tabella');
    assert(/has_permission\(tenant_id,'sales\.recurring','read'\)/.test(sql), 'read perm');
    assert(/cadence in \('weekly','monthly','quarterly','yearly'\)/.test(sql), 'cadenze');
    assert(/crm_enforce_delete_perm\('sales\.recurring'\)/.test(sql), 'trigger delete');
  });
});
