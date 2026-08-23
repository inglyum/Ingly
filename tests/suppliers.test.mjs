// INGLY OS V2 — test Fornitori (data-layer + render), offline.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as SUP from '../app-v2/src/suppliers.js';
import { renderSupplierRows, renderSupplierDetail, renderSupplierForm } from '../app-v2/src/suppliers-ui.js';

function makeMock(store) {
  let uid = 0;
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or(expr) { const parts = expr.split(',').map((p) => { const m = p.match(/^(\w+)\.ilike\.%(.*)%$/); return m ? { col: m[1], q: m[2].toLowerCase() } : null; }).filter(Boolean);
        st.filters.push((r) => parts.some((p) => String(r[p.col] || '').toLowerCase().includes(p.q))); return api; },
      order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; },
      limit(n) { st.lim = n; return api; },
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
    if (st.op === 'insert') { const row = { id: 's' + (++uid), ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const seed = () => ({ supplier: [
  { id: 's1', tenant_id: 't1', name: 'Legnami Belice', vat: 'IT111', email: 'info@legnami.it', active: true, deleted_at: null },
  { id: 's2', tenant_id: 't1', name: 'Plexi Sud', vat: 'IT222', active: true, deleted_at: null },
  { id: 's3', tenant_id: 't1', name: 'Vecchio', vat: 'IT999', active: false, deleted_at: '2026-01-01' },
] });

describe('Fornitori data-layer (offline)', (s) => {
  it(s, 'listSuppliers esclude soft-deleted', async () => {
    const l = await SUP.listSuppliers(makeMock(seed()), {});
    assertEq(l.length, 2); assert(!l.some((x) => x.id === 's3'), 'soft-deleted incluso');
  });
  it(s, 'ricerca su nome/vat/email', async () => {
    assertEq((await SUP.listSuppliers(makeMock(seed()), { search: 'plexi' })).length, 1);
    assertEq((await SUP.listSuppliers(makeMock(seed()), { search: 'legnami.it' })).length, 1);
  });
  it(s, 'createSupplier forza tenant_id; update imposta updated_at; softDelete', async () => {
    const st = seed(); const sb = makeMock(st);
    const out = await SUP.createSupplier(sb, 't1', { name: 'Nuovo' });
    assertEq(out.tenant_id, 't1'); assertEq(st.supplier.length, 4);
    const up = await SUP.updateSupplier(sb, out.id, { phone: '333' }); assert(up.updated_at, 'no updated_at');
    await SUP.softDeleteSupplier(sb, out.id); assert(st.supplier.find((x) => x.id === out.id).deleted_at, 'non archiviato');
  });
});

describe('Fornitori render + RBAC (offline)', (s) => {
  it(s, 'renderSupplierRows + empty', async () => {
    assert(/data-sup="s1"/.test(renderSupplierRows([{ id: 's1', name: 'X', vat: 'V', active: true }])), 'riga');
    assert(/Nessun fornitore/.test(renderSupplierRows([])), 'empty');
  });
  it(s, 'renderSupplierDetail: edit SALES, archivia MANAGER+, VIEWER read-only', async () => {
    const su = { id: 's1', name: 'X', active: true };
    assert(/data-edit="s1"/.test(renderSupplierDetail(su, 'SALES')), 'edit SALES');
    assert(!/data-del/.test(renderSupplierDetail(su, 'SALES')), 'SALES non archivia');
    assert(/data-del/.test(renderSupplierDetail(su, 'MANAGER')), 'MANAGER archivia');
    assert(!/data-edit/.test(renderSupplierDetail(su, 'VIEWER')), 'VIEWER read-only');
  });
  it(s, 'renderSupplierForm nuovo vs modifica', async () => {
    assert(/Nuovo fornitore/.test(renderSupplierForm()), 'nuovo');
    assert(/Modifica fornitore/.test(renderSupplierForm({ id: 's1', name: 'X' })), 'modifica');
  });
});

describe('Fornitori migration 0012 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000012_supplier.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(purchasing.supplier) + trigger delete condiviso', async () => {
    assert(/alter table public\.supplier enable row level security/.test(sql), 'RLS');
    assert(/has_permission\(tenant_id,'purchasing\.supplier','read'\)/.test(sql), 'read perm');
    assert(/crm_enforce_delete_perm\('purchasing\.supplier'\)/.test(sql), 'trigger delete');
  });
});
