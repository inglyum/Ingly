// INGLY OS V2 — test Fatture (data-layer + conversione Ordine→Fattura + render).
// Mock emula i trigger (numero fiscale annuale, line_total generato, ricalcolo).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as INV from '../app-v2/src/invoices.js';
import * as ORD from '../app-v2/src/orders.js';
import { renderInvoiceRows, renderInvoiceDetail } from '../app-v2/src/invoices-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {}; const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const HDR = { sales_order_line: ['sales_order', 'order_id'], sales_invoice_line: ['sales_invoice', 'invoice_id'] };
  function recalc(lt, hdr, fk, id) {
    const ls = (store[lt] || []).filter((l) => l[fk] === id); const h = (store[hdr] || []).find((x) => x.id === id); if (!h) return;
    h.subtotal = r2(ls.reduce((s, l) => s + l.quantity * l.unit_price, 0)); h.discount = r2(ls.reduce((s, l) => s + (l.discount || 0), 0));
    h.tax = r2(ls.reduce((s, l) => s + (l.tax || 0), 0)); h.total = r2(ls.reduce((s, l) => s + l.line_total, 0));
  }
  function onInsert(table, row) {
    if (table === 'sales_order') { const k = table + row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'ORD-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'CONFIRMED'; row.subtotal = row.discount = row.tax = row.total = 0; }
    if (table === 'sales_invoice') { const y = row.year || (row.issue_date ? Number(String(row.issue_date).slice(0, 4)) : 2026); const k = table + row.tenant_id + y; counters[k] = (counters[k] || 0) + 1;
      row.year = y; row.number = 'FATT-' + y + '-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'DRAFT';
      row.subtotal = row.discount = row.tax = row.total = 0; row.paid_total = row.paid_total || 0; if (!row.due_date) row.due_date = '2026-09-21'; }
    if (table.endsWith('_line')) row.line_total = r2(row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0));
  }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or(expr) { const parts = expr.split(',').map((p) => { const m = p.match(/^(\w+)\.ilike\.%(.*)%$/); return m ? { col: m[1], q: m[2].toLowerCase() } : null; }).filter(Boolean);
        st.filters.push((r) => parts.some((p) => String(r[p.col] || '').toLowerCase().includes(p.q))); return api; },
      order(c, o) { st.orderBy = c; st.asc = !o || o.ascending; return api; },
      limit(n) { st.lim = n; return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; },
      update(row) { st.op = 'update'; st.payload = row; return api; },
      delete() { st.op = 'delete'; return api; },
      single() { return Promise.resolve(run(st, 'single')); },
      maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), ...st.payload }; onInsert(st.table, row); arr.push(row);
      if (HDR[st.table]) { const [h, fk] = HDR[st.table]; recalc(st.table, h, fk, row[fk]); } return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload));
      if (HDR[st.table]) { const [h, fk] = HDR[st.table]; rows.forEach((r) => { r.line_total = Math.round((r.quantity * r.unit_price - (r.discount || 0) + (r.tax || 0)) * 100) / 100; recalc(st.table, h, fk, r[fk]); }); }
      return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); rem.forEach((r) => arr.splice(arr.indexOf(r), 1));
      if (HDR[st.table]) { const [h, fk] = HDR[st.table]; rem.forEach((r) => recalc(st.table, h, fk, r[fk])); } return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const store = () => ({ sales_order: [], sales_order_line: [], sales_invoice: [], sales_invoice_line: [],
  crm_customer: [{ id: 'c1', tenant_id: 't1', name: 'Maria', deleted_at: null }] });

