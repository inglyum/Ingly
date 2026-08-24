// INGLY OS V2 — test Smart Quoter Studio: pricing engine premium, persistenza
// snapshot, documenti PDF/share, regressione workflow, migrazione statica.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as Q from '../app-v2/src/quoter.js';
import * as STU from '../app-v2/src/quoterstudio.js';
import * as DOC from '../app-v2/src/quoterdoc.js';
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
    if (table === 'sales_invoice') { const y = 2026; const k = table + row.tenant_id + y; counters[k] = (counters[k] || 0) + 1; row.year = y; row.number = 'FATT-' + y + '-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (table.endsWith('_line')) row.line_total = r2(row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0));
  }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; }, is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; }, or() { return api; },
      order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; }, limit(n) { st.lim = n; return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; }, update(row) { st.op = 'update'; st.payload = row; return api; }, delete() { st.op = 'delete'; return api; },
      single() { return Promise.resolve(run(st, 'single')); }, maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; onInsert(st.table, row); arr.push(row); if (HDR[st.table]) { const [h, fk] = HDR[st.table]; recalc(st.table, h, fk, row[fk]); } return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); const hdrRef = HDR[st.table]; rem.forEach((r) => arr.splice(arr.indexOf(r), 1)); if (hdrRef) { const [h, fk] = hdrRef; const ids = new Set(rem.map((r) => r[fk])); ids.forEach((id) => recalc(st.table, h, fk, id)); } return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('Quoter engine — computeLine breakdown', (s) => {
  it(s, 'materiale+sfrido, macchina, lavoro, design, extra, markup, IVA, margine', async () => {
    const c = Q.computeLine({ cost_material: 10, cost_machine: 5, cost_labor: 9, cost_design: 6, cost_extra: 0, markup_pct: 200, vat_rate: 22, quantity: 1 });
    assertEq(c.material, 11.5); // 10 * 1.15
    assertEq(c.machine, 5); assertEq(c.labor, 9); assertEq(c.design, 6);
    assertEq(c.unitCost, 31.5); // 11.5+5+9+6
    assertEq(c.unitPrice, 94.9); // roundTo90(31.5*3=94.5)→94.90
    assertEq(c.iva, r2(94.9 * 0.22));
    assert(c.marginPct > 66 && c.marginPct < 68, 'margine ~67%');
    assertEq(c.minPrice, 31.5); // break-even
  });
  it(s, 'sconto% riduce imponibile e margine', async () => {
    const c = Q.computeLine({ cost_material: 10, markup_pct: 200, discount_pct: 10, vat_rate: 22, quantity: 2 });
    assert(c.discountPct === 10 && c.netUnit < c.unitPrice, 'netto scontato');
    assertEq(c.imponibile, r2(c.netUnit * 2));
  });
  it(s, 'quantità moltiplica costo e imponibile', async () => {
    const c = Q.computeLine({ cost_material: 10, cost_machine: 5, markup_pct: 100, quantity: 3 });
    assertEq(c.cost, r2(c.unitCost * 3));
  });
});

describe('Quoter engine — pricing intelligence', (s) => {
  it(s, 'anchoringTiers economy<consigliato<premium', async () => {
    const t = Q.anchoringTiers(100, 200);
    assert(t.economy < t.consigliato && t.consigliato < t.premium, 'ordine tiers');
  });
  it(s, 'priceForMargin: prezzo per margine target', async () => {
    assertEq(Q.priceForMargin(30, 60), Q.roundTo90(30 / 0.4)); // 75 → 75.90
    assertEq(Q.priceForMargin(30, 100), null); // margine 100% impossibile
  });
  it(s, 'marginRisk soglie', async () => {
    assertEq(Q.marginRisk(40, 55), 'high');
    assertEq(Q.marginRisk(60, 55), 'medium');
    assertEq(Q.marginRisk(70, 55), 'low');
  });
  it(s, 'computeDocument: multiple righe + extra + acconto', async () => {
    const d = Q.computeDocument([
      { kind: 'product', cost_material: 10, cost_machine: 5, cost_labor: 9, markup_pct: 200, vat_rate: 22, quantity: 1 },
      { kind: 'extra', description: 'Setup', cost_extra: 20, markup_pct: 0, vat_rate: 22, quantity: 1 },
    ], { depositPct: 50 });
    assert(d.rows.length === 2, 'due righe');
    assert(d.total > 0 && d.iva > 0, 'totali');
    assertEq(d.deposit, r2(d.total * 0.5));
    assert(['low', 'medium', 'high'].includes(d.risk), 'risk calcolato');
  });
});

