// INGLY OS V2 — test Materiali come master-data ERP: un materiale è un
// catalog_product kind='material' che fluisce in Magazzino/Acquisti/Quoter/BOM
// con UNA source of truth, + snapshot preventivo congelato.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as MAT from '../app-v2/src/materials.js';
import * as Q from '../app-v2/src/quoter.js';
import * as STU from '../app-v2/src/quoterstudio.js';
import { stockLevels, committedByProduct } from '../app-v2/src/warehouse.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function makeMock(store) {
  let uid = 0; const counters = {};
  const HDR = { sales_quote_line: ['sales_quote', 'quote_id'] };
  function recalc(lt, hdr, fk, id) { const ls = (store[lt] || []).filter((l) => String(l[fk]) === String(id)); const h = (store[hdr] || []).find((r) => String(r.id) === String(id)); if (!h) return; h.total = r2(ls.reduce((s, l) => s + l.line_total, 0)); }
  function onInsert(t, row) {
    if (t === 'sales_quote') { const k = t + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'PREV-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; row.total = 0; }
    if (t.endsWith('_line')) row.line_total = r2(row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0));
  }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = { select() { return api; }, is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; }, eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; }, or() { return api; }, order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; }, limit(n) { st.lim = n; return api; }, insert(row) { st.op = 'insert'; st.payload = row; return api; }, update(row) { st.op = 'update'; st.payload = row; return api; }, delete() { st.op = 'delete'; return api; }, single() { return Promise.resolve(run(st, 'single')); }, maybeSingle() { return Promise.resolve(run(st, 'maybe')); }, then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); } };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; onInsert(st.table, row); arr.push(row); if (HDR[st.table]) { const [h, fk] = HDR[st.table]; recalc(st.table, h, fk, row[fk]); } return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); rem.forEach((r) => arr.splice(arr.indexOf(r), 1)); return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('Materiali — master-data + stock', (s) => {
  it(s, 'createMaterial → catalog_product kind=material', async () => {
    const store = {}; const sb = makeMock(store);
    const m = await MAT.createMaterial(sb, 't1', { name: 'MDF 6mm', material_type: 'MDF', unit: 'mq', cost_per_mq: 12, min_stock: 5 });
    assertEq(m.kind, 'material'); assertEq(m.cost_per_mq, 12);
    assertEq(store.catalog_product.length, 1);
  });
  it(s, 'listMaterials arricchisce con stock reale (giacenza/disponibile/valore/sotto scorta)', async () => {
    const store = {
      catalog_product: [{ id: 'mat1', tenant_id: 't1', name: 'MDF', kind: 'material', cost: 10, cost_per_mq: 12, min_stock: 5, reorder_point: 5, deleted_at: null }],
      stock_movement: [
        { id: 'm1', product_id: 'mat1', type: 'IN', quantity: 20, deleted_at: null, created_at: '2026-01-01' },
        { id: 'm2', product_id: 'mat1', type: 'OUT', quantity: 3, deleted_at: null, created_at: '2026-01-02' },
      ],
      sales_order: [{ id: 'o1', status: 'CONFIRMED', deleted_at: null }],
      sales_order_line: [{ order_id: 'o1', product_id: 'mat1', quantity: 4 }],
    };
    const sb = makeMock(store);
    const mats = await MAT.listMaterials(sb, {});
    assertEq(mats.length, 1);
    assertEq(mats[0].onHand, 17); // 20 - 3
    assertEq(mats[0].committed, 4); // ordine aperto
    assertEq(mats[0].available, 13); // 17 - 4
    assertEq(mats[0].stockValue, 170); // 17 * cost 10
    assert(mats[0].below === false, 'disponibile 13 ≥ soglia 5');
  });
  it(s, 'materialCostPerMq: usa cost_per_mq, fallback cost', async () => {
    assertEq(MAT.materialCostPerMq({ cost_per_mq: 12, cost: 5 }), 12);
    assertEq(MAT.materialCostPerMq({ cost: 5 }), 5);
  });
  it(s, 'materialTypeGroup: vernici/componenti = viste tipizzate (no anagrafica separata)', async () => {
    assertEq(MAT.materialTypeGroup({ material_type: 'vernice' }), 'paint');
    assertEq(MAT.materialTypeGroup({ material_type: 'bomboletta smalto' }), 'paint');
    assertEq(MAT.materialTypeGroup({ material_type: 'componente' }), 'component');
    assertEq(MAT.materialTypeGroup({ category: 'LED e minuteria' }), 'component');
    assertEq(MAT.materialTypeGroup({ material_type: 'MDF' }), 'material');
    assertEq(MAT.materialTypeGroup({}), 'material');
  });
});

