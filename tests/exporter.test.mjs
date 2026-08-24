// INGLY OS V2 — test Backup / Export / Portabilità (aggregazione + CSV).
import { describe, it, assert, assertEq } from './harness.mjs';
import * as EXP from '../app-v2/src/exporter.js';

function makeMock(store) {
  function builder(table) {
    const api = {
      select() { return api; }, is() { return api; }, eq() { return api; }, or() { return api; }, order() { return api; }, limit() { return api; },
      then(res, rej) { return Promise.resolve({ data: store[table] || [], error: null }).then(res, rej); },
    };
    return api;
  }
  return { from: (t) => builder(t) };
}

describe('Export — buildBackup', (s) => {
  it(s, 'aggrega tutte le entità con conteggi', async () => {
    const store = {
      crm_customer: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
      catalog_product: [{ id: 'p1', name: 'X' }],
      sales_invoice: [{ id: 'i1', number: 'F1' }],
    };
    const b = await EXP.buildBackup(makeMock(store));
    assertEq(b.version, 1);
    assert(b.generatedAt, 'timestamp presente');
    assertEq(b.counts.crm_customer, 2);
    assertEq(b.counts.catalog_product, 1);
    assertEq(b.counts.sales_invoice, 1);
    assertEq(b.counts.supplier, 0); // tabella vuota comunque presente
    assertEq(b.tables.crm_customer.length, 2);
  });
  it(s, 'errore su una tabella non blocca il backup', async () => {
    const sb = { from: () => ({ select() { throw new Error('boom'); } }) };
    const b = await EXP.buildBackup(sb);
    assertEq(b.counts.crm_customer, 0); // fallback a []
  });
});

describe('Export — toCSV', (s) => {
  it(s, 'header dalle chiavi + quoting RFC-4180', async () => {
    const csv = EXP.toCSV([{ a: 1, b: 'x,y' }, { a: 2, b: 'con "virgolette"' }]);
    const lines = csv.split('\n');
    assertEq(lines[0], 'a,b');
    assertEq(lines[1], '1,"x,y"');
    assertEq(lines[2], '2,"con ""virgolette"""');
  });
  it(s, 'righe vuote → stringa vuota', async () => {
    assertEq(EXP.toCSV([]), '');
  });
  it(s, 'oggetti annidati serializzati in JSON', async () => {
    const csv = EXP.toCSV([{ a: { x: 1 } }]);
    assert(/\{""x"":1\}/.test(csv), 'oggetto serializzato e quotato: ' + csv);
  });
  it(s, 'colonne unione di tutte le chiavi', async () => {
    const csv = EXP.toCSV([{ a: 1 }, { b: 2 }]);
    assertEq(csv.split('\n')[0], 'a,b');
  });
});

describe('Export — exportTableCSV', (s) => {
  it(s, 'ritorna csv + conteggio', async () => {
    const r = await EXP.exportTableCSV(makeMock({ supplier: [{ id: 's1', name: 'Forn' }] }), 'supplier');
    assertEq(r.count, 1); assert(/Forn/.test(r.csv), 'contenuto');
  });
});
