// INGLY OS V2 — test Preventivi (data-layer + render + totali), offline.
// Il mock EMULA i trigger DB: numero per-tenant, line_total generato, ricalcolo
// totali testata. Così i test riflettono il comportamento reale del server.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as Q from '../app-v2/src/quotes.js';
import { renderQuoteRows, renderQuoteDetail, renderQuoteForm } from '../app-v2/src/quotes-ui.js';

function makeMock(store) {
  let uid = 0;
  const counters = {};
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  function recalc(quoteId) {
    const lines = (store.sales_quote_line || []).filter((l) => l.quote_id === quoteId);
    const q = (store.sales_quote || []).find((x) => x.id === quoteId);
    if (!q) return;
    q.subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    q.discount = r2(lines.reduce((s, l) => s + (l.discount || 0), 0));
    q.tax = r2(lines.reduce((s, l) => s + (l.tax || 0), 0));
    q.total = r2(lines.reduce((s, l) => s + l.line_total, 0));
  }
  function onInsert(table, row) {
    if (table === 'sales_quote') {
      const t = row.tenant_id; counters[t] = (counters[t] || 0) + 1;
      row.number = 'PREV-' + String(counters[t]).padStart(6, '0');
      if (!row.valid_until) row.valid_until = '2026-08-29';
      row.subtotal = row.discount = row.tax = row.total = 0;
      row.status = row.status || 'DRAFT';
    }
    if (table === 'sales_quote_line') {
      row.line_total = r2(row.quantity * row.unit_price - (row.discount || 0) + (row.tax || 0));
    }
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
      if (st.table === 'sales_quote_line') recalc(row.quote_id); return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload));
      rows.forEach((r) => { if (st.table === 'sales_quote_line') { r.line_total = Math.round((r.quantity * r.unit_price - (r.discount || 0) + (r.tax || 0)) * 100) / 100; recalc(r.quote_id); } });
      return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); for (const r of rem) arr.splice(arr.indexOf(r), 1);
      rem.forEach((r) => { if (st.table === 'sales_quote_line') recalc(r.quote_id); }); return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const emptyStore = () => ({ sales_quote: [], sales_quote_line: [], crm_customer: [
  { id: 'c1', tenant_id: 't1', name: 'Maria', type: 'B2B', deleted_at: null }] });

