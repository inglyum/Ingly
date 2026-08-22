// INGLY OS V2 — test Catalogo prodotti/servizi (data-layer + render), offline.
import { describe, it, assert, assertEq } from './harness.mjs';
import * as CAT from '../app-v2/src/catalog.js';
import { renderProductRows, renderProductDetail, renderProductForm } from '../app-v2/src/catalog-ui.js';

function makeMock(store) {
  let uid = 500;
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
    if (st.op === 'insert') { const row = { id: 'p' + (++uid), ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => (a[st.orderBy] > b[st.orderBy] ? 1 : -1) * (st.asc ? 1 : -1));
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

function seed() {
  return { catalog_product: [
    { id: 'p1', tenant_id: 't1', sku: 'TRG-A5', name: 'Targa A5', category: 'Targhe', kind: 'product', price: 29.9, cost: 8, unit: 'pz', active: true, deleted_at: null },
    { id: 'p2', tenant_id: 't1', sku: 'QR-MENU', name: 'QR Menu', category: 'Ristoranti', kind: 'service', price: 19.9, cost: 2, unit: 'pz', active: true, deleted_at: null },
    { id: 'p3', tenant_id: 't1', sku: 'OLD', name: 'Ritirato', kind: 'product', price: 5, cost: 1, active: false, deleted_at: '2026-01-01' },
  ] };
}

describe('Catalogo data-layer (offline)', (s) => {
  it(s, 'listProducts esclude soft-deleted', async () => {
    const l = await CAT.listProducts(makeMock(seed()), {});
    assertEq(l.length, 2); assert(!l.some((p) => p.id === 'p3'), 'soft-deleted incluso');
  });
  it(s, 'listProducts filtra per kind e ricerca sku/nome', async () => {
    const svc = await CAT.listProducts(makeMock(seed()), { kind: 'service' });
    assertEq(svc.length, 1); assertEq(svc[0].id, 'p2');
    const byName = await CAT.listProducts(makeMock(seed()), { search: 'targa' });
    assertEq(byName.length, 1); assertEq(byName[0].id, 'p1');
  });
  it(s, 'createProduct forza tenant_id; updateProduct imposta updated_at', async () => {
    const st = seed(); const sb = makeMock(st);
    const out = await CAT.createProduct(sb, 't1', { name: 'Nuovo', kind: 'product', price: 10 });
    assertEq(out.tenant_id, 't1'); assertEq(st.catalog_product.length, 4);
    const up = await CAT.updateProduct(sb, out.id, { price: 12 });
    assert(up.updated_at, 'updated_at mancante'); assertEq(up.price, 12);
  });
  it(s, 'softDeleteProduct imposta deleted_at (no hard delete)', async () => {
    const st = seed(); const sb = makeMock(st);
    await CAT.softDeleteProduct(sb, 'p1');
    assert(st.catalog_product.find((p) => p.id === 'p1').deleted_at, 'non archiviato');
  });
  it(s, 'margin calcola il margine %', async () => {
    assertEq(CAT.margin({ price: 100, cost: 40 }), 60);
    assertEq(CAT.margin({ price: 0, cost: 10 }), 0);
  });
});

describe('Catalogo render + RBAC (offline)', (s) => {
  it(s, 'renderProductRows: righe + empty state', async () => {
    assert(/data-prod="p1"/.test(renderProductRows([{ id: 'p1', name: 'Targa', sku: 'X', kind: 'product', price: 29.9, active: true }])), 'riga');
    assert(/Nessun prodotto/.test(renderProductRows([])), 'empty');
  });
  it(s, 'renderProductDetail: edit per SALES, archivia solo MANAGER+, VIEWER read-only', async () => {
    const p = { id: 'p1', name: 'Targa', kind: 'product', price: 29.9, cost: 8, active: true };
    assert(/data-edit="p1"/.test(renderProductDetail(p, 'SALES')), 'edit SALES');
    assert(!/data-del/.test(renderProductDetail(p, 'SALES')), 'SALES non archivia');
    assert(/data-del/.test(renderProductDetail(p, 'MANAGER')), 'MANAGER archivia');
    assert(!/data-edit/.test(renderProductDetail(p, 'VIEWER')), 'VIEWER read-only');
    assert(/72%|73%/.test(renderProductDetail(p, 'OWNER')), 'margine mostrato'); // (29.9-8)/29.9≈73%
  });
  it(s, 'renderProductForm: nuovo vs modifica', async () => {
    assert(/Nuovo prodotto/.test(renderProductForm()), 'nuovo');
    assert(/Modifica prodotto/.test(renderProductForm({ id: 'p1', name: 'Targa' })), 'modifica');
  });
});
