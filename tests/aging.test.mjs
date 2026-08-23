// INGLY OS V2 — test Scadenziario (derivato dalle fatture), offline.
import { describe, it, assert, assertEq } from './harness.mjs';
import * as AG from '../app-v2/src/aging.js';
import { renderAgingRows, renderAgingSummary } from '../app-v2/src/aging-ui.js';

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
  function run(st) {
    let rows = (store[st.table] || []).filter((r) => st.filters.every((f) => f(r)));
    if (st.lim) rows = rows.slice(0, st.lim);
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const TODAY = '2026-09-15';
function seed() {
  return { sales_invoice: [
    { id: 'i1', tenant_id: 't1', number: 'F1', customer_name: 'A', status: 'ISSUED', total: 100, paid_total: 0, due_date: '2026-10-01', deleted_at: null }, // current
    { id: 'i2', tenant_id: 't1', number: 'F2', customer_name: 'B', status: 'PARTIALLY_PAID', total: 200, paid_total: 50, due_date: '2026-09-01', deleted_at: null }, // 14gg → d1_30, residuo 150
    { id: 'i3', tenant_id: 't1', number: 'F3', customer_name: 'C', status: 'OVERDUE', total: 300, paid_total: 0, due_date: '2026-06-01', deleted_at: null }, // >90gg
    { id: 'i4', tenant_id: 't1', number: 'F4', customer_name: 'D', status: 'PAID', total: 100, paid_total: 100, due_date: '2026-05-01', deleted_at: null }, // esclusa
    { id: 'i5', tenant_id: 't1', number: 'F5', customer_name: 'E', status: 'DRAFT', total: 100, paid_total: 0, due_date: '2026-05-01', deleted_at: null }, // esclusa
  ] };
}

describe('Scadenziario data-layer (derivato)', (s) => {
  it(s, 'loadAging esclude PAID/DRAFT/CANCELLED e senza residuo', async () => {
    const { rows } = await AG.loadAging(makeMock(seed()), { today: TODAY });
    assertEq(rows.length, 3);
    assert(!rows.some((r) => ['i4', 'i5'].includes(r.id)), 'incluse fatture da escludere');
  });
  it(s, 'agingBucket assegna le fasce corrette', async () => {
    assertEq(AG.agingBucket({ due_date: '2026-10-01' }, TODAY), 'current');
    assertEq(AG.agingBucket({ due_date: '2026-09-01' }, TODAY), 'd1_30');
    assertEq(AG.agingBucket({ due_date: '2026-08-01' }, TODAY), 'd31_60');
    assertEq(AG.agingBucket({ due_date: '2026-06-01' }, TODAY), 'd90p');
  });
  it(s, 'residuo e totali per fascia', async () => {
    const { rows, totals } = await AG.loadAging(makeMock(seed()), { today: TODAY });
    const f2 = rows.find((r) => r.id === 'i2'); assertEq(f2.residuo, 150); assertEq(f2.bucket, 'd1_30');
    assertEq(totals.current, 100); assertEq(totals.d1_30, 150); assertEq(totals.d90p, 300);
    assertEq(totals.total, 550); assertEq(totals.overdue, 450); // i2+i3 scadute
  });
  it(s, 'filtro per bucket', async () => {
    const { rows } = await AG.loadAging(makeMock(seed()), { today: TODAY, bucket: 'd90p' });
    assertEq(rows.length, 1); assertEq(rows[0].id, 'i3');
  });
  it(s, 'ordina per scadenza crescente (più urgenti prima)', async () => {
    const { rows } = await AG.loadAging(makeMock(seed()), { today: TODAY });
    assertEq(rows[0].id, 'i3'); // 2026-06-01 prima
  });
});

describe('Scadenziario render (offline)', (s) => {
  it(s, 'renderAgingRows: righe + evidenza scaduto + empty', async () => {
    const html = renderAgingRows([{ id: 'i3', number: 'F3', customer_name: 'C', due_date: '2026-06-01', bucket: 'd90p', total: 300, residuo: 300, overdue: true }]);
    assert(/data-invoice="i3"/.test(html) && /v2-row-warn/.test(html), 'riga scaduta evidenziata');
    assert(/Nessuna scadenza aperta/.test(renderAgingRows([])), 'empty');
  });
  it(s, 'renderAgingSummary: fasce + totale', async () => {
    const html = renderAgingSummary({ current: 100, d1_30: 150, d31_60: 0, d61_90: 0, d90p: 300, overdue: 450, total: 550 });
    assert(/A scadere/.test(html) && /Totale aperto/.test(html) && /550/.test(html), 'summary');
  });
});
