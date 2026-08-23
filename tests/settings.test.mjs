// INGLY OS V2 — test Impostazioni ERP (singleton per tenant + RBAC + statica).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as SET from '../app-v2/src/settings.js';
import { renderForm } from '../app-v2/src/settings-ui.js';

function makeMock(store) {
  let uid = 0;
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null };
    const api = {
      select() { return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      is() { return api; }, or() { return api; }, order() { return api; }, limit() { return api; },
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
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    const rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('Impostazioni — RBAC e default', (s) => {
  it(s, 'canEditSettings: solo OWNER/ADMIN', async () => {
    assert(SET.canEditSettings('OWNER') && SET.canEditSettings('ADMIN'), 'owner/admin');
    assert(!SET.canEditSettings('MANAGER') && !SET.canEditSettings('SALES') && !SET.canEditSettings('VIEWER'), 'altri no');
  });
  it(s, 'getSettings senza riga → DEFAULTS KB, _exists false', async () => {
    const s2 = await SET.getSettings(makeMock({}), 't1');
    assertEq(s2._exists, false);
    assertEq(s2.labor_rate, 18); assertEq(s2.sfrido_pct, 15); assertEq(s2.markup_b2c, 3);
    assertEq(s2.markup_b2b, 2.5); assertEq(s2.markup_etsy, 3.5); assertEq(s2.default_vat_rate, 22);
    assertEq(s2.cash_tax_pct, 15); assertEq(s2.cash_operational_pct, 60);
  });
  it(s, 'cashBucketsValid: 15/10/15/60 = 100 ✓; alterato ✗', async () => {
    assert(SET.cashBucketsValid(SET.DEFAULTS), 'default somma 100');
    assert(!SET.cashBucketsValid({ ...SET.DEFAULTS, cash_operational_pct: 50 }), 'somma 90 non valida');
  });
});

describe('Impostazioni — persistenza', (s) => {
  it(s, 'saveSettings: prima scrittura insert, seconda update', async () => {
    const store = {}; const sb = makeMock(store);
    const a = await SET.saveSettings(sb, 't1', { company_name: 'Ingly Design', labor_rate: 20 });
    assertEq(store.tenant_settings.length, 1);
    assertEq(a.company_name, 'Ingly Design'); assertEq(a.labor_rate, 20);
    const b = await SET.saveSettings(sb, 't1', { city: 'San Cipirello' });
    assertEq(store.tenant_settings.length, 1); // niente riga duplicata
    assertEq(b.city, 'San Cipirello'); assertEq(b.labor_rate, 20); // valore precedente conservato
  });
  it(s, 'sanitize: ignora chiavi ignote, coerce numerici, trim testo', async () => {
    const store = {}; const sb = makeMock(store);
    const r = await SET.saveSettings(sb, 't1', { markup_b2c: '4', company_name: '  Ingly  ', hacker: 'x', tenant_id: 'evil' });
    assertEq(r.markup_b2c, 4); assertEq(r.company_name, 'Ingly');
    assert(!('hacker' in store.tenant_settings[0]), 'chiave ignota scartata');
    assertEq(store.tenant_settings[0].tenant_id, 't1'); // tenant non sovrascrivibile via patch
  });
});

describe('Impostazioni — render', (s) => {
  it(s, 'renderForm: nota default-OFF, sezioni, salva solo se editable', async () => {
    const editable = renderForm(SET.DEFAULTS, true);
    assert(/non ancora cablate/i.test(editable), 'nota default-OFF');
    assert(/data-save/.test(editable), 'bottone salva per editable');
    assert(/Cassa profit-first/.test(editable) && /Pricing/.test(editable), 'sezioni');
    const ro = renderForm(SET.DEFAULTS, false);
    assert(!/data-save/.test(ro), 'niente salva se non editable');
    assert(/disabled/.test(ro), 'input disabilitati in sola lettura');
  });
});

describe('Impostazioni migration 0021 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000021_tenant_settings.sql', import.meta.url), 'utf8');
  it(s, 'tabella singleton + RLS + has_permission + update solo OWNER/ADMIN + default KB', async () => {
    assert(/create table if not exists public\.tenant_settings\b/.test(sql), 'tabella');
    assert(/tenant_id uuid primary key references public\.tenant\(id\)/.test(sql), 'PK tenant_id (singleton)');
    assert(/has_permission\(tenant_id,'settings\.tenant','read'\)/.test(sql), 'read perm');
    assert(/a\.action = 'update' and r\.key in \('OWNER','ADMIN'\)/.test(sql), 'update solo OWNER/ADMIN');
    assert(/labor_rate numeric not null default 18/.test(sql), 'default lavoro 18');
    assert(/markup_b2c numeric not null default 3/.test(sql), 'default markup B2C 3');
  });
});