describe('Quoter Studio — persistenza snapshot', (s) => {
  it(s, 'lineDbPayload: discount/tax assoluti coerenti con line_total', async () => {
    const p = STU.lineDbPayload({ cost_material: 10, markup_pct: 200, discount_pct: 10, vat_rate: 22, quantity: 2, description: 'X' }, 't1', 'q1', 0);
    const c = Q.computeLine({ cost_material: 10, markup_pct: 200, discount_pct: 10, vat_rate: 22, quantity: 2 });
    assertEq(p.unit_price, c.unitPrice);
    assertEq(p.discount, r2(Math.max(0, c.unitPrice * 2 - c.imponibile)));
    assertEq(p.tax, c.iva);
    assertEq(p.markup_pct, 200); assertEq(p.cost_material, 10);
    // line_total ricostruito = imponibile + iva
    assertEq(r2(p.quantity * p.unit_price - p.discount + p.tax), c.total);
  });
  it(s, 'saveQuoteDoc crea header + righe con breakdown', async () => {
    const store = {}; const sb = makeMock(store);
    const head = await STU.saveQuoteDoc(sb, 't1', { title: 'Kit Rossi', customer_name: 'Rossi', deposit_pct: 30, lines: [
      { kind: 'product', description: 'Targa', cost_material: 10, cost_machine: 5, cost_labor: 9, markup_pct: 200, vat_rate: 22, quantity: 1 },
      { kind: 'extra', description: 'Setup', cost_extra: 20, markup_pct: 0, vat_rate: 22, quantity: 1 },
    ] });
    assert(/^PREV-/.test(head.number), 'numero preventivo');
    assertEq(head.title, 'Kit Rossi'); assertEq(head.deposit_pct, 30);
    assertEq(store.sales_quote_line.length, 2);
    assertEq(store.sales_quote_line[0].cost_material, 10);
    assertEq(store.sales_quote_line[1].kind, 'extra');
    assert(head.total > 0, 'totale header ricalcolato includendo extra');
  });
  it(s, 'saveQuoteDoc aggiorna: sostituisce le righe (no duplicati)', async () => {
    const store = {}; const sb = makeMock(store);
    const h1 = await STU.saveQuoteDoc(sb, 't1', { title: 'A', lines: [{ kind: 'product', description: 'L1', cost_material: 10, markup_pct: 100, quantity: 1 }] });
    await STU.saveQuoteDoc(sb, 't1', { id: h1.id, title: 'A2', lines: [{ kind: 'product', description: 'L2', cost_material: 20, markup_pct: 100, quantity: 1 }] });
    assertEq(store.sales_quote_line.length, 1); // sostituite, non duplicate
    assertEq(store.sales_quote_line[0].description, 'L2');
    const head = store.sales_quote[0]; assertEq(head.title, 'A2');
  });
  it(s, 'duplicateQuoteDoc copia righe in nuova bozza', async () => {
    const store = {}; const sb = makeMock(store);
    const h1 = await STU.saveQuoteDoc(sb, 't1', { title: 'Orig', lines: [{ kind: 'product', description: 'L', cost_material: 10, markup_pct: 100, quantity: 1 }] });
    const h2 = await STU.duplicateQuoteDoc(sb, 't1', h1.id);
    assert(h2.id !== h1.id, 'nuovo id');
    assertEq(store.sales_quote.length, 2);
    assert(/copia/.test(h2.title), 'titolo copia');
  });
});

