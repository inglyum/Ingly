// INGLY OS V2 — test Magazzino (movimenti + giacenza derivata), offline.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as WH from '../app-v2/src/warehouse.js';
import { renderInventoryRows, renderMovementRows } from '../app-v2/src/warehouse-ui.js';

function makeMock(store) {
  let uid = 0;
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
      single() { return Promise.resolve(run(st, 'single')); },
      maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(res, rej) { return Promise.resolve(run(st, 'many')).then(res, rej); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') { const row = { id: 'm' + (++uid), deleted_at: null, ...st.payload }; arr.push(row); return { data: row, error: null }; }
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => { const x = a[st.orderBy], y = b[st.orderBy]; if (x === y) return 0; return (x > y ? 1 : -1) * (st.asc ? 1 : -1); });
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

const store = () => ({ stock_movement: [], catalog_product: [
  { id: 'p1', tenant_id: 't1', name: 'Targa', sku: 'TRG', cost: 8, price: 30, active: true, deleted_at: null },
  { id: 'p2', tenant_id: 't1', name: 'QR', sku: 'QR', cost: 2, price: 20, active: true, deleted_at: null },
] });

describe('Magazzino data-layer (offline)', (s) => {
  it(s, 'movementDelta: IN+ OUT- ADJUST(signed) TRANSFER 0', async () => {
    assertEq(WH.movementDelta({ type: 'IN', quantity: 10 }), 10);
    assertEq(WH.movementDelta({ type: 'OUT', quantity: 4 }), -4);
    assertEq(WH.movementDelta({ type: 'ADJUST', quantity: -3 }), -3);
    assertEq(WH.movementDelta({ type: 'TRANSFER', quantity: 5 }), 0);
  });
  it(s, 'createMovement valida tipo/quantità', async () => {
    const st = store(); const sb = makeMock(st);
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 10 });
    assertEq(st.stock_movement.length, 1);
    let e1 = false; try { await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'OUT', quantity: -2 }); } catch { e1 = true; } assert(e1, 'quantità negativa OUT accettata');
    let e2 = false; try { await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 0 }); } catch { e2 = true; } assert(e2, 'quantità zero accettata');
    let e3 = false; try { await WH.createMovement(sb, 't1', { type: 'IN', quantity: 1 }); } catch { e3 = true; } assert(e3, 'senza prodotto accettato');
  });
  it(s, 'stockLevels somma i delta per prodotto', async () => {
    const st = store(); const sb = makeMock(st);
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 10 });
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'OUT', quantity: 3 });
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'ADJUST', quantity: -1 });
    await WH.createMovement(sb, 't1', { product_id: 'p2', type: 'IN', quantity: 5 });
    const lv = WH.stockLevels(await WH.listMovements(sb, {}));
    assertEq(lv.p1, 6); assertEq(lv.p2, 5);
  });
  it(s, 'loadInventory: giacenza + valore (qty*costo)', async () => {
    const st = store(); const sb = makeMock(st);
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 10 }); // 10*8=80
    await WH.createMovement(sb, 't1', { product_id: 'p2', type: 'IN', quantity: 5 });  // 5*2=10
    const inv = await WH.loadInventory(sb, {});
    assertEq(inv.totalUnits, 15); assertEq(inv.totalValue, 90); assertEq(inv.skuInStock, 2);
    const p1 = inv.rows.find((r) => r.id === 'p1'); assertEq(p1.qty, 10); assertEq(p1.value, 80);
  });
  it(s, 'voidMovement esclude dal calcolo', async () => {
    const st = store(); const sb = makeMock(st);
    const m = await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 10 });
    await WH.voidMovement(sb, m.id);
    const inv = await WH.loadInventory(sb, {});
    assertEq(inv.totalUnits, 0);
  });
  it(s, 'disponibile = giacenza - impegnato; in arrivo dagli acquisti aperti', async () => {
    const st = store(); const sb = makeMock(st);
    st.sales_order = [{ id: 'so1', tenant_id: 't1', status: 'CONFIRMED', deleted_at: null }];
    st.sales_order_line = [{ order_id: 'so1', product_id: 'p1', quantity: 4 }];
    st.purchase_order = [{ id: 'po1', tenant_id: 't1', status: 'ORDERED', deleted_at: null }];
    st.purchase_order_line = [{ purchase_order_id: 'po1', product_id: 'p1', quantity: 20 }];
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 10 });
    const inv = await WH.loadInventory(sb, {});
    const p1 = inv.rows.find((r) => r.id === 'p1');
    assertEq(p1.qty, 10); assertEq(p1.committed, 4); assertEq(p1.incoming, 20); assertEq(p1.available, 6);
  });
  it(s, 'sotto scorta + quantità da riordinare', async () => {
    const st = store(); const sb = makeMock(st);
    st.catalog_product[0].reorder_point = 20; st.catalog_product[0].reorder_qty = 0; // Targa
    await WH.createMovement(sb, 't1', { product_id: 'p1', type: 'IN', quantity: 5 }); // disp 5 < 20
    const inv = await WH.loadInventory(sb, {});
    const p1 = inv.rows.find((r) => r.id === 'p1');
    assert(p1.below, 'non marcato sotto scorta'); assertEq(p1.toReorder, 15); // 20-5
    assertEq(inv.belowCount, 1);
    const only = await WH.loadInventory(sb, { onlyBelow: true });
    assertEq(only.rows.length, 1);
  });
  it(s, 'reorderQtyFor: usa reorder_qty se impostata, altrimenti gap alla soglia', async () => {
    assertEq(WH.reorderQtyFor({ reorder_qty: 50, reorder_point: 20, available: 5 }), 50);
    assertEq(WH.reorderQtyFor({ reorder_qty: 0, reorder_point: 20, min_stock: 10, available: 8 }), 12);
    assertEq(WH.reorderQtyFor({ reorder_qty: 0, reorder_point: 5, available: 10 }), 0);
  });
});

describe('Magazzino render (offline)', (s) => {
  it(s, 'renderInventoryRows + empty + evidenza negativa', async () => {
    assert(/Targa/.test(renderInventoryRows([{ id: 'p1', name: 'Targa', sku: 'T', qty: 5, cost: 8, value: 40 }])), 'riga');
    assert(/Nessuna giacenza/.test(renderInventoryRows([])), 'empty');
    assert(/v2-row-warn/.test(renderInventoryRows([{ id: 'p1', name: 'X', qty: -2, cost: 1, value: -2 }])), 'negativo evidenziato');
  });
  it(s, 'renderMovementRows: tipo, delta segno, empty', async () => {
    const html = renderMovementRows([{ id: 'm1', product_id: 'p1', type: 'IN', quantity: 10, created_at: '2026-08-22' }], () => 'Targa');
    assert(/Carico/.test(html) && /\+10/.test(html) && /Targa/.test(html), 'movimento');
    assert(/Nessun movimento/.test(renderMovementRows([])), 'empty');
  });
});

describe('Magazzino migration 0015 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000015_stock_movement.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(inventory.movement) + delta generato + FK catalog', async () => {
    assert(/alter table public\.stock_movement enable row level security/.test(sql), 'RLS');
    assert(/has_permission\(tenant_id,'inventory\.movement','read'\)/.test(sql), 'read perm');
    assert(/delta numeric generated always as/.test(sql), 'delta generato');
    assert(/product_id uuid not null references public\.catalog_product\(id\)/.test(sql), 'FK catalog');
    assert(/crm_enforce_delete_perm\('inventory\.movement'\)/.test(sql), 'trigger delete');
  });
});
