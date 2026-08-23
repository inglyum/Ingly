// INGLY OS V2 — test Finanza (aggregazione derivata + pagamenti fornitori).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as FIN from '../app-v2/src/finance.js';
import { renderFinanceKpis, renderMovementRows, renderExposure } from '../app-v2/src/finance-ui.js';

function makeMock(store) {
  let uid = 0;
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; },
      limit(n) { st.lim = n; return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; },
      update(row) { st.op = 'update'; st.payload = row; return api; },
      single() { return Promise.resolve(run(st, 'single')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'sp' + (++uid), deleted_at: null, ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

function seed() {
  return {
    sales_invoice: [
      { id: 'i1', tenant_id: 't1', number: 'F1', customer_name: 'Maria', status: 'PARTIALLY_PAID', total: 100, paid_total: 40, due_date: '2000-01-01', deleted_at: null }, // scaduta, residuo 60
      { id: 'i2', tenant_id: 't1', number: 'F2', customer_name: 'Nino', status: 'ISSUED', total: 200, paid_total: 0, due_date: '2999-01-01', deleted_at: null }, // residuo 200
      { id: 'i3', tenant_id: 't1', number: 'F3', customer_name: 'Zed', status: 'DRAFT', total: 999, paid_total: 0, due_date: '2999-01-01', deleted_at: null }, // esclusa
    ],
    sales_payment: [
      { id: 'p1', tenant_id: 't1', invoice_id: 'i1', amount: 40, paid_date: '2026-08-20', method: 'cash', deleted_at: null },
    ],
    purchase_order: [
      { id: 'po1', tenant_id: 't1', number: 'ACQ-1', supplier_name: 'Legnami', status: 'ORDERED', total: 250, deleted_at: null },
      { id: 'po2', tenant_id: 't1', number: 'ACQ-2', supplier_name: 'Plexi', status: 'CANCELLED', total: 500, deleted_at: null }, // esclusa
    ],
    supplier_payment: [
      { id: 'sp1', tenant_id: 't1', purchase_order_id: 'po1', supplier_name: 'Legnami', amount: 100, paid_date: '2026-08-21', method: 'bank_transfer', deleted_at: null },
    ],
  };
}

describe('Finanza aggregazione derivata', (s) => {
  it(s, 'KPI crediti: incassato, da incassare, scaduto', async () => {
    const f = await FIN.loadFinance(makeMock(seed()), { from: '', to: '' });
    assertEq(f.incassato, 40);         // 1 incasso
    assertEq(f.daIncassare, 260);      // 60 + 200
    assertEq(f.scaduto, 60);           // i1 scaduta
  });
  it(s, 'KPI debiti fornitori: pagato, da pagare (derivato PO - pagamenti)', async () => {
    const f = await FIN.loadFinance(makeMock(seed()), { from: '', to: '' });
    assertEq(f.pagatoFornitori, 100);
    assertEq(f.daPagareFornitori, 150); // po1 250 - 100 (po2 esclusa perché CANCELLED)
  });
  it(s, 'cashflow = entrate - uscite nel periodo', async () => {
    const f = await FIN.loadFinance(makeMock(seed()), { from: '', to: '' });
    assertEq(f.entrate, 40); assertEq(f.uscite, 100); assertEq(f.cashflow, -60);
  });
  it(s, 'filtro periodo esclude i movimenti fuori range', async () => {
    const f = await FIN.loadFinance(makeMock(seed()), { from: '2027-01-01', to: '2027-12-31' });
    assertEq(f.incassato, 0); assertEq(f.pagatoFornitori, 0);
  });
  it(s, 'esposizione clienti/fornitori ordinata', async () => {
    const f = await FIN.loadFinance(makeMock(seed()), {});
    assertEq(f.esposizioneClienti[0].name, 'Nino'); assertEq(f.esposizioneClienti[0].value, 200);
    assertEq(f.esposizioneFornitori[0].name, 'Legnami'); assertEq(f.esposizioneFornitori[0].value, 150);
  });
  it(s, 'registerSupplierPayment: blocca overpayment lato client', async () => {
    const st = seed(); const sb = makeMock(st);
    let blocked = false;
    try { await FIN.registerSupplierPayment(sb, 't1', { purchase_order_id: 'po1', amount: 500 }, 150); } catch (e) { blocked = e.code === 'OVERPAY'; }
    assert(blocked, 'overpayment non bloccato');
    const ok = await FIN.registerSupplierPayment(sb, 't1', { purchase_order_id: 'po1', amount: 50 }, 150);
    assert(ok.id, 'pagamento valido non registrato');
    assertEq(FIN.supplierPaidFor(st.supplier_payment, 'po1'), 150);
  });
  it(s, 'periodRange month/week/all', async () => {
    assert(FIN.periodRange('all').from === '' , 'all');
    assert(/\d{4}-\d{2}-\d{2}/.test(FIN.periodRange('month').from), 'month');
    assert(/\d{4}-\d{2}-\d{2}/.test(FIN.periodRange('week').from), 'week');
  });
});

describe('Finanza render (offline)', (s) => {
  it(s, 'renderFinanceKpis mostra le card', async () => {
    const html = renderFinanceKpis({ incassato: 40, daIncassare: 260, scaduto: 60, pagatoFornitori: 100, daPagareFornitori: 150, cashflow: -60 });
    assert(/Incassato/.test(html) && /Da pagare fornitori/.test(html) && /Cashflow/.test(html), 'kpi');
  });
  it(s, 'renderMovementRows segno + empty; renderExposure', async () => {
    assert(/\+/.test(renderMovementRows([{ date: '2026-08-01', amount: 40, method: 'cash', source: 'Incasso fattura' }], 1)), 'entrata +');
    assert(/-/.test(renderMovementRows([{ date: '2026-08-01', amount: 40, method: 'cash', source: 'Pagamento fornitore' }], -1)), 'uscita -');
    assert(/Nessun movimento/.test(renderMovementRows([], 1)), 'empty');
    assert(/Maria/.test(renderExposure([{ name: 'Maria', value: 100 }], 'clienti')), 'exposure');
  });
});

describe('Finanza migration 0018 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000018_supplier_payment.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(finance.payment) + overpayment guard + FK PO', async () => {
    assert(/alter table public\.supplier_payment enable row level security/.test(sql), 'RLS');
    assert(/has_permission\(tenant_id,'finance\.payment','read'\)/.test(sql), 'read perm');
    assert(/supplier_payment_validate/.test(sql) && /superiore al residuo/.test(sql), 'overpayment guard');
    assert(/purchase_order_id uuid references public\.purchase_order\(id\)/.test(sql), 'FK PO');
    assert(/crm_enforce_delete_perm\('finance\.payment'\)/.test(sql), 'trigger delete');
  });
});
