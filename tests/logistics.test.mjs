// INGLY OS V2 — test Logistica/Spedizioni (workflow + scarico stock + consegna).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as LOG from '../app-v2/src/logistics.js';
import * as WH from '../app-v2/src/warehouse.js';
import { renderShipmentRows, renderShipmentDetail } from '../app-v2/src/logistics-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {};
  function onInsert(table, row) { if (table === 'shipment') { const k = row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'SPED-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'PREPARING'; } }
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or() { return api; },
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
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), deleted_at: null, ...st.payload }; onInsert(st.table, row); arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { const rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    if (st.op === 'delete') { const rem = arr.filter((r) => st.filters.every((f) => f(r))); rem.forEach((r) => arr.splice(arr.indexOf(r), 1)); return { data: null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

// Ordine di vendita aperto con 2 righe; magazzino con giacenza iniziale.
const store = () => ({
  shipment: [], shipment_line: [],
  sales_order: [{ id: 'o1', tenant_id: 't1', number: 'ORD-1', customer_id: 'c1', customer_name: 'Rossi', status: 'CONFIRMED', notes: null, deleted_at: null }],
  sales_order_line: [
    { id: 'ol1', order_id: 'o1', product_id: 'pA', description: 'Targa', quantity: 3, sort_order: 0 },
    { id: 'ol2', order_id: 'o1', product_id: 'pB', description: 'Nastro', quantity: 5, sort_order: 1 },
  ],
  stock_movement: [
    { id: 'm1', tenant_id: 't1', product_id: 'pA', type: 'IN', quantity: 10, deleted_at: null, created_at: '2026-01-01' },
    { id: 'm2', tenant_id: 't1', product_id: 'pB', type: 'IN', quantity: 2, deleted_at: null, created_at: '2026-01-01' },
  ],
});

describe('Logistica data-layer', (s) => {
  it(s, 'createShipmentFromOrder: SPED numero, PREPARING, righe con qty_prepared=ordinato', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    assertEq(sh.number, 'SPED-000001'); assertEq(sh.status, 'PREPARING');
    assertEq(st.shipment_line.length, 2);
    assertEq(st.shipment_line[0].qty_prepared, 3);
    assertEq(st.shipment_line[0].qty_ordered, 3);
  });

  it(s, 'avanzamento stato PREPARING→PICKED→PACKED', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    await LOG.setStatus(sb, sh.id, LOG.NEXT_STATUS['PREPARING']);
    assertEq(st.shipment[0].status, 'PICKED');
    await LOG.setStatus(sb, sh.id, LOG.NEXT_STATUS['PICKED']);
    assertEq(st.shipment[0].status, 'PACKED');
  });

  it(s, 'ship: scarica stock (OUT) e passa a SHIPPED', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    // riduco la riga pB a 2 (giacenza pB = 2) per non incorrere in NOSTOCK
    const lineB = st.shipment_line.find((l) => l.product_id === 'pB');
    await LOG.setLinePrepared(sb, lineB.id, 2);
    const out = await LOG.ship(sb, 't1', sh.id, { carrier: 'BRT', tracking: 'TRK1' });
    assertEq(out.status, 'SHIPPED'); assertEq(out.carrier, 'BRT'); assertEq(out.tracking, 'TRK1');
    const lv = WH.stockLevels(st.stock_movement);
    assertEq(lv.pA, 7); // 10 - 3
    assertEq(lv.pB, 0); // 2 - 2
    assert(st.stock_movement.some((m) => m.reference_type === 'shipment' && m.type === 'OUT'), 'movimento OUT spedizione');
    assertEq(st.shipment_line.find((l) => l.product_id === 'pA').qty_shipped, 3);
  });

  it(s, 'ship: guard NOSTOCK se giacenza < preparato', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    // pB preparato = 5 ma giacenza pB = 2 → NOSTOCK
    let err = null; try { await LOG.ship(sb, 't1', sh.id, {}); } catch (e) { err = e; }
    assert(err && err.code === 'NOSTOCK', 'atteso NOSTOCK');
    // nessuno scarico effettuato
    assert(!st.stock_movement.some((m) => m.reference_type === 'shipment'), 'nessun movimento se guard scatta');
    assertEq(st.shipment[0].status, 'PREPARING');
  });

  it(s, 'ship due volte → errore (già evasa)', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    const lineB = st.shipment_line.find((l) => l.product_id === 'pB');
    await LOG.setLinePrepared(sb, lineB.id, 2);
    await LOG.ship(sb, 't1', sh.id, {});
    let threw = false; try { await LOG.ship(sb, 't1', sh.id, {}); } catch { threw = true; }
    assert(threw, 'doppia spedizione non bloccata');
  });

  it(s, 'deliver: DELIVERED + qty_delivered + ordine aggiornato; nessun nuovo movimento', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    const lineB = st.shipment_line.find((l) => l.product_id === 'pB');
    await LOG.setLinePrepared(sb, lineB.id, 2);
    await LOG.ship(sb, 't1', sh.id, {});
    const movsAfterShip = st.stock_movement.length;
    const out = await LOG.deliver(sb, sh.id);
    assertEq(out.status, 'DELIVERED');
    assertEq(st.shipment_line.find((l) => l.product_id === 'pA').qty_delivered, 3);
    assertEq(st.sales_order[0].status, 'DELIVERED');
    assertEq(st.stock_movement.length, movsAfterShip); // consegna non muove stock
  });

  it(s, 'deliver prima della spedizione → errore', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    let threw = false; try { await LOG.deliver(sb, sh.id); } catch { threw = true; }
    assert(threw, 'consegna senza spedizione non bloccata');
  });

  it(s, 'availabilityFor: giacenza - impegnato', async () => {
    const st = store(); const sb = makeMock(st);
    // pA: giacenza 10, impegnato dall\'ordine aperto o1 = 3 → disp 7
    const av = await LOG.availabilityFor(sb, ['pA', 'pB']);
    assertEq(av.pA, 7); assertEq(av.pB, -3); // pB giacenza 2 - impegnato 5
  });

  it(s, 'softDeleteShipment: sparisce dalla lista', async () => {
    const st = store(); const sb = makeMock(st);
    const sh = await LOG.createShipmentFromOrder(sb, 't1', 'o1');
    await LOG.softDeleteShipment(sb, sh.id);
    assert(!(await LOG.listShipments(sb, {})).some((x) => x.id === sh.id), 'archiviata via lista');
  });
});

