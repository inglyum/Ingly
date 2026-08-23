// INGLY OS V2 — test Produzione (BOM + ordini + completamento→magazzino).
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as PRD from '../app-v2/src/production.js';
import * as WH from '../app-v2/src/warehouse.js';
import { renderPOrderRows, renderPOrderDetail, renderBomRows } from '../app-v2/src/production-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {};
  function onInsert(table, row) { if (table === 'production_order') { const k = row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.number = 'PRD-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'PLANNED'; } }
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
    if (st.op === 'update') { let rows = arr.filter((r) => st.filters.every((f) => f(r))); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows[0] || null, error: null }; }
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

const store = () => ({
  production_bom: [], production_bom_line: [], production_order: [], stock_movement: [],
  catalog_product: [
    { id: 'fin', tenant_id: 't1', name: 'Kit Wedding', cost: 0, price: 100, active: true, deleted_at: null },
    { id: 'cmpA', tenant_id: 't1', name: 'Targa', cost: 8, price: 30, active: true, deleted_at: null },
    { id: 'cmpB', tenant_id: 't1', name: 'Nastro', cost: 1, price: 3, active: true, deleted_at: null },
  ],
});

describe('Produzione data-layer', (s) => {
  it(s, 'BOM: create + addLine + getBom', async () => {
    const st = store(); const sb = makeMock(st);
    const bom = await PRD.createBom(sb, 't1', { product_id: 'fin', name: 'BOM Kit' });
    await PRD.addBomLine(sb, 't1', bom.id, { component_product_id: 'cmpA', quantity: 2 });
    await PRD.addBomLine(sb, 't1', bom.id, { component_product_id: 'cmpB', quantity: 5 });
    const b = await PRD.getBom(sb, bom.id);
    assertEq(b.lines.length, 2);
    assertEq(await PRD.bomForProduct(sb, 'fin'), bom.id);
  });
  it(s, 'ordine produzione: numero PRD, stato PLANNED', async () => {
    const st = store(); const sb = makeMock(st);
    const o = await PRD.createProductionOrder(sb, 't1', { product_id: 'fin', quantity: 3 });
    assertEq(o.number, 'PRD-000001'); assertEq(o.status, 'PLANNED');
  });
  it(s, 'completeProduction: consuma componenti (OUT) e carica finito (IN)', async () => {
    const st = store(); const sb = makeMock(st);
    const bom = await PRD.createBom(sb, 't1', { product_id: 'fin', name: 'BOM Kit' });
    await PRD.addBomLine(sb, 't1', bom.id, { component_product_id: 'cmpA', quantity: 2 });
    await PRD.addBomLine(sb, 't1', bom.id, { component_product_id: 'cmpB', quantity: 5 });
    const o = await PRD.createProductionOrder(sb, 't1', { product_id: 'fin', quantity: 3, bom_id: bom.id });
    const r = await PRD.completeProduction(sb, 't1', o.id);
    assertEq(r.consumed, 2); assertEq(r.produced, 3);
    assertEq(st.production_order[0].status, 'DONE');
    // giacenze: cmpA -6, cmpB -15, fin +3
    const lv = WH.stockLevels(st.stock_movement);
    assertEq(lv.cmpA, -6); assertEq(lv.cmpB, -15); assertEq(lv.fin, 3);
  });
  it(s, 'completeProduction due volte → errore (già completato)', async () => {
    const st = store(); const sb = makeMock(st);
    const o = await PRD.createProductionOrder(sb, 't1', { product_id: 'fin', quantity: 1 });
    await PRD.completeProduction(sb, 't1', o.id);
    let threw = false; try { await PRD.completeProduction(sb, 't1', o.id); } catch { threw = true; }
    assert(threw, 'doppio completamento non bloccato');
  });
  it(s, 'changeStatus valido/invalido + archivio', async () => {
    const st = store(); const sb = makeMock(st);
    const o = await PRD.createProductionOrder(sb, 't1', { product_id: 'fin', quantity: 1 });
    await PRD.changeStatus(sb, o.id, 'IN_PROGRESS'); assertEq(st.production_order[0].status, 'IN_PROGRESS');
    let threw = false; try { await PRD.changeStatus(sb, o.id, 'ZZ'); } catch { threw = true; } assert(threw, 'stato invalido');
    await PRD.softDeleteProductionOrder(sb, o.id);
    assert(!(await PRD.listProductionOrders(sb, {})).some((x) => x.id === o.id), 'archiviato in lista');
  });
});

describe('Produzione render', (s) => {
  const pn = (id) => ({ fin: 'Kit', cmpA: 'Targa' }[id] || id);
  it(s, 'renderPOrderRows + empty', async () => {
    assert(/data-po="o1"/.test(renderPOrderRows([{ id: 'o1', number: 'PRD-1', product_id: 'fin', quantity: 3, status: 'PLANNED' }], pn)), 'riga');
    assert(/Nessun ordine di produzione/.test(renderPOrderRows([], pn)), 'empty');
  });
  it(s, 'renderPOrderDetail: bottone Completa se non DONE; RBAC', async () => {
    const b = { order: { id: 'o1', number: 'PRD-1', product_id: 'fin', quantity: 3, status: 'PLANNED', bom_id: 'b1' }, components: [{ component_product_id: 'cmpA', quantity: 2 }] };
    assert(/data-complete="o1"/.test(renderPOrderDetail(b, 'SALES', pn)), 'completa per SALES');
    assert(!/data-del=/.test(renderPOrderDetail(b, 'SALES', pn)), 'SALES non archivia');
    assert(/data-del=/.test(renderPOrderDetail(b, 'MANAGER', pn)), 'MANAGER archivia');
    assert(!/data-complete/.test(renderPOrderDetail({ order: { ...b.order, status: 'DONE' }, components: [] }, 'OWNER', pn)), 'niente completa se DONE');
  });
  it(s, 'renderBomRows + empty', async () => {
    assert(/data-bom="b1"/.test(renderBomRows([{ id: 'b1', name: 'BOM', product_id: 'fin', active: true }], pn)), 'riga');
    assert(/Nessuna distinta/.test(renderBomRows([], pn)), 'empty');
  });
});

describe('Produzione migration 0019 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000019_production.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(production.order) + FK catalog + numerazione', async () => {
    assert(/create table if not exists public\.production_bom\b/.test(sql), 'tabella BOM');
    assert(/create table if not exists public\.production_order\b/.test(sql), 'tabella ordine');
    assert(/has_permission\(tenant_id,'production\.order','read'\)/.test(sql), 'read perm');
    assert(/next_production_number/.test(sql), 'numerazione PRD');
    assert(/component_product_id uuid not null references public\.catalog_product\(id\)/.test(sql), 'FK componente');
    assert(/crm_enforce_delete_perm\('production\.order'\)/.test(sql), 'trigger delete');
  });
});
