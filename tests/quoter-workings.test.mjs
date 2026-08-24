// INGLY OS V2 — test Configura Lavorazione: calcolo per categoria, cost
// breakdown, risorsa da listino, snapshot storico congelato.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as Q from '../app-v2/src/quoter.js';
import * as STU from '../app-v2/src/quoterstudio.js';
import { convertQuoteToOrder, getOrder } from '../app-v2/src/orders.js';
import { convertOrderToInvoice } from '../app-v2/src/invoices.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function makeMock(store) {
  let uid = 0; const counters = {};
  const HDR = { sales_quote_line: ['sales_quote', 'quote_id'], sales_order_line: ['sales_order', 'order_id'], sales_invoice_line: ['sales_invoice', 'invoice_id'] };
  function recalc(lt, hdr, fk, id) {
    const ls = (store[lt] || []).filter((l) => String(l[fk]) === String(id)); const h = (store[hdr] || []).find((r) => String(r.id) === String(id)); if (!h) return;
    h.subtotal = r2(ls.reduce((s, l) => s + l.quantity * l.unit_price, 0)); h.discount = r2(ls.reduce((s, l) => s + (l.discount || 0), 0));
    h.tax = r2(ls.reduce((s, l) => s + (l.tax || 0), 0)); h.total = r2(ls.reduce((s, l) => s + l.line_total, 0));
  }
  function onInsert(t, row) {
    if (t === 'sales_quote') { const k = t + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'PREV-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (t === 'sales_order') { const k = t + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'ORD-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'CONFIRMED'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (t === 'sales_invoice') { const k = t + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'FATT-2026-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; row.subtotal = row.discount = row.tax = row.total = 0; }
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
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); const hd = HDR[st.table]; rem.forEach((r) => arr.splice(arr.indexOf(r), 1)); if (hd) { const [h, fk] = hd; new Set(rem.map((r) => r[fk])).forEach((id) => recalc(st.table, h, fk, id)); } return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('Configura Lavorazione — calcolo per categoria', (s) => {
  it(s, 'Materiale: mq × (1+sfrido) × costo/mq', async () => {
    assertEq(Q.computeWorking({ category: 'material', mq: 2, sfrido_pct: 15, cost_per_mq: 10 }).cost, r2(2 * 1.15 * 10)); // 23
  });
  it(s, 'Laser/Macchina: minuti × costo/min', async () => {
    assertEq(Q.computeWorking({ category: 'machine', minutes: 12, cost_per_min: 0.5 }).cost, 6);
  });
  it(s, 'Manodopera: (minuti/60 + ore) × tariffa', async () => {
    assertEq(Q.computeWorking({ category: 'labor', minutes: 30, hours: 1, rate_per_hour: 18 }).cost, r2(1.5 * 18)); // 27
  });
  it(s, 'Verniciatura: superficie × costo/mq × mani', async () => {
    assertEq(Q.computeWorking({ category: 'painting', surface_mq: 0.5, cost_per_mq: 8, coats: 2 }).cost, 8);
  });
  it(s, 'Gadget/Minuteria: quantità × costo unitario', async () => {
    assertEq(Q.computeWorking({ category: 'gadget', quantity: 4, unit_cost: 1.5 }).cost, 6);
  });
  it(s, 'Prodotto Catalogo: quantità × costo unitario', async () => {
    assertEq(Q.computeWorking({ category: 'catalog', quantity: 10, unit_cost: 0.2 }).cost, 2);
  });
  it(s, 'valori negativi → 0', async () => {
    assertEq(Q.computeWorking({ category: 'material', mq: -5, cost_per_mq: 10 }).cost, 0);
  });
});

describe('Configura Lavorazione — cost breakdown riga', (s) => {
  const workings = [
    { category: 'material', mq: 1, sfrido_pct: 15, cost_per_mq: 10 }, // 11.5
    { category: 'machine', minutes: 10, cost_per_min: 0.5 },          // 5
    { category: 'labor', minutes: 60, rate_per_hour: 18 },            // 18
    { category: 'painting', surface_mq: 1, cost_per_mq: 5, coats: 1 },// 5 → bucket material
    { category: 'gadget', quantity: 2, unit_cost: 1 },                // 2 → bucket extra
    { category: 'catalog', quantity: 1, unit_cost: 3 },               // 3 → bucket extra
  ];
  it(s, 'bucketsFromWorkings mappa categorie nei bucket', async () => {
    const b = Q.bucketsFromWorkings(workings);
    assertEq(b.buckets.material, 16.5); // 11.5 + 5 (verniciatura)
    assertEq(b.buckets.machine, 5);
    assertEq(b.buckets.labor, 18);
    assertEq(b.buckets.extra, 5); // gadget 2 + catalog 3
    assertEq(b.unitCost, r2(16.5 + 5 + 18 + 5)); // 44.5
  });
  it(s, 'computeLine con workings: costo somma lavorazioni (sfrido NON riapplicato)', async () => {
    const c = Q.computeLine({ workings, markup_pct: 100, vat_rate: 22, quantity: 1 });
    assertEq(c.unitCost, 44.5);
    assertEq(c.material, 16.5); // già finale, non ×1.15 di nuovo
    assertEq(c.unitPrice, Q.roundTo90(44.5 * 2)); // 89.90
    assert(c.workings && c.workings.length === 6, 'workings calcolati esposti');
  });
  it(s, 'computeDocument aggrega più prodotti con workings + extra bucket', async () => {
    const d = Q.computeDocument([{ workings, markup_pct: 100, vat_rate: 22, quantity: 2 }], {});
    assertEq(d.rows[0].cost, r2(44.5 * 2));
    assert(d.total > 0 && d.marginPct > 0, 'totali documento');
  });
});

describe('Configura Lavorazione — persistenza + snapshot storico', (s) => {
  it(s, 'saveQuoteDoc congela i workings e i bucket; conversioni non ricalcolano', async () => {
    const store = {}; const sb = makeMock(store);
    const head = await STU.saveQuoteDoc(sb, 't1', {
      title: 'Targa', customer_name: 'Rossi',
      lines: [{ description: 'Targa', quantity: 1, markup_pct: 100, vat_rate: 22, workings: [
        { category: 'material', mq: 1, sfrido_pct: 15, cost_per_mq: 10 },
        { category: 'machine', minutes: 10, cost_per_min: 0.5 },
        { category: 'labor', minutes: 60, rate_per_hour: 18 },
      ] }],
    });
    const ql = store.sales_quote_line[0];
    assert(Array.isArray(ql.workings) && ql.workings.length === 3, 'workings snapshot salvato');
    assert(ql.workings[0].cost === 11.5, 'costo lavorazione congelato nello snapshot');
    assertEq(ql.cost_material, 11.5); assertEq(ql.cost_machine, 5); assertEq(ql.cost_labor, 18);
    assertEq(ql.unit_price, Q.roundTo90(34.5 * 2)); // (11.5+5+18)=34.5 ×2 = 69.90
    const snapPrice = ql.unit_price; const snapWorkings = JSON.stringify(ql.workings);

    const order = await convertQuoteToOrder(sb, 't1', head.id);
    const ob = await getOrder(sb, order.id);
    assertEq(ob.lines[0].unit_price, snapPrice); // invariato
    const inv = await convertOrderToInvoice(sb, 't1', order.id);
    const il = store.sales_invoice_line.find((l) => String(l.invoice_id) === String(inv.id));
    assertEq(il.unit_price, snapPrice);
    // lo snapshot workings del preventivo resta immutato
    assertEq(JSON.stringify(store.sales_quote_line[0].workings), snapWorkings);
  });
  it(s, 'lineDbPayload senza workings resta retro-compatibile (flat)', async () => {
    const p = STU.lineDbPayload({ cost_material: 10, markup_pct: 200, vat_rate: 22, quantity: 1, description: 'X' }, 't1', 'q1', 0);
    assertEq(p.cost_material, 10); assertEq(p.workings, null);
  });
});

describe('Configura Lavorazione — migration 0028 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000028_quote_workings.sql', import.meta.url), 'utf8');
  it(s, 'colonna workings jsonb additiva, nessuna tabella nuova', async () => {
    assert(/add column if not exists workings jsonb/.test(sql), 'colonna workings jsonb');
    assert(!/create table/.test(sql), 'nessuna tabella nuova');
  });
});