describe('Logistica render', (s) => {
  it(s, 'renderShipmentRows + empty', async () => {
    assert(/data-ship="s1"/.test(renderShipmentRows([{ id: 's1', number: 'SPED-1', customer_name: 'Rossi', status: 'PREPARING' }])), 'riga');
    assert(/Nessuna spedizione/.test(renderShipmentRows([])), 'empty');
  });
  it(s, 'renderShipmentDetail: bottone Spedisci solo PACKED + RBAC archivia', async () => {
    const b = { shipment: { id: 's1', number: 'SPED-1', customer_name: 'Rossi', status: 'PACKED' }, lines: [{ id: 'l1', product_id: 'pA', description: 'Targa', qty_ordered: 3, qty_prepared: 3, qty_shipped: 0 }] };
    assert(/data-ship="s1"/.test(renderShipmentDetail(b, 'SALES', { pA: 7 })), 'spedisci per SALES su PACKED');
    assert(!/data-del=/.test(renderShipmentDetail(b, 'SALES', {})), 'SALES non archivia');
    assert(/data-del=/.test(renderShipmentDetail(b, 'MANAGER', {})), 'MANAGER archivia');
    assert(!/data-ship=/.test(renderShipmentDetail({ shipment: { ...b.shipment, status: 'PREPARING' }, lines: b.lines }, 'OWNER', {})), 'niente spedisci se non PACKED');
  });
  it(s, 'renderShipmentDetail: flag ⚠️ se preparato > disponibile', async () => {
    const b = { shipment: { id: 's1', number: 'SPED-1', status: 'PACKED' }, lines: [{ id: 'l1', product_id: 'pB', description: 'Nastro', qty_ordered: 5, qty_prepared: 5, qty_shipped: 0 }] };
    assert(/v2-row-warn/.test(renderShipmentDetail(b, 'OWNER', { pB: 2 })), 'riga in warning');
  });
});

describe('Logistica migration 0020 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000020_shipment.sql', import.meta.url), 'utf8');
  it(s, 'tabelle + RLS + has_permission(logistics.shipment) + numerazione + FK', async () => {
    assert(/create table if not exists public\.shipment\b/.test(sql), 'tabella shipment');
    assert(/create table if not exists public\.shipment_line\b/.test(sql), 'tabella shipment_line');
    assert(/has_permission\(tenant_id,'logistics\.shipment','read'\)/.test(sql), 'read perm');
    assert(/next_shipment_number/.test(sql), 'numerazione SPED');
    assert(/order_id uuid references public\.sales_order\(id\)/.test(sql), 'FK ordine');
    assert(/crm_enforce_delete_perm\('logistics\.shipment'\)/.test(sql), 'trigger delete');
  });
});
