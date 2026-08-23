// INGLY OS V2 — test Pagamenti/Incassi (data-layer + integrazione fattura).
// Il mock emula i trigger DB: validazione overpayment + ricalcolo paid_total e
// stato fattura ad ogni pagamento (insert/soft-delete).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as PAY from '../app-v2/src/payments.js';
import * as INV from '../app-v2/src/invoices.js';
import { renderPayments } from '../app-v2/src/invoices-ui.js';

function makeMock(store) {
  let uid = 0; const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  function applyPayments(invId) {
    const inv = (store.sales_invoice || []).find((i) => i.id === invId); if (!inv) return;
    const paid = r2((store.sales_payment || []).filter((p) => p.invoice_id === invId && p.deleted_at == null).reduce((s, p) => s + p.amount, 0));
    inv.paid_total = paid;
    if (!['CANCELLED', 'DRAFT'].includes(inv.status)) {
      const today = new Date().toISOString().slice(0, 10);
      if (paid >= inv.total && inv.total > 0) inv.status = 'PAID';
      else if (paid > 0) inv.status = 'PARTIALLY_PAID';
      else if (inv.due_date && inv.due_date < today) inv.status = 'OVERDUE';
      else inv.status = 'ISSUED';
    }
  }
  function validate(row, isUpdate) {
    if (row.deleted_at != null) return;
    const inv = (store.sales_invoice || []).find((i) => i.id === row.invoice_id);
    const total = inv ? inv.total : 0;
    const paid = (store.sales_payment || []).filter((p) => p.invoice_id === row.invoice_id && p.deleted_at == null && (!isUpdate || p.id !== row.id)).reduce((s, p) => s + p.amount, 0);
    const residuo = total - paid;
    if (!row.allow_overpayment && row.amount > residuo + 0.001) { const e = new Error('superiore al residuo'); e.code = '23514'; throw e; }
  }
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
      maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') {
      const row = { id: 'pay' + (++uid), deleted_at: null, ...st.payload };
      if (st.table === 'sales_payment') { try { validate(row, false); } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; } }
      arr.push(row);
      if (st.table === 'sales_payment') applyPayments(row.invoice_id);
      return { data: row, error: null };
    }
    if (st.op === 'update') {
      let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload));
      if (st.table === 'sales_payment') rows.forEach((r) => applyPayments(r.invoice_id));
      return { data: rows[0] || null, error: null };
    }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const store = () => ({
  sales_invoice: [{ id: 'inv1', tenant_id: 't1', number: 'FATT-2026-000001', status: 'ISSUED', total: 100, paid_total: 0, due_date: '2026-12-31', deleted_at: null }],
  sales_payment: [],
});