describe('Quoter Studio — regressione workflow (snapshot immutabile)', (s) => {
  it(s, 'save → quote→order→invoice: prezzo/descrizione invariati; catalogo dopo non altera', async () => {
    const store = { catalog_product: [{ id: 'p1', tenant_id: 't1', name: 'Targa', cost: 10, price: 30, vat: 22, deleted_at: null }] };
    const sb = makeMock(store);
    const head = await STU.saveQuoteDoc(sb, 't1', { title: 'T', customer_name: 'Rossi', lines: [{ kind: 'product', product_id: 'p1', description: 'Targa', cost_material: 10, cost_labor: 9, markup_pct: 200, vat_rate: 22, quantity: 1 }] });
    const ql = store.sales_quote_line[0]; const snapPrice = ql.unit_price; const snapDesc = ql.description;
    // il catalogo cambia dopo
    store.catalog_product[0].cost = 999; store.catalog_product[0].price = 5;
    const order = await convertQuoteToOrder(sb, 't1', head.id);
    const ob = await getOrder(sb, order.id);
    assertEq(ob.lines[0].unit_price, snapPrice); assertEq(ob.lines[0].description, snapDesc);
    const inv = await convertOrderToInvoice(sb, 't1', order.id);
    const il = store.sales_invoice_line.find((l) => String(l.invoice_id) === String(inv.id));
    assertEq(il.unit_price, snapPrice); assertEq(il.description, snapDesc);
    // il preventivo storico resta col prezzo congelato
    const qb = await getQuote(sb, head.id);
    assertEq(qb.lines[0].unit_price, snapPrice);
  });
});

describe('Quoter — documenti PDF / share / template', (s) => {
  const doc = { title: 'Kit Rossi', number: 'PREV-000001', customer_name: 'Rossi', issue_date: '2026-08-24', valid_until: '2026-08-31', notes: 'Grazie', category: 'B2C' };
  const computed = Q.computeDocument([{ kind: 'product', description: 'Targa', cost_material: 10, cost_machine: 5, cost_labor: 9, markup_pct: 200, vat_rate: 22, quantity: 1 }], {});
  it(s, 'PDF cliente: righe/prezzi/IVA, NESSUN costo interno', async () => {
    const html = DOC.clientDocHTML(doc, computed, { company_name: 'INGLY Design', vat_number: '01234567890' });
    assert(/Kit Rossi/.test(html) && /Targa/.test(html), 'contenuto cliente');
    assert(/Totale/.test(html) && /IVA/.test(html), 'totali');
    assert(!/Costo unit|Markup|Margine|break-even/i.test(html), 'nessun dato interno nel PDF cliente');
  });
  it(s, 'PDF interno: include costo, markup, margine', async () => {
    const html = DOC.internalDocHTML(doc, computed, { company_name: 'INGLY Design' });
    assert(/Costo/.test(html) && /Markup/.test(html) && /Margine/.test(html), 'breakdown interno');
  });
  it(s, 'shareText/whatsappLink: riepilogo cliente senza dati interni', async () => {
    const txt = DOC.shareText(doc, computed);
    assert(/Kit Rossi/.test(txt) && /Totale/.test(txt), 'riepilogo');
    assert(!/Markup|Costo|Margine/i.test(txt), 'niente interni');
    const link = DOC.whatsappLink(doc, computed, '+39 091 8000');
    assert(/^https:\/\/wa\.me\/390918000\?text=/.test(link), 'link wa.me: ' + link.slice(0, 40));
  });
  it(s, 'template disponibili standard/premium/b2b/internal', async () => {
    assert(DOC.TEMPLATES.standard && DOC.TEMPLATES.premium && DOC.TEMPLATES.b2b && DOC.TEMPLATES.internal, 'template');
  });
});

describe('Quoter — migration 0027 (statica)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000027_quote_breakdown.sql', import.meta.url), 'utf8');
  it(s, 'colonne breakdown additive nullable + kind + metadati header', async () => {
    assert(/add column if not exists cost_material numeric/.test(sql), 'cost_material');
    assert(/add column if not exists markup_pct numeric/.test(sql), 'markup_pct');
    assert(/add column if not exists kind text not null default 'product'/.test(sql), 'kind con default');
    assert(/kind in \('product','extra'\)/.test(sql), 'check kind');
    assert(/sales_quote add column if not exists title text/.test(sql), 'title header');
    assert(!/create table/.test(sql), 'nessuna tabella nuova (solo alter)');
  });
});
