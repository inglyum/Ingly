// INGLY OS V2 — test Costi fissi (normalizzazione mensile + burn + break-even).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as FC from '../app-v2/src/fixedcosts.js';
import { renderRows, renderSummary } from '../app-v2/src/fixedcosts-ui.js';

function makeMock(store) {
  let uid = 0;
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, lim: null };
    const api = {
      select() { return api; }, is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; }, or() { return api; }, order() { return api; }, limit(n) { st.lim = n; return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; }, update(row) { st.op = 'update'; st.payload = row; return api; },
      single() { return Promise.resolve(run(st, 'single')); }, then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r))); if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('Costi fissi — normalizzazione', (s) => {
  it(s, 'monthlyAmount per cadenza', async () => {
    assertEq(FC.monthlyAmount(300, 'monthly'), 300);
    assertEq(FC.monthlyAmount(900, 'quarterly'), 300);
    assertEq(FC.monthlyAmount(3600, 'yearly'), 300);
    assertEq(FC.monthlyAmount(30, 'weekly'), 130); // 30*52/12
  });
  it(s, 'summarize: burn mensile/annuo, categorie, break-even', async () => {
    const rows = [
      { name: 'Affitto', category: 'Sede', amount: 500, cadence: 'monthly', active: true },
      { name: 'Software', category: 'IT', amount: 1200, cadence: 'yearly', active: true }, // 100/mese
      { name: 'Vecchio', amount: 999, cadence: 'monthly', active: false }, // escluso
    ];
    const sum = FC.summarize(rows, 45);
    assertEq(sum.monthlyBurn, 600); assertEq(sum.annualBurn, 7200); assertEq(sum.count, 2);
    assertEq(sum.breakEvenOrders, Math.ceil(600 / 45)); // 14
    assertEq(sum.byCategory[0].value, 500); // Sede prima
  });
  it(s, 'break-even null se ticket 0', async () => {
    assertEq(FC.summarize([{ name: 'X', amount: 100, cadence: 'monthly', active: true }], 0).breakEvenOrders, null);
  });
});

describe('Costi fissi — CRUD', (s) => {
  it(s, 'createFixedCost: nome obbligatorio, cadenza invalida → monthly', async () => {
    const sb = makeMock({});
    const c = await FC.createFixedCost(sb, 't1', { name: 'Affitto', amount: 500, cadence: 'daily' });
    assertEq(c.cadence, 'monthly');
    let threw = false; try { await FC.createFixedCost(sb, 't1', { amount: 10 }); } catch { threw = true; }
    assert(threw, 'nome mancante fallisce');
  });
  it(s, 'softDelete esclude dalla lista', async () => {
    const store = {}; const sb = makeMock(store);
    const c = await FC.createFixedCost(sb, 't1', { name: 'X', amount: 10 });
    await FC.softDeleteFixedCost(sb, c.id);
    assertEq((await FC.listFixedCosts(sb, {})).length, 0);
  });
});

describe('Costi fissi — render', (s) => {
  it(s, 'renderSummary + renderRows', async () => {
    assert(/Burn mensile/.test(renderSummary({ monthlyBurn: 600, annualBurn: 7200, count: 2, breakEvenOrders: 14 })), 'summary');
    assert(/Nessun costo fisso/.test(renderRows([])), 'empty');
    assert(/data-edit="c1"/.test(renderRows([{ id: 'c1', name: 'Affitto', category: 'Sede', amount: 500, cadence: 'monthly' }])), 'riga');
  });
});

describe('Costi fissi — migration 0025 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000025_fixed_cost.sql', import.meta.url), 'utf8');
  it(s, 'tabella + RLS + has_permission(finance.fixed_cost)', async () => {
    assert(/create table if not exists public\.fixed_cost\b/.test(sql), 'tabella');
    assert(/has_permission\(tenant_id,'finance\.fixed_cost','read'\)/.test(sql), 'read perm');
    assert(/crm_enforce_delete_perm\('finance\.fixed_cost'\)/.test(sql), 'trigger delete');
  });
});
