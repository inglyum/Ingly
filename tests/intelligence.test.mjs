// INGLY OS V2 — test Intelligence (motori deterministici), offline.
import { describe, it, assert, assertEq } from './harness.mjs';
import * as INT from '../app-v2/src/intelligence.js';
import { renderReorder, renderAnomalies, renderRFM, renderForecast } from '../app-v2/src/intelligence-ui.js';

function makeMock(store) {
  function builder(table) {
    const st = { table, filters: [], orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or() { return api; },
      order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; },
      limit(n) { st.lim = n; return api; },
      then(res, rej) { return Promise.resolve(run(st)).then(res, rej); },
    };
    return api;
  }
  function run(st) { let rows = (store[st.table] || []).filter((r) => st.filters.every((f) => f(r))); if (st.lim) rows = rows.slice(0, st.lim); return { data: rows, error: null }; }
  return { from: (t) => builder(t) };
}

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

function seed() {
  return {
    catalog_product: [
      { id: 'p1', tenant_id: 't1', name: 'Targa', sku: 'TRG', cost: 8, price: 30, active: true, deleted_at: null, min_stock: 0, reorder_point: 40, reorder_qty: 0 },
      { id: 'p2', tenant_id: 't1', name: 'Sottocosto', sku: 'SC', cost: 50, price: 20, active: true, deleted_at: null, min_stock: 0, reorder_point: 0, reorder_qty: 0 },
      { id: 'p3', tenant_id: 't1', name: 'Fermo', sku: 'DEAD', cost: 5, price: 25, active: true, deleted_at: null, min_stock: 0, reorder_point: 0, reorder_qty: 0 },
    ],
    stock_movement: [
      { id: 'm1', tenant_id: 't1', product_id: 'p1', type: 'IN', quantity: 30, created_at: iso(20), deleted_at: null },
      { id: 'm2', tenant_id: 't1', product_id: 'p1', type: 'OUT', quantity: 15, created_at: iso(10), deleted_at: null }, // consumo
      { id: 'm3', tenant_id: 't1', product_id: 'p3', type: 'IN', quantity: 10, created_at: iso(5), deleted_at: null }, // fermo (nessuna vendita)
    ],
    sales_order: [
      { id: 'o1', tenant_id: 't1', customer_name: 'Maria', status: 'CONFIRMED', total: 1000, order_date: iso(5), deleted_at: null },
      { id: 'o2', tenant_id: 't1', customer_name: 'Maria', status: 'DELIVERED', total: 500, order_date: iso(40), deleted_at: null },
      { id: 'o3', tenant_id: 't1', customer_name: 'Nino', status: 'CONFIRMED', total: 0, order_date: iso(2), deleted_at: null }, // anomalia totale 0
    ],
    sales_order_line: [{ order_id: 'o1', product_id: 'p1', quantity: 15 }],
    sales_invoice: [{ id: 'i1', tenant_id: 't1', number: 'F1', customer_name: 'Maria', status: 'ISSUED', total: 100, paid_total: 0, due_date: iso(30), deleted_at: null }],
    sales_payment: [], purchase_order: [], supplier_payment: [],
    crm_customer: [{ id: 'c1', tenant_id: 't1', name: 'Maria', deleted_at: null }],
  };
}

describe('Intelligence — motori deterministici', (s) => {
  it(s, 'reorderIntelligence: consumo/gg, copertura, urgenza, fonte', async () => {
    const d = await INT.reorderIntelligence(makeMock(seed()), {});
    const p1 = d.items.find((x) => x.id === 'p1');
    assert(p1, 'p1 non incluso (sotto scorta: 15 disp < 40)');
    assert(p1.avgDaily > 0, 'consumo non calcolato'); assert(p1.source && p1.reason, 'fonte/motivazione mancante');
  });
  it(s, 'anomalyDetection: margine negativo, fattura scaduta, ordine totale 0', async () => {
    const d = await INT.anomalyDetection(makeMock(seed()));
    assert(d.items.some((a) => /Margine negativo/.test(a.type) && a.entity === 'Sottocosto'), 'margine negativo');
    assert(d.items.some((a) => /Ordine senza righe/.test(a.type)), 'ordine totale 0');
    assert(d.items.every((a) => a.source), 'fonte mancante');
  });
  it(s, 'customerRFM: segmenta i clienti con motivazione', async () => {
    const d = await INT.customerRFM(makeMock(seed()));
    const maria = d.items.find((r) => r.name === 'Maria');
    assert(maria, 'Maria assente'); assert(maria.rfm && maria.segment && maria.reason, 'RFM incompleto');
    assertEq(maria.freq, 2);
  });
  it(s, 'productIntelligence: best/dead/lowMargin', async () => {
    const d = await INT.productIntelligence(makeMock(seed()));
    assert(d.best.some((x) => x.name === 'Targa'), 'best seller Targa');
    assert(d.dead.some((x) => x.name === 'Fermo'), 'dead stock');
    assert(d.lowMargin.some((x) => x.name === 'Sottocosto'), 'margine basso');
  });
  it(s, 'forecast: proiezione mensile spiegabile', async () => {
    const d = await INT.forecast(makeMock(seed()));
    assert(d.sufficient, 'dovrebbe avere dati'); assert(d.projMonthlyRevenue > 0, 'proiezione 0');
    assert(d.reason && d.source, 'spiegazione/fonte mancante');
  });
  it(s, 'businessAlerts: compone alert con fonte e link', async () => {
    const d = await INT.businessAlerts(makeMock(seed()));
    assert(d.items.length > 0, 'nessun alert'); assert(d.items.every((a) => a.source && a.text), 'alert incompleti');
  });
  it(s, 'store vuoto → nessun crash, dati insufficienti', async () => {
    const d = await INT.customerRFM(makeMock({}));
    assertEq(d.items.length, 0);
    const f = await INT.forecast(makeMock({}));
    assertEq(f.sufficient, false);
  });
});

describe('Intelligence render', (s) => {
  it(s, 'render tabelle/insight', async () => {
    const seedMock = makeMock(seed());
    assert(/Da ordinare|Nessun articolo/.test(renderReorder(await INT.reorderIntelligence(seedMock, {}))), 'reorder');
    assert(/Margine negativo|Nessuna anomalia/.test(renderAnomalies(await INT.anomalyDetection(seedMock))), 'anomalie');
    assert(/Segmento|insufficienti/.test(renderRFM(await INT.customerRFM(seedMock))), 'rfm');
    assert(/Ricavo mensile stimato|insufficienti/.test(renderForecast(await INT.forecast(seedMock))), 'forecast');
  });
});
