// INGLY OS V2 — test Ricerca globale (aggregazione cross-module + filtro).
import { describe, it, assert, assertEq } from './harness.mjs';
import * as SEARCH from '../app-v2/src/search.js';
import { renderResults } from '../app-v2/src/search-ui.js';

function makeMock(store) {
  function builder(table) {
    const st = { table, filters: [], orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(c, v) { st.filters.push((r) => r[c] === v || (v === null && r[c] == null)); return api; },
      eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return api; },
      or() { return api; }, // no-op: il filtro reale è client-side in search.js
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

const store = () => ({
  crm_customer: [
    { id: 'c1', tenant_id: 't1', name: 'Maria Rossi', type: 'B2C', email: 'maria@x.it', deleted_at: null },
    { id: 'c2', tenant_id: 't1', name: 'Chef Nino', type: 'B2B', email: 'nino@ristorante.it', deleted_at: null },
  ],
  catalog_product: [
    { id: 'p1', tenant_id: 't1', name: 'Targa Rossi Wedding', sku: 'TRG-1', price: 29.9, active: true, deleted_at: null },
    { id: 'p2', tenant_id: 't1', name: 'QR Menu', sku: 'QR-1', price: 19.9, active: true, deleted_at: null },
  ],
  sales_quote: [{ id: 'q1', tenant_id: 't1', number: 'PREV-000001', customer_name: 'Maria Rossi', total: 100, status: 'SENT', deleted_at: null }],
  sales_order: [{ id: 'o1', tenant_id: 't1', number: 'ORD-000001', customer_name: 'Chef Nino', total: 19.9, status: 'CONFIRMED', deleted_at: null }],
  sales_invoice: [{ id: 'i1', tenant_id: 't1', number: 'FATT-2026-000001', customer_name: 'Maria Rossi', total: 122, status: 'ISSUED', deleted_at: null }],
  supplier: [{ id: 's1', tenant_id: 't1', name: 'Legnami Belice', vat: 'IT01112223330', email: 'ordini@legni.it', active: true, deleted_at: null }],
  shipment: [{ id: 'sh1', tenant_id: 't1', number: 'SPED-000001', customer_name: 'Chef Nino', tracking: 'TRK-ROSSI', status: 'PREPARING', deleted_at: null }],
});

describe('Ricerca globale', (s) => {
  it(s, 'query troppo corta → tooShort, nessun gruppo', async () => {
    const sb = makeMock(store());
    const r = await SEARCH.globalSearch(sb, 'a');
    assert(r.tooShort, 'attesa tooShort');
    assertEq(r.total, 0);
  });

  it(s, '“rossi” trova cliente, prodotto, preventivo, fattura, tracking spedizione', async () => {
    const sb = makeMock(store());
    const r = await SEARCH.globalSearch(sb, 'rossi');
    const types = r.groups.map((g) => g.type);
    assert(types.includes('customer'), 'cliente');
    assert(types.includes('product'), 'prodotto (Targa Rossi Wedding)');
    assert(types.includes('quote'), 'preventivo (Maria Rossi)');
    assert(types.includes('invoice'), 'fattura (Maria Rossi)');
    assert(types.includes('shipment'), 'spedizione (tracking TRK-ROSSI)');
    // NON deve comparire l\'ordine (Chef Nino) né il fornitore
    assert(!types.includes('order'), 'ordine non deve matchare rossi');
    assert(!types.includes('supplier'), 'fornitore non deve matchare rossi');
  });

  it(s, 'match per numero documento', async () => {
    const sb = makeMock(store());
    const r = await SEARCH.globalSearch(sb, 'FATT-2026');
    assertEq(r.groups.length, 1);
    assertEq(r.groups[0].type, 'invoice');
    assertEq(r.groups[0].items[0].route, 'invoices');
  });

  it(s, 'match per SKU prodotto', async () => {
    const sb = makeMock(store());
    const r = await SEARCH.globalSearch(sb, 'qr-1');
    assertEq(r.groups[0].type, 'product');
    assertEq(r.groups[0].items[0].label, 'QR Menu');
  });

  it(s, 'nessun risultato → total 0, non tooShort', async () => {
    const sb = makeMock(store());
    const r = await SEARCH.globalSearch(sb, 'zzzznulla');
    assert(!r.tooShort, 'non tooShort');
    assertEq(r.total, 0);
  });

  it(s, 'ogni item ha route valida verso il modulo', async () => {
    const sb = makeMock(store());
    const r = await SEARCH.globalSearch(sb, 'nino');
    const routes = new Set(['clients', 'catalog', 'quotes', 'gestione_ordini', 'invoices', 'suppliers', 'logistics']);
    for (const g of r.groups) for (const it of g.items) assert(routes.has(it.route), 'route ' + it.route + ' valida');
  });
});

describe('Ricerca globale render', (s) => {
  it(s, 'renderResults: tooShort / vuoto / con gruppi', async () => {
    assert(/almeno/.test(renderResults({ tooShort: true, groups: [], total: 0 })), 'hint tooShort');
    assert(/Nessun risultato/.test(renderResults({ tooShort: false, groups: [], total: 0, query: 'x' })), 'vuoto');
    const html = renderResults({ tooShort: false, total: 1, query: 'q', groups: [{ type: 'customer', icon: '👥', label: 'Clienti', route: 'clients', items: [{ id: 'c1', label: 'Maria Rossi', sublabel: 'B2C', route: 'clients' }] }] });
    assert(/data-route="clients"/.test(html) && /Maria Rossi/.test(html), 'item cliente');
  });
});