describe('Pagamenti data-layer + integrazione fattura', (s) => {
  it(s, 'registerPayment parziale → PARTIALLY_PAID + residuo', async () => {
    const st = store(); const sb = makeMock(st);
    await PAY.registerPayment(sb, 't1', 'inv1', { amount: 40, method: 'cash' }, 100);
    const inv = st.sales_invoice[0];
    assertEq(inv.paid_total, 40); assertEq(inv.status, 'PARTIALLY_PAID');
    assertEq(INV.balanceDue(inv), 60);
  });
  it(s, 'secondo pagamento salda → PAID, residuo 0', async () => {
    const st = store(); const sb = makeMock(st);
    await PAY.registerPayment(sb, 't1', 'inv1', { amount: 40 }, 100);
    await PAY.registerPayment(sb, 't1', 'inv1', { amount: 60 }, 60);
    const inv = st.sales_invoice[0];
    assertEq(inv.paid_total, 100); assertEq(inv.status, 'PAID'); assertEq(INV.balanceDue(inv), 0);
  });
  it(s, 'overpayment bloccato lato client (residuo) e lato DB (trigger)', async () => {
    const st = store(); const sb = makeMock(st);
    let clientBlock = false;
    try { await PAY.registerPayment(sb, 't1', 'inv1', { amount: 150 }, 100); } catch (e) { clientBlock = e.code === 'OVERPAY'; }
    assert(clientBlock, 'client non ha bloccato overpayment');
    // forza il client ma il DB (mock) valida comunque: passiamo residuo alto per saltare il check client
    let dbBlock = false;
    try { await PAY.registerPayment(sb, 't1', 'inv1', { amount: 150 }, 99999); } catch (e) { dbBlock = /residuo/i.test(e.message); }
    assert(dbBlock, 'DB non ha bloccato overpayment');
    assertEq(st.sales_payment.length, 0);
  });
  it(s, 'overpayment consentito con allow_overpayment', async () => {
    const st = store(); const sb = makeMock(st);
    await PAY.registerPayment(sb, 't1', 'inv1', { amount: 120, allow_overpayment: true }, 100);
    assertEq(st.sales_invoice[0].paid_total, 120); assertEq(st.sales_invoice[0].status, 'PAID');
  });
  it(s, 'più pagamenti + storno (soft-delete) ricalcola stato', async () => {
    const st = store(); const sb = makeMock(st);
    const p1 = await PAY.registerPayment(sb, 't1', 'inv1', { amount: 100 }, 100);
    assertEq(st.sales_invoice[0].status, 'PAID');
    await PAY.voidPayment(sb, p1.id);
    assertEq(st.sales_invoice[0].paid_total, 0); assertEq(st.sales_invoice[0].status, 'ISSUED');
  });
  it(s, 'listPayments + totalPaid escludono gli stornati', async () => {
    const st = store(); const sb = makeMock(st);
    await PAY.registerPayment(sb, 't1', 'inv1', { amount: 30 }, 100);
    const p = await PAY.registerPayment(sb, 't1', 'inv1', { amount: 20 }, 70);
    await PAY.voidPayment(sb, p.id);
    const list = await PAY.listPayments(sb, 'inv1');
    assertEq(list.length, 1); assertEq(PAY.totalPaid(list), 30);
  });
});

describe('Pagamenti render (offline)', (s) => {
  it(s, 'renderPayments: storico + form incasso se residuo>0 e write', async () => {
    const inv = { id: 'inv1', status: 'ISSUED', total: 100, paid_total: 40, due_date: '2026-12-31' };
    const html = PAY.PAYMENT_METHODS && renderPayments([{ id: 'p1', amount: 40, method: 'cash', paid_date: '2026-08-01' }], inv, 'SALES');
    assert(/Incassi/.test(html) && /40/.test(html), 'storico');
    assert(/data-pay-form/.test(html), 'form incasso per SALES con residuo');
  });
  it(s, 'renderPayments: nessun form se saldata o VIEWER', async () => {
    const paid = { id: 'i', status: 'PAID', total: 100, paid_total: 100, due_date: '2026-12-31' };
    assert(!/data-pay-form/.test(renderPayments([], paid, 'SALES')), 'form presente su saldata');
    const inv = { id: 'i', status: 'ISSUED', total: 100, paid_total: 0, due_date: '2026-12-31' };
    assert(!/data-pay-form/.test(renderPayments([], inv, 'VIEWER')), 'VIEWER non registra incassi');
  });
});

describe('Pagamenti migration 0011 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000011_sales_payment.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(sales.payment)', async () => {
    assert(/alter table public\.sales_payment enable row level security/.test(sql), 'RLS');
    assert(/has_permission\(tenant_id,'sales\.payment','create'\)/.test(sql), 'create perm');
  });
  it(s, 'trigger: validazione overpayment + propagazione stato fattura', async () => {
    assert(/sales_payment_validate/.test(sql) && /allow_overpayment/.test(sql) && /23514/.test(sql), 'validate overpayment');
    assert(/sales_invoice_apply_payments/.test(sql) && /PARTIALLY_PAID/.test(sql) && /PAID/.test(sql), 'ricalcolo stato');
    assert(/references public\.sales_invoice\(id\)/.test(sql), 'FK fattura');
  });
});