describe('Fatture data-layer + conversione (mock trigger)', (s) => {
  it(s, 'createInvoice: numero fiscale annuale per-tenant dal DB', async () => {
    const sb = makeMock(store());
    const i1 = await INV.createInvoice(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    const i2 = await INV.createInvoice(sb, 't1', { customer_id: 'c1' });
    assertEq(i1.number, 'FATT-2026-000001'); assertEq(i2.number, 'FATT-2026-000002');
    assert(i1.due_date, 'due_date non impostata dal DB');
  });
  it(s, 'numerazione isolata per tenant e per anno', async () => {
    const sb = makeMock(store());
    const a = await INV.createInvoice(sb, 'tA', {}); const b = await INV.createInvoice(sb, 'tB', {});
    assertEq(a.number, 'FATT-2026-000001'); assertEq(b.number, 'FATT-2026-000001');
    const c = await INV.createInvoice(sb, 'tA', { issue_date: '2027-01-05', year: 2027 });
    assertEq(c.number, 'FATT-2027-000001');
  });
  it(s, 'convertOrderToInvoice: ISSUED, righe snapshot, link order_id, ordine intatto', async () => {
    const st = store(); const sb = makeMock(st);
    const o = await ORD.createOrder(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    await ORD.addLine(sb, 't1', o.id, { description: 'Targa', quantity: 2, unit_price: 30, discount: 5 });
    const inv = await INV.convertOrderToInvoice(sb, 't1', o.id);
    assertEq(inv.order_id, o.id); assertEq(inv.status, 'ISSUED');
    const b = await INV.getInvoice(sb, inv.id);
    assertEq(b.lines.length, 1); assertEq(b.lines[0].line_total, 55); assertEq(b.invoice.total, 55);
    const ob = await ORD.getOrder(sb, o.id); assertEq(ob.lines.length, 1); // ordine intatto
  });
  it(s, 'paymentStatus/balanceDue derivati corretti', async () => {
    assertEq(INV.balanceDue({ total: 100, paid_total: 30 }), 70);
    assertEq(INV.paymentStatus({ status: 'ISSUED', total: 100, paid_total: 0 }), 'ISSUED');
    assertEq(INV.paymentStatus({ status: 'ISSUED', total: 100, paid_total: 40 }), 'PARTIALLY_PAID');
    assertEq(INV.paymentStatus({ status: 'ISSUED', total: 100, paid_total: 100 }), 'PAID');
  });
  it(s, 'changeStatus valido/invalido + archivio esclude dalla lista', async () => {
    const st = store(); const sb = makeMock(st);
    const i = await INV.createInvoice(sb, 't1', { customer_id: 'c1' });
    await INV.changeStatus(sb, i.id, 'PAID'); assertEq(st.sales_invoice[0].status, 'PAID');
    let threw = false; try { await INV.changeStatus(sb, i.id, 'X'); } catch { threw = true; } assert(threw, 'stato invalido accettato');
    await INV.softDeleteInvoice(sb, i.id);
    assert(!(await INV.listInvoices(sb, {})).some((x) => x.id === i.id), 'archiviata in lista');
  });
  it(s, 'listInvoices: filtro stato + ricerca', async () => {
    const st = store(); const sb = makeMock(st);
    const a = await INV.createInvoice(sb, 't1', { customer_id: 'c1', customer_name: 'Maria', status: 'ISSUED' });
    await INV.createInvoice(sb, 't1', { customer_id: 'c1', customer_name: 'Nino', status: 'PAID' });
    assertEq((await INV.listInvoices(sb, { status: 'PAID' })).length, 1);
    assertEq((await INV.listInvoices(sb, { search: 'maria' })).length, 1);
  });
});

describe('Fatture render + RBAC (offline)', (s) => {
  const bundle = { invoice: { id: 'i1', number: 'FATT-2026-000001', customer_name: 'Maria', status: 'PARTIALLY_PAID', issue_date: '2026-08-22', due_date: '2026-09-21', order_id: 'o1', total: 100, paid_total: 40 },
    lines: [{ id: 'l1', description: 'Targa', quantity: 2, unit_price: 30, discount: 5, tax: 15, line_total: 70 }],
    totals: { subtotal: 60, discount: 5, tax: 15, total: 70 } };
  it(s, 'renderInvoiceRows: righe + saldo + empty', async () => {
    assert(/data-invoice="i1"/.test(renderInvoiceRows([{ id: 'i1', number: 'F1', customer_name: 'M', status: 'ISSUED', total: 100, paid_total: 40 }])), 'riga');
    assert(/Nessuna fattura/.test(renderInvoiceRows([])), 'empty');
  });
  it(s, 'renderInvoiceDetail: imponibile/IVA/saldo, archivia MANAGER+, VIEWER read-only', async () => {
    assert(/FATT-2026-000001/.test(renderInvoiceDetail(bundle, 'SALES')), 'numero');
    assert(/Imponibile/.test(renderInvoiceDetail(bundle, 'OWNER')) && /IVA/.test(renderInvoiceDetail(bundle, 'OWNER')) && /Saldo/.test(renderInvoiceDetail(bundle, 'OWNER')), 'riepilogo fiscale');
    assert(!/data-del=/.test(renderInvoiceDetail(bundle, 'SALES')), 'SALES non archivia');
    assert(/data-del=/.test(renderInvoiceDetail(bundle, 'MANAGER')), 'MANAGER archivia');
    assert(!/data-status/.test(renderInvoiceDetail(bundle, 'VIEWER')), 'VIEWER read-only');
  });
});

describe('Fatture migration 0010 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000010_sales_invoice.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(sales.invoice) su testata e righe', async () => {
    assert(/alter table public\.sales_invoice enable row level security/.test(sql), 'RLS inv');
    assert(/alter table public\.sales_invoice_line enable row level security/.test(sql), 'RLS line');
    assert(/has_permission\(tenant_id,'sales\.invoice','read'\)/.test(sql), 'read perm');
  });
  it(s, 'numerazione fiscale annuale + totali DB + FK order_id', async () => {
    assert(/next_invoice_number/.test(sql) && /on conflict \(tenant_id, year\) do update/.test(sql), 'counter annuale');
    assert(/line_total numeric generated always as/.test(sql), 'line_total generato');
    assert(/order_id uuid references public\.sales_order\(id\)/.test(sql), 'FK provenienza ordine');
  });
  it(s, 'soft-delete via trigger condiviso; nessun secondo authz', async () => {
    assert(/crm_enforce_delete_perm\('sales\.invoice'\)/.test(sql), 'trigger delete');
    assert(!/create or replace function public\.has_permission/.test(sql), 'non ridefinisce has_permission');
  });
});