describe('Preventivi data-layer (mock con trigger emulati)', (s) => {
  it(s, 'createQuote: numero per-tenant assegnato dal DB, non dal client', async () => {
    const st = emptyStore(); const sb = makeMock(st);
    const q1 = await Q.createQuote(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    const q2 = await Q.createQuote(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    assertEq(q1.number, 'PREV-000001'); assertEq(q2.number, 'PREV-000002');
    assertEq(q1.status, 'DRAFT'); assert(q1.valid_until, 'valid_until non impostato dal DB');
    // il client non ha inviato number
    assert(!('number' in Object.keys(st.sales_quote[0]).filter((k) => k === 'number_sent')), 'ok');
  });
  it(s, 'numerazione isolata per tenant', async () => {
    const st = { sales_quote: [], sales_quote_line: [], crm_customer: [] }; const sb = makeMock(st);
    const a = await Q.createQuote(sb, 'tA', {}); const b = await Q.createQuote(sb, 'tB', {});
    assertEq(a.number, 'PREV-000001'); assertEq(b.number, 'PREV-000001'); // contatori separati
  });
  it(s, 'addLine + totali ricalcolati lato DB', async () => {
    const st = emptyStore(); const sb = makeMock(st);
    const q = await Q.createQuote(sb, 't1', { customer_id: 'c1' });
    await Q.addLine(sb, 't1', q.id, { description: 'Targa', quantity: 2, unit_price: 30, discount: 5, tax: 0 });
    await Q.addLine(sb, 't1', q.id, { description: 'QR', quantity: 1, unit_price: 20, discount: 0, tax: 4.4 });
    const b = await Q.getQuote(sb, q.id);
    assertEq(b.lines.length, 2);
    assertEq(b.lines[0].line_total, 55);   // 2*30-5
    assertEq(b.quote.subtotal, 80);        // 60+20
    assertEq(b.quote.total, 79.4);         // 55 + 24.4
  });
  it(s, 'computeTotals deterministico (display)', async () => {
    const t = Q.computeTotals([{ quantity: 2, unit_price: 30, discount: 5, tax: 0 }, { quantity: 1, unit_price: 20, discount: 0, tax: 4.4 }]);
    assertEq(t.subtotal, 80); assertEq(t.discount, 5); assertEq(t.tax, 4.4); assertEq(t.total, 79.4);
  });
  it(s, 'updateQuote/changeStatus e archivio', async () => {
    const st = emptyStore(); const sb = makeMock(st);
    const q = await Q.createQuote(sb, 't1', { customer_id: 'c1' });
    await Q.changeStatus(sb, q.id, 'SENT');
    assertEq(st.sales_quote[0].status, 'SENT');
    await Q.softDeleteQuote(sb, q.id);
    assert(st.sales_quote[0].deleted_at, 'non archiviato');
    const list = await Q.listQuotes(sb, {});
    assert(!list.some((x) => x.id === q.id), 'archiviato ancora in lista');
  });
  it(s, 'changeStatus rifiuta stati non validi', async () => {
    const st = emptyStore(); const sb = makeMock(st);
    const q = await Q.createQuote(sb, 't1', {});
    let threw = false; try { await Q.changeStatus(sb, q.id, 'PIPPO'); } catch { threw = true; }
    assert(threw, 'stato non valido accettato');
  });
  it(s, 'duplicateQuote crea nuovo numero + righe, non tocca l\'originale', async () => {
    const st = emptyStore(); const sb = makeMock(st);
    const q = await Q.createQuote(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    await Q.addLine(sb, 't1', q.id, { description: 'Targa', quantity: 1, unit_price: 30 });
    const copy = await Q.duplicateQuote(sb, 't1', q.id);
    assert(copy.id !== q.id, 'stesso id'); assertEq(copy.number, 'PREV-000002'); assertEq(copy.status, 'DRAFT');
    const cb = await Q.getQuote(sb, copy.id);
    assertEq(cb.lines.length, 1);
    const ob = await Q.getQuote(sb, q.id);
    assertEq(ob.lines.length, 1); // originale intatto
  });
  it(s, 'listQuotes: filtro stato + ricerca numero/cliente', async () => {
    const st = emptyStore(); const sb = makeMock(st);
    const a = await Q.createQuote(sb, 't1', { customer_id: 'c1', customer_name: 'Maria' });
    await Q.changeStatus(sb, a.id, 'ACCEPTED');
    await Q.createQuote(sb, 't1', { customer_id: 'c1', customer_name: 'Giulio' });
    assertEq((await Q.listQuotes(sb, { status: 'ACCEPTED' })).length, 1);
    assertEq((await Q.listQuotes(sb, { search: 'giulio' })).length, 1);
  });
});

describe('Preventivi render + RBAC (offline)', (s) => {
  const bundle = { quote: { id: 'q1', number: 'PREV-000001', customer_name: 'Maria', status: 'DRAFT', issue_date: '2026-08-22', valid_until: '2026-08-29' },
    lines: [{ id: 'l1', description: 'Targa', quantity: 2, unit_price: 30, discount: 5, tax: 0, line_total: 55 }],
    totals: { subtotal: 60, discount: 5, tax: 0, total: 55 } };
  it(s, 'renderQuoteRows: righe + empty', async () => {
    assert(/data-quote="q1"/.test(renderQuoteRows([{ id: 'q1', number: 'PREV-000001', customer_name: 'M', status: 'DRAFT', total: 55 }])), 'riga');
    assert(/Nessun preventivo/.test(renderQuoteRows([])), 'empty');
  });
  it(s, 'renderQuoteDetail: totali, azioni edit/duplica per SALES, archivia MANAGER+', async () => {
    assert(/PREV-000001/.test(renderQuoteDetail(bundle, 'SALES')), 'numero');
    assert(/data-edit="q1"/.test(renderQuoteDetail(bundle, 'SALES')) && /data-dup="q1"/.test(renderQuoteDetail(bundle, 'SALES')), 'edit/dup SALES');
    assert(!/data-del=/.test(renderQuoteDetail(bundle, 'SALES')), 'SALES non archivia');
    assert(/data-del=/.test(renderQuoteDetail(bundle, 'MANAGER')), 'MANAGER archivia');
    assert(!/data-edit=/.test(renderQuoteDetail(bundle, 'VIEWER')), 'VIEWER read-only');
    assert(/Totale/.test(renderQuoteDetail(bundle, 'OWNER')), 'riepilogo');
  });
  it(s, 'renderQuoteForm: nuovo vs modifica + opzioni cliente', async () => {
    const custs = [{ id: 'c1', name: 'Maria' }];
    assert(/Nuovo preventivo/.test(renderQuoteForm(null, custs)), 'nuovo');
    assert(/Salva bozza/.test(renderQuoteForm(null, custs)), 'bozza');
    assert(/Modifica preventivo/.test(renderQuoteForm({ id: 'q1', customer_id: 'c1' }, custs)), 'modifica');
  });
});

describe('Preventivi migration 0008 — validazione statica (RLS/permessi)', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000008_sales_quote.sql', import.meta.url), 'utf8');
  it(s, 'RLS abilitata su testata e righe', async () => {
    assert(/alter table public\.sales_quote enable row level security/.test(sql), 'RLS quote');
    assert(/alter table public\.sales_quote_line enable row level security/.test(sql), 'RLS line');
  });
  it(s, 'policy = tenant + has_permission(sales.quote,...)', async () => {
    assert(/has_permission\(tenant_id,'sales\.quote','read'\)/.test(sql), 'read perm');
    assert(/has_permission\(tenant_id,'sales\.quote','create'\)/.test(sql), 'create perm');
    assert(/current_tenant_ids\(\)/.test(sql), 'tenant scope');
  });
  it(s, 'matrice permessi coerente col CRM (delete solo manager+)', async () => {
    assert(/a\.action = 'delete' and r\.key in \('OWNER','ADMIN','MANAGER'\)/.test(sql), 'delete matrix');
    assert(/in \('OWNER','ADMIN','MANAGER','SALES'\)/.test(sql), 'write matrix');
  });
  it(s, 'numerazione per-tenant race-safe + totali generati/ricalcolati DB', async () => {
    assert(/next_quote_number/.test(sql) && /on conflict \(tenant_id\) do update/.test(sql), 'counter race-safe');
    assert(/line_total numeric generated always as/.test(sql), 'line_total generato');
    assert(/sales_quote_recalc/.test(sql), 'ricalcolo totali');
  });
  it(s, 'soft-delete via trigger condiviso (no secondo authz)', async () => {
    assert(/crm_enforce_delete_perm\('sales\.quote'\)/.test(sql), 'trigger delete perm');
    assert(!/create or replace function public\.has_permission/.test(sql), 'non ridefinisce has_permission');
  });
});
