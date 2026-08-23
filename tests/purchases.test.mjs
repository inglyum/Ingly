// INGLY OS V2 — test Acquisti (data-layer + render), offline con trigger emulati.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as PUR from '../app-v2/src/purchases.js';
import { renderPurchaseRows, renderPurchaseDetail, renderPurchaseForm } from '../app-v2/src/purchases-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {}; const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  function recalc(poId) {
    const ls = (store.purchase_order_line || []).filter((l) => l.purchase_order_id === poId);
    const h = (store.purchase_order || []).find((x) => x.id === poId); if (!h) return;
    h.subtotal = r2(ls.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    h.discount = r2(ls.reduce((s, l) => s + (l.discount || 0), 0));
    h.tax = r2(ls.reduce((s, l) => s + (l.tax || 0), 0));
    h.total = r2(ls.reduce((s, l) => s + l.line_total, 0));
  }
  function onInsert(table, row) {
    if (table === 'purchase_order') { const k = row.tenant_id; counters[k] = (counters[k] || 0) + 1;
      row.number = 'ACQ-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT';
      row.subtotal = row.discount = row.tax = row.total = 0; }
    if (table === 'purchase_order_line') row.line_total = r2(row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0));
  }
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
      delete() { st.op = 'delete'; return api; },
      single() { return Promise.resolve(run(st, 'single')); },
      maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), ...st.payload }; onInsert(st.table, row); arr.push(row);
      if (st.table === 'purchase_order_line') recalc(row.purchase_order_id); return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload));
      rows.forEach((r) => { if (st.table === 'purchase_order_line') { r.line_total = Math.round((r.quantity * r.unit_price - (r.discount || 0) + (r.tax || 0)) * 100) / 100; recalc(r.purchase_order_id); } });
      return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); rem.forEach((r) => arr.splice(arr.indexOf(r), 1));
      rem.forEach((r) => { if (st.table === 'purchase_order_line') recalc(r.purchase_order_id); }); return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const store = () => ({ purchase_order: [], purchase_order_line: [], stock_movement: [], supplier: [{ id: 'sup1', tenant_id: 't1', name: 'Legnami', deleted_at: null }] });

describe('Acquisti data-layer (mock trigger)', (s) => {
  it(s, 'createPurchase: numero ACQ per-tenant, stato DRAFT', async () => {
    const sb = makeMock(store());
    const a = await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1', supplier_name: 'Legnami', expected_date: '2026-09-20' });
    const b = await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1' });
    assertEq(a.number, 'ACQ-000001'); assertEq(b.number, 'ACQ-000002'); assertEq(a.status, 'DRAFT');
    assertEq(a.expected_date, '2026-09-20');
  });
  it(s, 'numerazione isolata per tenant', async () => {
    const sb = makeMock(store());
    const a = await PUR.createPurchase(sb, 'tA', {}); const b = await PUR.createPurchase(sb, 'tB', {});
    assertEq(a.number, 'ACQ-000001'); assertEq(b.number, 'ACQ-000001');
  });
  it(s, 'addLine + totali ricalcolati lato DB', async () => {
    const st = store(); const sb = makeMock(st);
    const po = await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1' });
    await PUR.addLine(sb, 't1', po.id, { description: 'Legno', quantity: 10, unit_price: 5, discount: 5, tax: 0 });
    const bund = await PUR.getPurchase(sb, po.id);
    assertEq(bund.lines.length, 1); assertEq(bund.lines[0].line_total, 45); assertEq(bund.order.total, 45);
  });
  it(s, 'changeStatus valido/invalido + archivio', async () => {
    const st = store(); const sb = makeMock(st);
    const po = await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1' });
    await PUR.changeStatus(sb, po.id, 'ORDERED'); assertEq(st.purchase_order[0].status, 'ORDERED');
    let threw = false; try { await PUR.changeStatus(sb, po.id, 'X'); } catch { threw = true; } assert(threw, 'stato invalido');
    await PUR.softDeletePurchase(sb, po.id);
    assert(!(await PUR.listPurchases(sb, {})).some((x) => x.id === po.id), 'archiviato in lista');
  });
  it(s, 'listPurchases: filtro stato + ricerca', async () => {
    const st = store(); const sb = makeMock(st);
    const a = await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1', supplier_name: 'Legnami' });
    await PUR.changeStatus(sb, a.id, 'RECEIVED');
    await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1', supplier_name: 'Plexi' });
    assertEq((await PUR.listPurchases(sb, { status: 'RECEIVED' })).length, 1);
    assertEq((await PUR.listPurchases(sb, { search: 'plexi' })).length, 1);
  });
  it(s, 'receivePurchase: crea movimenti IN a magazzino e stato RECEIVED', async () => {
    const st = store(); const sb = makeMock(st);
    const po = await PUR.createPurchase(sb, 't1', { supplier_id: 'sup1' });
    await PUR.addLine(sb, 't1', po.id, { product_id: 'prodA', description: 'A', quantity: 20, unit_price: 5 });
    await PUR.addLine(sb, 't1', po.id, { product_id: null, description: 'Spesa trasporto', quantity: 1, unit_price: 10 });
    const r = await PUR.receivePurchase(sb, 't1', po.id);
    assertEq(r.received, 1); // solo la riga con product_id
    assertEq(st.purchase_order[0].status, 'RECEIVED');
    assertEq(st.stock_movement.length, 1);
    assertEq(st.stock_movement[0].type, 'IN'); assertEq(st.stock_movement[0].quantity, 20);
    assertEq(st.stock_movement[0].reference_type, 'purchase'); assertEq(st.stock_movement[0].product_id, 'prodA');
  });
});

