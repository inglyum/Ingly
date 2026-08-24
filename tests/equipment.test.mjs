// INGLY OS V2 — test Attrezzature/Macchine (anagrafica + tariffa €/min + Quoter).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as EQ from '../app-v2/src/equipment.js';
import { renderRows, renderForm } from '../app-v2/src/equipment-ui.js';

function makeMock(store) {
  let uid = 0;
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, lim: null };
    const api = { select() { return api; }, is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; }, eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; }, or() { return api; }, order() { return api; }, limit(n) { st.lim = n; return api; }, insert(row) { st.op = 'insert'; st.payload = row; return api; }, update(row) { st.op = 'update'; st.payload = row; return api; }, single() { return Promise.resolve(run(st, 'single')); }, then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); } };
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

describe('Attrezzature — tariffa €/min', (s) => {
  it(s, 'costPerMin: usa cost_per_min; fallback €/h ÷ 60', async () => {
    assertEq(EQ.costPerMin({ cost_per_min: 0.5 }), 0.5);
    assertEq(EQ.costPerMin({ cost_per_min: 0, hourly_cost: 30 }), 0.5); // 30/60
    assertEq(EQ.costPerMin({}), 0);
  });
});

describe('Attrezzature — CRUD', (s) => {
  it(s, 'createEquipment: nome obbligatorio, default attivo', async () => {
    const sb = makeMock({});
    const e = await EQ.createEquipment(sb, 't1', { name: 'xTool P2', category: 'laser', cost_per_min: 0.4 });
    assert(e.active && e.cost_per_min === 0.4, 'default + tariffa');
    let threw = false; try { await EQ.createEquipment(sb, 't1', { cost_per_min: 1 }); } catch { threw = true; }
    assert(threw, 'nome mancante fallisce');
  });
  it(s, 'sanitize: tariffa negativa → 0, campi opzionali vuoti → null', async () => {
    const sb = makeMock({});
    const e = await EQ.createEquipment(sb, 't1', { name: 'X', cost_per_min: -1, hourly_cost: '', power_w: '' });
    assertEq(e.cost_per_min, 0); assertEq(e.hourly_cost, null); assertEq(e.power_w, null);
  });
  it(s, 'softDelete esclude dalla lista', async () => {
    const store = {}; const sb = makeMock(store);
    const e = await EQ.createEquipment(sb, 't1', { name: 'X' });
    await EQ.softDeleteEquipment(sb, e.id);
    assertEq((await EQ.listEquipment(sb, {})).length, 0);
  });
});

describe('Attrezzature — render', (s) => {
  it(s, 'renderRows mostra tariffa/min; empty', async () => {
    assert(/Nessuna macchina/.test(renderRows([])), 'empty');
    assert(/data-edit="e1"/.test(renderRows([{ id: 'e1', name: 'xTool', category: 'laser', cost_per_min: 0.5, active: true }])), 'riga');
  });
  it(s, 'renderForm nuovo/esistente', async () => {
    assert(/Nuova macchina/.test(renderForm(null)), 'nuovo');
    assert(/Modifica macchina/.test(renderForm({ id: 'e1', name: 'X' })), 'modifica');
  });
});

describe('Attrezzature — migration 0029 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000029_equipment.sql', import.meta.url), 'utf8');
  it(s, 'tabella equipment + cost_per_mq catalogo + RLS + has_permission', async () => {
    assert(/create table if not exists public\.equipment\b/.test(sql), 'tabella equipment');
    assert(/cost_per_min numeric not null/.test(sql), 'tariffa min');
    assert(/catalog_product add column if not exists cost_per_mq numeric/.test(sql), 'cost_per_mq catalogo');
    assert(/has_permission\(tenant_id,'assets\.equipment','read'\)/.test(sql), 'read perm');
    assert(/crm_enforce_delete_perm\('assets\.equipment'\)/.test(sql), 'trigger delete');
  });
});
