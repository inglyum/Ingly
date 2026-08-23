// INGLY OS V2 — test Ordini (data-layer + conversione da preventivo + render).
// Mock emula i trigger DB (numero per-tenant, line_total generato, ricalcolo).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as ORD from '../app-v2/src/orders.js';
import * as Q from '../app-v2/src/quotes.js';
import { renderOrderRows, renderOrderKanban, renderOrderDetail } from '../app-v2/src/orders-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {}; const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const NUM = { sales_quote: ['PREV', 'quote_id'], sales_order: ['ORD', 'order_id'] };
  function recalc(table, fk, id) {
    const lt = table + '_line';
    const lines = (store[lt] || []).filter((l) => l[fk] === id);
    const h = (store[table] || []).find((x) => x.id === id); if (!h) return;
    h.subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    h.discount = r2(lines.reduce((s, l) => s + (l.discount || 0), 0));
    h.tax = r2(lines.reduce((s, l) => s + (l.tax || 0), 0));
    h.total = r2(lines.reduce((s, l) => s + l.line_total, 0));
  }
  function onInsert(table, row) {
    if (table === 'sales_quote' || table === 'sales_order') {
      const [prefix] = NUM[table]; const t = row.tenant_id; const key = table + t;
      counters[key] = (counters[key] || 0) + 1;
      row.number = prefix + '-' + String(counters[key]).padStart(6, '0');
      row.status = row.status || (table === 'sales_quote' ? 'DRAFT' : 'CONFIRMED');
      row.subtotal = row.discount = row.tax = row.total = 0;
      if (table === 'sales_quote' && !row.valid_until) row.valid_until = '2026-08-29';
    }
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
  function fkFor(t) { return t === 'sales_quote_line' ? ['sales_quote', 'quote_id'] : ['sales_order', 'order_id']; }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), ...st.payload }; onInsert(st.table, row); arr.push(row);
      if (st.table.endsWith('_line')) { const [h, fk] = fkFor(st.table); recalc(h, fk, row[fk]); } return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload));
      if (st.table.endsWith('_line')) { const [h, fk] = fkFor(st.table); rows.forEach((r) => { r.line_total = Math.round((r.quantity * r.unit_price - (r.discount || 0) + (r.tax || 0)) * 100) / 100; recalc(h, fk, r[fk]); }); }
      return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); rem.forEach((r) => arr.splice(arr.indexOf(r), 1));
      if (st.table.endsWith('_line')) { const [h, fk] = fkFor(st.table); rem.forEach((r) => recalc(h, fk, r[fk])); } return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const store = () => ({ sales_quote: [], sales_quote_line: [], sales_order: [], sales_order_line: [],
  crm_customer: [{ id: 'c1', tenant_id: 't1', name: 'Maria', type: 'B2B', deleted_at: null }] });

