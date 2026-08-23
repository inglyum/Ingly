// INGLY OS V2 — test Reporting/BI (aggregazione read-only cross-module).
import { describe, it, assert, assertEq } from './harness.mjs';
import { loadReports } from '../app-v2/src/reports.js';
import { renderReports } from '../app-v2/src/reports-ui.js';

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
      maybeSingle() { return Promise.resolve(one(st)); },
      then(res, rej) { return Promise.resolve(run(st)).then(res, rej); },
    };
    return api;
  }
  function rows(st) { let rows = (store[st.table] || []).filter((r) => st.filters.every((f) => f(r))); if (st.lim) rows = rows.slice(0, st.lim); return rows; }
  function run(st) { return { data: rows(st), error: null }; }
  function one(st) { const r = rows(st)[0]; return { data: r || null, error: null }; }
  return { from: (t) => builder(t) };
}

function seed() {
  return {
    crm_customer: [{ id: 'c1', tenant_id: 't1', name: 'Maria', type: 'B2B', value_cached: 0, deleted_at: null }],
    crm_company: [], crm_activity: [],
    sales_quote: [{ id: 'q1', status: 'ACCEPTED', deleted_at: null }, { id: 'q2', status: 'SENT', deleted_at: null }],
    sales_order: [
      { id: 'o1', tenant_id: 't1', customer_name: 'Maria', status: 'CONFIRMED', total: 1000, deleted_at: null },
      { id: 'o2', tenant_id: 't1', customer_name: 'Nino', status: 'DELIVERED', total: 500, deleted_at: null },
      { id: 'o3', tenant_id: 't1', customer_name: 'X', status: 'CANCELLED', total: 999, deleted_at: null },
    ],
    sales_order_line: [
      { order_id: 'o1', product_id: 'p1', quantity: 10, line_total: 300 },
      { order_id: 'o2', product_id: 'p2', quantity: 3, line_total: 60 },
    ],
    catalog_product: [
      { id: 'p1', tenant_id: 't1', name: 'Targa', cost: 8, price: 30, active: true, deleted_at: null, min_stock: 0, reorder_point: 0, reorder_qty: 0 },
      { id: 'p2', tenant_id: 't1', name: 'QR', cost: 2, price: 20, active: true, deleted_at: null, min_stock: 0, reorder_point: 0, reorder_qty: 0 },
    ],
    stock_movement: [],
    purchase_order: [{ id: 'po1', tenant_id: 't1', supplier_name: 'Legnami', status: 'ORDERED', total: 250, deleted_at: null }],
    supplier_payment: [],
    sales_invoice: [{ id: 'i1', tenant_id: 't1', customer_name: 'Maria', status: 'ISSUED', total: 100, paid_total: 0, due_date: '2000-01-01', deleted_at: null }],
    sales_payment: [{ id: 'sp1', tenant_id: 't1', invoice_id: 'i1', amount: 40, paid_date: '2026-08-20', method: 'cash', deleted_at: null }],
    project: [{ id: 'prj1', tenant_id: 't1', name: 'Wedding', status: 'ACTIVE', budget: 2000, deleted_at: null }],
    project_task: [],
  };
}

describe('Reporting/BI aggregazione', (s) => {
  it(s, 'vendite: ricavi (no cancellati), conversione, ticket medio', async () => {
    const d = await loadReports(makeMock(seed()));
    assertEq(d.sales.revenue, 1500);   // 1000 + 500 (o3 cancellato escluso)
    assertEq(d.sales.orders, 2);
    assertEq(d.sales.quotes, 2); assertEq(d.sales.accepted, 1); assertEq(d.sales.conversion, 50);
    assertEq(d.sales.avgTicket, 750);
  });
  it(s, 'top clienti e top prodotti', async () => {
    const d = await loadReports(makeMock(seed()));
    assertEq(d.topCustomers[0].name, 'Maria'); assertEq(d.topCustomers[0].value, 1000);
    assertEq(d.topProducts[0].name, 'Targa'); assertEq(d.topProducts[0].qty, 10);
  });
  it(s, 'finanza/magazzino/acquisti/commesse aggregati', async () => {
    const d = await loadReports(makeMock(seed()));
    assertEq(d.finance.incassato, 40); assert(d.finance.scaduto >= 60, 'scaduto');
    assertEq(d.purchases.value, 250); assertEq(d.purchases.count, 1);
    assertEq(d.projects.total, 1); assertEq(d.projects.active, 1);
  });
  it(s, 'alert deterministici con fonte (scaduto + preventivi non convertiti)', async () => {
    const d = await loadReports(makeMock(seed()));
    assert(d.alerts.some((a) => /scaduto/i.test(a.text) && a.source), 'alert scaduto con fonte');
    assert(d.alerts.some((a) => /convertit/i.test(a.text)), 'alert preventivi SENT');
  });
  it(s, 'nessun crash con store vuoto → tutto 0 / dati insufficienti', async () => {
    const d = await loadReports(makeMock({}));
    assertEq(d.sales.revenue, 0); assertEq(d.topCustomers.length, 0); assertEq(d.error, null);
  });
});

describe('Reporting/BI render', (s) => {
  it(s, 'renderReports mostra sezioni e alert', async () => {
    const d = await loadReports(makeMock(seed()));
    const html = renderReports(d);
    assert(/Vendite/.test(html) && /Finanza/.test(html) && /Magazzino/.test(html) && /Commesse/.test(html), 'sezioni');
    assert(/Top clienti/.test(html) && /Top prodotti/.test(html), 'ranking');
    assert(/Alert/.test(html), 'alert');
  });
  it(s, 'render con dati vuoti → "Dati insufficienti"', async () => {
    const d = await loadReports(makeMock({}));
    assert(/Dati insufficienti|Nessun alert/.test(renderReports(d)), 'empty stato');
  });
});