describe('Materiali — integrazione ERP (una source of truth)', (s) => {
  it(s, 'Materiale → Magazzino: i movimenti del materiale contano nella giacenza', async () => {
    const lv = stockLevels([{ product_id: 'mat1', type: 'IN', quantity: 10 }, { product_id: 'mat1', type: 'OUT', quantity: 4 }]);
    assertEq(lv.mat1, 6);
  });
  it(s, 'Materiale → BOM/Produzione: committedByProduct include il materiale impegnato', async () => {
    const store = { sales_order: [{ id: 'o1', status: 'CONFIRMED', deleted_at: null }], sales_order_line: [{ order_id: 'o1', product_id: 'mat1', quantity: 7 }] };
    const committed = await committedByProduct(makeMock(store));
    assertEq(committed.mat1, 7);
  });
  it(s, 'Materiale → Quoter: lavorazione materiale usa cost/mq reale', async () => {
    const w = Q.computeWorking({ category: 'material', mq: 2, sfrido_pct: 10, cost_per_mq: 12 });
    assertEq(w.cost, r2(2 * 1.1 * 12)); // 26.4
  });
});

describe('Materiali — snapshot preventivo congelato', (s) => {
  it(s, 'salvo un preventivo col materiale; cambio poi il costo → il preventivo NON cambia', async () => {
    const store = { catalog_product: [{ id: 'mat1', tenant_id: 't1', name: 'MDF', kind: 'material', cost_per_mq: 12, deleted_at: null }] };
    const sb = makeMock(store);
    const head = await STU.saveQuoteDoc(sb, 't1', { title: 'Targa', lines: [{ description: 'Targa', quantity: 1, markup_pct: 100, vat_rate: 22, workings: [
      { category: 'material', resource_id: 'mat1', mq: 1, sfrido_pct: 0, cost_per_mq: 12 },
    ] }] });
    const ql = store.sales_quote_line[0];
    const snapCost = ql.cost_material; const snapPrice = ql.unit_price;
    assertEq(snapCost, 12); // costo materiale congelato
    // il costo del materiale cambia DOPO
    store.catalog_product[0].cost_per_mq = 999;
    // il documento salvato usa lo snapshot (workings congelati), non il catalogo
    const c = Q.computeLine({ workings: store.sales_quote_line[0].workings, markup_pct: 100, vat_rate: 22, quantity: 1 });
    assertEq(c.unitCost, 12); assertEq(c.unitPrice, snapPrice); // invariato
    assert(store.sales_quote_line[0].cost_material === snapCost, 'snapshot riga immutato');
  });
});

describe('Materiali — migration 0030 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000030_material_master.sql', import.meta.url), 'utf8');
  it(s, 'kind material nel check + campi materiale, nessuna tabella nuova', async () => {
    assert(/kind in \('product','service','material'\)/.test(sql), 'kind material');
    assert(/add column if not exists material_type text/.test(sql), 'material_type');
    assert(/add column if not exists cost_per_kg numeric/.test(sql), 'cost_per_kg');
    assert(/add column if not exists supplier_id uuid references public\.supplier/.test(sql), 'FK fornitore');
    assert(!/create table/.test(sql), 'nessuna tabella nuova (master-data nel catalogo)');
  });
});
