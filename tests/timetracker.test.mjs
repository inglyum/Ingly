// INGLY OS V2 — test Time Tracker (registro ore + aggregazioni + KPI).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as TT from '../app-v2/src/timetracker.js';
import { renderRows, renderSummary } from '../app-v2/src/timetracker-ui.js';

function makeMock(store) {
  let uid = 0;
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
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

describe('Time Tracker — CRUD', (s) => {
  it(s, 'createEntry: default + descrizione obbligatoria', async () => {
    const sb = makeMock({});
    const e = await TT.createEntry(sb, 't1', { description: 'Incisione', minutes: 90 });
    assertEq(e.minutes, 90); assert(e.billable, 'fatturabile default'); assertEq(e.hourly_rate, 18);
    let threw = false; try { await TT.createEntry(sb, 't1', { minutes: 30 }); } catch { threw = true; }
    assert(threw, 'descrizione mancante fallisce');
  });
  it(s, 'sanitize: minuti negativi → 0, project vuoto → null', async () => {
    const sb = makeMock({});
    const e = await TT.createEntry(sb, 't1', { description: 'X', minutes: -50, project_id: '' });
    assertEq(e.minutes, 0); assertEq(e.project_id, null);
  });
  it(s, 'softDelete rimuove dalla lista', async () => {
    const store = {}; const sb = makeMock(store);
    const e = await TT.createEntry(sb, 't1', { description: 'X', minutes: 60 });
    await TT.softDeleteEntry(sb, e.id);
    assertEq((await TT.listEntries(sb, {})).length, 0);
  });
});

describe('Time Tracker — aggregazioni', (s) => {
  const entries = [
    { billable: true, minutes: 120, hourly_rate: 18, entry_date: daysAgo(1) },
    { billable: true, minutes: 60, hourly_rate: 20, entry_date: daysAgo(2) },
    { billable: false, minutes: 90, hourly_rate: 18, entry_date: daysAgo(1) },
    { billable: true, minutes: 300, hourly_rate: 18, entry_date: daysAgo(20) }, // fuori settimana
  ];
  it(s, 'summarize: ore totali/fatturabili/valore', async () => {
    const sum = TT.summarize(entries);
    assertEq(sum.totalHours, 9.5); // (120+60+90+300)/60
    assertEq(sum.billableHours, 8); // (120+60+300)/60
    assertEq(sum.billableValue, 36 + 20 + 90); // 2h*18 + 1h*20 + 5h*18
  });
  it(s, 'billableHours in intervallo (ultimi 7 gg)', async () => {
    const bh = TT.billableHours(entries, daysAgo(6), daysAgo(0));
    assertEq(bh, 3); // solo 120+60 minuti fatturabili nella settimana
  });
});

describe('Time Tracker — render', (s) => {
  it(s, 'renderSummary evidenzia KPI settimana vs 15h', async () => {
    assert(/v2-bad/.test(renderSummary({ totalHours: 3, billableHours: 3, billableValue: 54 }, 3)), 'sotto 15h → bad');
    assert(/v2-ok/.test(renderSummary({ totalHours: 20, billableHours: 18, billableValue: 324 }, 18)), '≥15h → ok');
  });
  it(s, 'renderRows + empty', async () => {
    assert(/Nessuna registrazione/.test(renderRows([], {})), 'empty');
    assert(/data-del="e1"/.test(renderRows([{ id: 'e1', entry_date: '2026-08-01', description: 'X', minutes: 90, billable: true }], {})), 'riga');
  });
});

describe('Time Tracker — migration 0024 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000024_time_entry.sql', import.meta.url), 'utf8');
  it(s, 'tabella + FK project + RLS + has_permission(work.time)', async () => {
    assert(/create table if not exists public\.time_entry\b/.test(sql), 'tabella');
    assert(/project_id uuid references public\.project\(id\)/.test(sql), 'FK project');
    assert(/has_permission\(tenant_id,'work\.time','read'\)/.test(sql), 'read perm');
    assert(/crm_enforce_delete_perm\('work\.time'\)/.test(sql), 'trigger delete');
  });
});
