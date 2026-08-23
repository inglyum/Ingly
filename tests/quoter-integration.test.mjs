// INGLY OS V2 — test integrazione Smart Quoter nel workflow documenti:
// Quoter → riga Preventivo → Ordine → Fattura, con SNAPSHOT storico (il prezzo
// e la descrizione NON vengono ricalcolati retroattivamente).
import { describe, it, assert, assertEq } from './harness.mjs';
import * as Q from '../app-v2/src/quoter.js';
import { getQuote } from '../app-v2/src/quotes.js';
import { convertQuoteToOrder, getOrder } from '../app-v2/src/orders.js';
import { convertOrderToInvoice } from '../app-v2/src/invoices.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function makeMock(store) {
  let uid = 0; const counters = {};
  const HDR = { sales_quote_line: ['sales_quote', 'quote_id'], sales_order_line: ['sales_order', 'order_id'], sales_invoice_line: ['sales_invoice', 'invoice_id'] };
  function recalc(lt, hdr, fk, id) {
    const ls = (store[lt] || []).filter((l) => String(l[fk]) === String(id));
    const h = (store[hdr] || []).find((r) => String(r.id) === String(id)); if (!h) return;
    h.subtotal = r2(ls.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    h.discount = r2(ls.reduce((s, l) => s + (l.discount || 0), 0));
    h.tax = r2(ls.reduce((s, l) => s + (l.tax || 0), 0));
    h.total = r2(ls.reduce((s, l) => s + l.line_total, 0));
  }
  function onInsert(table, row) {
    if (table === 'sales_quote') { const k = table + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'PREV-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (table === 'sales_order') { const k = table + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'ORD-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'CONFIRMED'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (table === 'sales_invoice') { const y = row.year || (row.issue_date ? Number(String(row.issue_date).slice(0, 4)) : 2026); const k = table + row.tenant_id + y; counters[k] = (counters[k] || 0) + 1; row.year = y; row.number = 'FATT-' + y + '-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (table.endsWith('_line')) row.line_total = r2(row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0));
  }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or() { return api; },
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
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; onInsert(st.table, row); arr.push(row); if (HDR[st.table]) { const [h, fk] = HDR[st.table]; recalc(st.table, h, fk, row[fk]); } return { data: row, error: null }; }
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

const seedQuote = (store) => { store.sales_quote = [{ id: 'q1', tenant_id: 't1', number: 'PREV-000001', customer_id: 'c1', customer_name: 'Rossi', status: 'DRAFT', deleted_at: null }]; store.sales_quote_line = []; };

describe('Smart Quoter — integrazione riga preventivo', (s) => {
  it(s, 'snapshotDescription congela il dettaglio del calcolo', async () => {
    const calc = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, design: 0, channel: 'B2C', markup: 3, quantity: 1 });
    const d = Q.snapshotDescription('Targa A5', calc);
    assert(/Targa A5/.test(d) && /Mat 11\.5/.test(d) && /×3/.test(d) && /76\.9/.test(d) && /KB/.test(d), 'snapshot completo: ' + d);
  });

  it(s, 'addQuoterLineToQuote aggiunge riga con prezzo congelato a preventivo esistente', async () => {
    const store = {}; seedQuote(store); const sb = makeMock(store);
    const calc = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, quantity: 2 });
    await Q.addQuoterLineToQuote(sb, 't1', 'q1', { description: 'Targa A5', calc, sortOrder: 0 });
    assertEq(store.sales_quote_line.length, 1);
    assertEq(store.sales_quote_line[0].unit_price, calc.discountedUnit);
    assertEq(store.sales_quote_line[0].quantity, 2);
    assert(/Targa A5/.test(store.sales_quote_line[0].description), 'descrizione snapshot');
    const bundle = await getQuote(sb, 'q1');
    assertEq(bundle.quote.total, r2(calc.discountedUnit * 2)); // totale ricalcolato dal DB (mock)
  });
});

describe('Smart Quoter — regressione snapshot Preventivo→Ordine→Fattura', (s) => {
  it(s, 'prezzo e descrizione NON cambiano attraverso le conversioni', async () => {
    const store = {}; seedQuote(store); const sb = makeMock(store);
    const calc = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, quantity: 1 });
    await Q.addQuoterLineToQuote(sb, 't1', 'q1', { description: 'Targa A5', calc });
    const snapPrice = store.sales_quote_line[0].unit_price;
    const snapDesc = store.sales_quote_line[0].description;

    const order = await convertQuoteToOrder(sb, 't1', 'q1');
    const ob = await getOrder(sb, order.id);
    assertEq(ob.lines[0].unit_price, snapPrice);
    assertEq(ob.lines[0].description, snapDesc);

    const invoice = await convertOrderToInvoice(sb, 't1', order.id);
    const invLine = store.sales_invoice_line.find((l) => String(l.invoice_id) === String(invoice.id));
    assertEq(invLine.unit_price, snapPrice);
    assertEq(invLine.description, snapDesc);
  });

  it(s, 'variazione del listino DOPO non altera le righe già emesse', async () => {
    const store = {}; seedQuote(store);
    store.catalog_product = [{ id: 'p1', tenant_id: 't1', name: 'Targa', cost: 8, price: 30, deleted_at: null }];
    const sb = makeMock(store);
    const calc = Q.computeQuote({ materiale: 8, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, quantity: 1 });
    await Q.addQuoterLineToQuote(sb, 't1', 'q1', { description: 'Targa', calc });
    const frozen = store.sales_quote_line[0].unit_price;
    // il catalogo cambia dopo l'emissione
    store.catalog_product[0].cost = 999; store.catalog_product[0].price = 5;
    const order = await convertQuoteToOrder(sb, 't1', 'q1');
    const ob = await getOrder(sb, order.id);
    assertEq(ob.lines[0].unit_price, frozen); // invariato: nessun ricalcolo retroattivo
  });
});