describe('Ordini data-layer + conversione (mock trigger)', (s) => {
  it(s, 'createOrder: numero ORD per-tenant dal DB', async () => {
    const sb = makeMock(store());
    const o1 = await ORD.createOrder(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    const o2 = await ORD.createOrder(sb, 't1', { customer_id: 'c1' });
    assertEq(o1.number, 'ORD-000001'); assertEq(o2.number, 'ORD-000002'); assertEq(o1.status, 'CONFIRMED');
  });
  it(s, 'convertQuoteToOrder: crea ordine con righe snapshot e link quote_id', async () => {
    const st = store(); const sb = makeMock(st);
    const q = await Q.createQuote(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    await Q.addLine(sb, 't1', q.id, { description: 'Targa', quantity: 2, unit_price: 30, discount: 5 });
    await Q.changeStatus(sb, q.id, 'ACCEPTED');
    const order = await ORD.convertQuoteToOrder(sb, 't1', q.id);
    assertEq(order.quote_id, q.id); assertEq(order.number, 'ORD-000001');
    const b = await ORD.getOrder(sb, order.id);
    assertEq(b.lines.length, 1); assertEq(b.lines[0].line_total, 55); assertEq(b.order.total, 55);
    // preventivo originale intatto
    const qb = await Q.getQuote(sb, q.id); assertEq(qb.lines.length, 1); assertEq(qb.quote.status, 'ACCEPTED');
  });
  it(s, 'changeStatus valido/invalido + archivio esclude dalla lista', async () => {
    const st = store(); const sb = makeMock(st);
    const o = await ORD.createOrder(sb, 't1', { customer_id: 'c1' });
    await ORD.changeStatus(sb, o.id, 'DELIVERED'); assertEq(st.sales_order[0].status, 'DELIVERED');
    let threw = false; try { await ORD.changeStatus(sb, o.id, 'X'); } catch { threw = true; } assert(threw, 'stato invalido accettato');
    await ORD.softDeleteOrder(sb, o.id);
    assert(!(await ORD.listOrders(sb, {})).some((x) => x.id === o.id), 'archiviato in lista');
  });
  it(s, 'listOrders: filtro stato + ricerca', async () => {
    const st = store(); const sb = makeMock(st);
    const a = await ORD.createOrder(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    await ORD.changeStatus(sb, a.id, 'READY');
    await ORD.createOrder(sb, 't1', { customer_id: 'c1', customer_name: 'Nino' });
    assertEq((await ORD.listOrders(sb, { status: 'READY' })).length, 1);
    assertEq((await ORD.listOrders(sb, { search: 'nino' })).length, 1);
  });
  it(s, 'numerazione isolata per tenant', async () => {
    const sb = makeMock(store());
    const a = await ORD.createOrder(sb, 'tA', {}); const b = await ORD.createOrder(sb, 'tB', {});
    assertEq(a.number, 'ORD-000001'); assertEq(b.number, 'ORD-000001');
  });
});

describe('Ordini render + RBAC (offline)', (s) => {
  const bundle = { order: { id: 'o1', number: 'ORD-000001', customer_name: 'Maria', status: 'IN_PRODUCTION', order_date: '2026-08-22', quote_id: 'q1' },
    lines: [{ id: 'l1', description: 'Targa', quantity: 2, unit_price: 30, discount: 5, tax: 0, line_total: 55 }],
    totals: { subtotal: 60, discount: 5, tax: 0, total: 55 } };
  it(s, 'renderOrderRows + empty', async () => {
    assert(/data-order="o1"/.test(renderOrderRows([{ id: 'o1', number: 'ORD-000001', customer_name: 'M', status: 'CONFIRMED', total: 55 }])), 'riga');
    assert(/Nessun ordine/.test(renderOrderRows([])), 'empty');
  });
  it(s, 'renderOrderKanban: colonne per stato con conteggi', async () => {
    const html = renderOrderKanban([{ id: 'o1', number: 'ORD-1', customer_name: 'M', status: 'READY', total: 10 }]);
    assert(/Pronto/.test(html) && /data-col="READY"/.test(html), 'colonna READY');
    assert(/v2-kcard/.test(html), 'card ordine');
  });
  it(s, 'renderOrderDetail: totali, archivia solo MANAGER+, VIEWER read-only', async () => {
    assert(/ORD-000001/.test(renderOrderDetail(bundle, 'SALES')), 'numero');
    assert(!/data-del=/.test(renderOrderDetail(bundle, 'SALES')), 'SALES non archivia');
    assert(/data-del=/.test(renderOrderDetail(bundle, 'MANAGER')), 'MANAGER archivia');
    assert(/data-status/.test(renderOrderDetail(bundle, 'SALES')) && !/data-status/.test(renderOrderDetail(bundle, 'VIEWER')), 'status editabile solo write');
    assert(/Totale/.test(renderOrderDetail(bundle, 'OWNER')), 'riepilogo');
  });
});

describe('Ordini migration 0009 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000009_sales_order.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(sales.order) su testata e righe', async () => {
    assert(/alter table public\.sales_order enable row level security/.test(sql), 'RLS order');
    assert(/alter table public\.sales_order_line enable row level security/.test(sql), 'RLS line');
    assert(/has_permission\(tenant_id,'sales\.order','read'\)/.test(sql), 'read perm');
  });
  it(s, 'numerazione ORD race-safe + totali DB + FK quote_id', async () => {
    assert(/next_order_number/.test(sql) && /on conflict \(tenant_id\) do update/.test(sql), 'counter');
    assert(/line_total numeric generated always as/.test(sql), 'line_total generato');
    assert(/quote_id uuid references public\.sales_quote\(id\)/.test(sql), 'FK provenienza preventivo');
  });
  it(s, 'soft-delete via trigger condiviso; nessun secondo authz', async () => {
    assert(/crm_enforce_delete_perm\('sales\.order'\)/.test(sql), 'trigger delete');
    assert(!/create or replace function public\.has_permission/.test(sql), 'non ridefinisce has_permission');
  });
});
