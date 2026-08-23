// INGLY OS V2 — test Smart Quoter (motore di prezzo deterministico KB).
import { describe, it, assert, assertEq } from './harness.mjs';
import * as Q from '../app-v2/src/quoter.js';
import { renderPreview } from '../app-v2/src/quoter-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {};
  function onInsert(table, row) { if (table === 'sales_quote') { const k = row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'PREV-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT'; } }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null };
    const api = {
      select() { return api; }, is() { return api; }, eq() { return api; }, or() { return api; },
      order() { return api; }, limit() { return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; },
      single() { return Promise.resolve(run(st)); },
      then(res, rej) { return Promise.resolve(run(st)).then(res, rej); },
    };
    return api;
  }
  function run(st) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; onInsert(st.table, row); arr.push(row); return { data: row, error: null }; }
    return { data: arr, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('Smart Quoter — roundTo90', (s) => {
  it(s, 'arrotonda per eccesso al ,90', async () => {
    assertEq(Q.roundTo90(27.00), 27.90);
    assertEq(Q.roundTo90(27.95), 28.90);
    assertEq(Q.roundTo90(28.90), 28.90);
    assertEq(Q.roundTo90(28.91), 29.90);
    assertEq(Q.roundTo90(0), 0.90);
  });
});

describe('Smart Quoter — computeQuote', (s) => {
  it(s, 'formula KB base: sfrido, lavoro €18/h, markup ×3, ,90', async () => {
    const c = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, design: 0, channel: 'B2C', markup: 3, quantity: 1, productType: 'generico' });
    assertEq(c.materialeConSfrido, 11.50);
    assertEq(c.lavoro, 9.00);
    assertEq(c.cost, 25.50);
    assertEq(c.unit, 76.90);
    assertEq(c.discountedUnit, 76.90);
    assertEq(c.lineTotal, 76.90);
    assert(c.margin >= 0.66 && c.margin <= 0.68, 'margine ~67%');
    assert(c.marginOk, 'margine sopra minimo B2C 65%');
  });

  it(s, 'markup fuori range viene clampato al canale (B2B 2–2.5)', async () => {
    assertEq(Q.computeQuote({ materiale: 10, channel: 'B2B', markup: 5 }).markup, 2.5);
    assertEq(Q.computeQuote({ materiale: 10, channel: 'B2B', markup: 1 }).markup, 2);
  });

  it(s, 'minimo psicologico QR menu (19,90) applicato con warning', async () => {
    const c = Q.computeQuote({ materiale: 1, channel: 'B2C', markup: 3, productType: 'qr_menu' });
    assertEq(c.discountedUnit, 19.90);
    assert(c.psyMinApplied, 'flag minimo psicologico');
    assert(c.warnings.some((w) => /minimo psicologico/i.test(w)), 'warning minimo');
  });

  it(s, 'sconto quantità: 10+ −10%, 25+ −15%, 50+ −20%', async () => {
    assertEq(Q.qtyDiscountPct(9), 0);
    assertEq(Q.qtyDiscountPct(10), 0.10);
    assertEq(Q.qtyDiscountPct(25), 0.15);
    assertEq(Q.qtyDiscountPct(50), 0.20);
    const c = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, quantity: 10, productType: 'generico' });
    assertEq(c.discountPct, 0.10);
    assertEq(c.discountedUnit, 69.21); // 76.90 × 0.90
  });

  it(s, 'express +25% aumenta la base', async () => {
    const base = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3 });
    const exp = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, express: true });
    assert(exp.unit > base.unit, 'express alza il prezzo');
  });

  it(s, 'acconto 50% su personalizzato > €50', async () => {
    const c = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, design: 20, channel: 'B2C', markup: 3, quantity: 1 });
    assert(c.acconto > 0 && c.lineTotal > 50, 'acconto previsto su personalizzato > €50');
    assertEq(c.acconto, Math.round(c.lineTotal * 0.5 * 100) / 100);
    // non personalizzato (design 0) e non flag → nessun acconto
    assertEq(Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, design: 0, channel: 'B2C', markup: 3 }).acconto, 0);
  });

  it(s, 'ordine minimo €15: warning se sotto', async () => {
    const c = Q.computeQuote({ materiale: 0, macchina: 0, lavoroMin: 0, design: 0, channel: 'B2C', markup: 3, productType: 'generico' });
    assert(!c.orderOk, 'sotto ordine minimo');
    assert(c.warnings.some((w) => /ordine minimo/i.test(w)), 'warning ordine minimo');
  });

  it(s, 'margine sotto minimo → marginOk false con warning', async () => {
    // markup ×3 da solo garantisce ~67%: il margine scende sotto il minimo solo
    // impilando sconti ammessi (qty 50 −20% + referral −10% + riordino −10% = −40%)
    const c = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, quantity: 50, referral: true, riordino: true, productType: 'generico' });
    assertEq(c.discountPct, 0.40);
    assert(!c.marginOk, 'margine sotto minimo con sconti impilati');
    assert(c.warnings.some((w) => /Margine/.test(w)), 'warning margine');
  });

  it(s, 'ogni voce del breakdown riporta la fonte KB', async () => {
    const c = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, design: 10, channel: 'B2C' });
    assert(c.breakdown.length >= 5 && c.breakdown.every((b) => b.source), 'fonte su ogni voce');
  });
});

describe('Smart Quoter — persistenza', (s) => {
  it(s, 'createQuoteFromCalc crea preventivo + riga con unitario calcolato', async () => {
    const store = {}; const sb = makeMock(store);
    const calc = Q.computeQuote({ materiale: 10, macchina: 5, lavoroMin: 30, channel: 'B2C', markup: 3, quantity: 2, productType: 'generico' });
    const quote = await Q.createQuoteFromCalc(sb, 't1', { customerName: 'Rossi', description: 'Targa', calc });
    assertEq(quote.number, 'PREV-000001');
    assertEq(store.sales_quote_line.length, 1);
    assertEq(store.sales_quote_line[0].unit_price, calc.discountedUnit);
    assertEq(store.sales_quote_line[0].quantity, 2);
  });
});

describe('Smart Quoter — render', (s) => {
  it(s, 'renderPreview mostra breakdown, margine e warning', async () => {
    const c = Q.computeQuote({ materiale: 1, channel: 'B2C', markup: 3, productType: 'qr_menu' });
    const html = renderPreview(c);
    assert(/Fonte \(KB\)/.test(html), 'colonna fonte');
    assert(/Margine/.test(html), 'margine');
    assert(/minimo psicologico/i.test(html), 'warning nel render');
  });
});
