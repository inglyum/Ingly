// INGLY OS V2 — test Cassa Profit-First & KPI (derivato, deterministico).
import { describe, it, assert, assertEq } from './harness.mjs';
import * as PF from '../app-v2/src/profitfirst.js';
import { renderProfitFirst } from '../app-v2/src/profitfirst-ui.js';

function makeMock(store) {
  function builder(table) {
    const st = { table, filters: [], lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or() { return api; }, order() { return api; }, limit(n) { st.lim = n; return api; },
      maybeSingle() { const rows = run(st); return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(st), error: null }).then(res, rej); },
    };
    return api;
  }
  function run(st) { let rows = (store[st.table] || []).filter((r) => st.filters.every((f) => f(r))); if (st.lim) rows = rows.slice(0, st.lim); return rows; }
  return { from: (t) => builder(t) };
}

const today = new Date().toISOString().slice(0, 10);

describe('Profit-First — computeBuckets', (s) => {
  it(s, 'default KB 15/10/15/60 di 1000 = 150/100/150/600', async () => {
    const b = PF.computeBuckets(1000, {});
    assertEq(b.tax, 150); assertEq(b.reserve, 100); assertEq(b.goals, 150); assertEq(b.operational, 600);
    assert(b.valid, 'somma 100 valida');
  });
  it(s, 'percentuali personalizzate rispettate; somma ≠ 100 → valid false', async () => {
    const b = PF.computeBuckets(200, { cash_tax_pct: 20, cash_reserve_pct: 10, cash_goals_pct: 10, cash_operational_pct: 50 });
    assertEq(b.tax, 40); assert(!b.valid, 'somma 90 → non valida');
  });
  it(s, 'importo negativo → 0', async () => {
    const b = PF.computeBuckets(-500, {});
    assertEq(b.total, 0); assertEq(b.operational, 0);
  });
});

describe('Profit-First — loadProfitFirst', (s) => {
  function seed() {
    return {
      sales_payment: [
        { id: 'p1', invoice_id: 'i1', amount: 1000, paid_date: today, method: 'bank_transfer', deleted_at: null },
        { id: 'p2', invoice_id: 'i2', amount: 800, paid_date: today, method: 'cash', deleted_at: null },
      ],
      sales_invoice: [
        { id: 'i1', tenant_id: 't1', number: 'F1', customer_name: 'A', status: 'ISSUED', total: 1000, paid_total: 1000, issue_date: today, deleted_at: null },
        { id: 'i2', tenant_id: 't1', number: 'F2', customer_name: 'B', status: 'PAID', total: 800, paid_total: 800, issue_date: today, deleted_at: null },
      ],
      sales_quote: [
        { id: 'q1', tenant_id: 't1', number: 'PREV-1', status: 'ACCEPTED', issue_date: today, deleted_at: null },
        { id: 'q2', tenant_id: 't1', number: 'PREV-2', status: 'ACCEPTED', issue_date: today, deleted_at: null },
        { id: 'q3', tenant_id: 't1', number: 'PREV-3', status: 'REJECTED', issue_date: today, deleted_at: null },
      ],
      purchase_order: [], finance: [], tenant_settings: [],
    };
  }
  it(s, 'mese: incassato, buckets, KPI ricavi/ticket/conversione', async () => {
    const d = await PF.loadProfitFirst(makeMock(seed()), { period: 'month', tenantId: 't1' });
    assertEq(d.incassato, 1800);
    assertEq(d.buckets.tax, 270); assertEq(d.buckets.operational, 1080);
    const rev = d.kpis.find((k) => k.key === 'revenue');
    assert(rev && rev.actual === 1800 && rev.ok, 'ricavi ≥ 1500 ok');
    const conv = d.kpis.find((k) => k.key === 'conversion');
    // accettati 2 / (accettati 2 + rifiutati 1) = 66,67% ≥ 40%
    assert(conv && conv.actual > 66 && conv.actual < 67 && conv.ok, 'conversione ok');
    const ticket = d.kpis.find((k) => k.key === 'ticket');
    assertEq(ticket.actual, 900); // (1000+800)/2
    const margin = d.kpis.find((k) => k.key === 'margin');
    assert(margin && margin.na, 'margine N/D (no COGS)');
  });
  it(s, 'settimana: KPI ricavi + conversione + ore fatturabili N/D', async () => {
    const d = await PF.loadProfitFirst(makeMock(seed()), { period: 'week', tenantId: 't1' });
    assert(d.kpis.find((k) => k.key === 'revenue'), 'ricavi settimana');
    const bh = d.kpis.find((k) => k.key === 'billableHours');
    assert(bh && bh.na && /Time Tracker/.test(bh.source), 'ore N/D con fonte onesta');
  });
  it(s, 'conversione N/D se nessun preventivo chiuso', async () => {
    const st = seed(); st.sales_quote = [];
    const d = await PF.loadProfitFirst(makeMock(st), { period: 'month', tenantId: 't1' });
    const conv = d.kpis.find((k) => k.key === 'conversion');
    assert(conv.na, 'conversione N/D senza preventivi chiusi');
  });
});

describe('Profit-First — render', (s) => {
  it(s, 'renderProfitFirst mostra conti, KPI e fonte', async () => {
    const d = await PF.loadProfitFirst(makeMock({ sales_payment: [{ id: 'p1', amount: 1000, paid_date: today, deleted_at: null }], sales_invoice: [], sales_quote: [], purchase_order: [] }), { period: 'month', tenantId: 't1' });
    const html = renderProfitFirst(d);
    assert(/Tasse/.test(html) && /Operativo/.test(html), 'conti');
    assert(/KPI ufficiali/.test(html) && /Fonte/.test(html), 'tabella KPI con fonte');
    assert(/N\/D/.test(html), 'stato N/D presente (margine)');
  });
});