describe('Acquisti render + RBAC (offline)', (s) => {
  const bundle = { order: { id: 'po1', number: 'ACQ-000001', supplier_name: 'Legnami', status: 'ORDERED', order_date: '2026-08-22', expected_date: '2026-09-01' },
    lines: [{ id: 'l1', description: 'Legno', quantity: 10, unit_price: 5, discount: 5, tax: 0, line_total: 45 }],
    totals: { subtotal: 50, discount: 5, tax: 0, total: 45 } };
  it(s, 'renderPurchaseRows + empty', async () => {
    assert(/data-po="po1"/.test(renderPurchaseRows([{ id: 'po1', number: 'ACQ-1', supplier_name: 'L', status: 'ORDERED', total: 45 }])), 'riga');
    assert(/Nessun ordine di acquisto/.test(renderPurchaseRows([])), 'empty');
  });
  it(s, 'renderPurchaseDetail: totali, edit SALES, archivia MANAGER+, VIEWER read-only', async () => {
    assert(/ACQ-000001/.test(renderPurchaseDetail(bundle, 'SALES')), 'numero');
    assert(/data-edit="po1"/.test(renderPurchaseDetail(bundle, 'SALES')), 'edit SALES');
    assert(!/data-del=/.test(renderPurchaseDetail(bundle, 'SALES')), 'SALES non archivia');
    assert(/data-del=/.test(renderPurchaseDetail(bundle, 'MANAGER')), 'MANAGER archivia');
    assert(!/data-edit=/.test(renderPurchaseDetail(bundle, 'VIEWER')), 'VIEWER read-only');
    assert(/Ricezione prevista/.test(renderPurchaseDetail(bundle, 'OWNER')), 'ricezione');
  });
  it(s, 'renderPurchaseForm: nuovo vs modifica + fornitori', async () => {
    assert(/Nuovo ordine di acquisto/.test(renderPurchaseForm(null, [{ id: 'sup1', name: 'Legnami' }])), 'nuovo');
    assert(/Modifica ordine di acquisto/.test(renderPurchaseForm({ id: 'po1', supplier_id: 'sup1' }, [{ id: 'sup1', name: 'Legnami' }])), 'modifica');
  });
});

describe('Acquisti migration 0014 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000014_purchase_order.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(purchasing.order) + FK supplier/catalog', async () => {
    assert(/alter table public\.purchase_order enable row level security/.test(sql), 'RLS');
    assert(/has_permission\(tenant_id,'purchasing\.order','read'\)/.test(sql), 'read perm');
    assert(/supplier_id uuid references public\.supplier\(id\)/.test(sql), 'FK supplier');
    assert(/product_id uuid references public\.catalog_product\(id\)/.test(sql), 'FK catalog');
  });
  it(s, 'numerazione ACQ + totali DB + trigger delete condiviso', async () => {
    assert(/next_purchase_number/.test(sql) && /on conflict \(tenant_id\) do update/.test(sql), 'counter');
    assert(/line_total numeric generated always as/.test(sql), 'line_total');
    assert(/crm_enforce_delete_perm\('purchasing\.order'\)/.test(sql), 'trigger delete');
  });
});
