// INGLY OS V2 — test CRM data-layer + render + RBAC (offline, mock Supabase).
// Verifica: query corrette (tabella/filtri/tenant_id), search ilike, create/update
// con tenant forzato, soft-delete, render righe/dettaglio, gate RBAC.
import { describe, it, assert, assertEq } from './harness.mjs';
import * as CRM from '../app-v2/src/crm.js';
import { renderCustomerRows, renderCustomerDetail, renderForm } from '../app-v2/src/crm-ui.js';

// ── Mock Supabase (test double del subset usato da crm.js) ──────────────────
function makeMock(store) {
  let uid = 100;
  function builder(table) {
    const st = { table, filters: [], op: 'select', payload: null, orderBy: null, asc: true, lim: null };
    const api = {
      select() { return api; },
      is(col, val) { st.filters.push((r) => r[col] === val || (val === null && r[col] == null)); return api; },
      eq(col, val) { st.filters.push((r) => String(r[col]) === String(val)); return api; },
      or(expr) {
        // "name.ilike.%q%,email.ilike.%q%"
        const parts = expr.split(',').map((p) => {
          const m = p.match(/^(\w+)\.ilike\.%(.*)%$/); return m ? { col: m[1], q: m[2].toLowerCase() } : null;
        }).filter(Boolean);
        st.filters.push((r) => parts.some((p) => String(r[p.col] || '').toLowerCase().includes(p.q)));
        return api;
      },
      order(col, o) { st.orderBy = col; st.asc = !o || o.ascending; return api; },
      limit(n) { st.lim = n; return api; },
      insert(row) { st.op = 'insert'; st.payload = row; return api; },
      update(row) { st.op = 'update'; st.payload = row; return api; },
      single() { return Promise.resolve(run(st, 'single')); },
      maybeSingle() { return Promise.resolve(run(st, 'maybe')); },
      then(resolve, reject) { return Promise.resolve(run(st, 'many')).then(resolve, reject); },
    };
    return api;
  }
  function run(st, mode) {
    const arr = store[st.table] || (store[st.table] = []);
    if (st.op === 'insert') {
      const row = { id: 'id' + (++uid), ...st.payload };
      arr.push(row); return { data: row, error: null };
    }
    if (st.op === 'update') {
      let rows = arr.filter((r) => st.filters.every((f) => f(r)));
      rows.forEach((r) => Object.assign(r, st.payload));
      return { data: rows[0] || null, error: null };
    }
    let rows = arr.filter((r) => st.filters.every((f) => f(r)));
    if (st.orderBy) rows = rows.slice().sort((a, b) => (a[st.orderBy] > b[st.orderBy] ? 1 : -1) * (st.asc ? 1 : -1));
    if (st.lim) rows = rows.slice(0, st.lim);
    if (mode === 'single') return { data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } };
    if (mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  return { from: (t) => builder(t) };
}

describe('CRM data-layer (mock Supabase, offline)', (s) => {
  function seedStore() {
    return {
      crm_customer: [
        { id: 'c1', tenant_id: 't1', name: 'Mario Rossi', email: 'mario@x.it', segment: 'Wedding', type: 'B2C', value_cached: 120, deleted_at: null },
        { id: 'c2', tenant_id: 't1', name: 'Azienda Blu', email: 'info@blu.it', segment: 'B2B', type: 'B2B', value_cached: 900, deleted_at: null },
        { id: 'c3', tenant_id: 't1', name: 'Nascosto', email: 'x@x.it', type: 'B2C', value_cached: 0, deleted_at: '2026-01-01' },
      ],
      crm_contact: [{ id: 'k1', tenant_id: 't1', customer_id: 'c1', name: 'Ref 1' }],
      crm_activity: [{ id: 'a1', tenant_id: 't1', customer_id: 'c1', type: 'note', body: 'chiamare', occurred_at: '2026-02-01' }],
      crm_company: [{ id: 'co1', tenant_id: 't1', name: 'Azienda Blu', deleted_at: null }],
    };
  }

  it(s, 'listCustomers esclude i soft-deleted', async () => {
    const sb = makeMock(seedStore());
    const list = await CRM.listCustomers(sb, {});
    assertEq(list.length, 2);
    assert(!list.some((c) => c.id === 'c3'), 'soft-deleted incluso');
  });
  it(s, 'listCustomers: ricerca ilike su nome/email', async () => {
    const sb = makeMock(seedStore());
    const r1 = await CRM.listCustomers(sb, { search: 'mario' });
    assertEq(r1.length, 1); assertEq(r1[0].id, 'c1');
    const r2 = await CRM.listCustomers(sb, { search: 'blu.it' });
    assertEq(r2.length, 1); assertEq(r2[0].id, 'c2');
  });
  it(s, 'listCustomers: filtro type', async () => {
    const sb = makeMock(seedStore());
    const r = await CRM.listCustomers(sb, { type: 'B2B' });
    assertEq(r.length, 1); assertEq(r[0].id, 'c2');
  });
  it(s, 'createCustomer forza tenant_id', async () => {
    const store = seedStore(); const sb = makeMock(store);
    const out = await CRM.createCustomer(sb, 't1', { name: 'Nuovo', type: 'B2C' });
    assertEq(out.tenant_id, 't1'); assert(out.id, 'no id');
    assertEq(store.crm_customer.length, 4);
  });
  it(s, 'updateCustomer aggiorna e imposta updated_at', async () => {
    const store = seedStore(); const sb = makeMock(store);
    const out = await CRM.updateCustomer(sb, 'c1', { name: 'Mario Bianchi' });
    assertEq(out.name, 'Mario Bianchi'); assert(out.updated_at, 'no updated_at');
  });
  it(s, 'softDeleteCustomer imposta deleted_at (no hard delete)', async () => {
    const store = seedStore(); const sb = makeMock(store);
    await CRM.softDeleteCustomer(sb, 'c1');
    const c1 = store.crm_customer.find((c) => c.id === 'c1');
    assert(c1.deleted_at, 'deleted_at non impostato');
  });
  it(s, 'getCustomer restituisce cliente + contatti + attività', async () => {
    const sb = makeMock(seedStore());
    const b = await CRM.getCustomer(sb, 'c1');
    assertEq(b.customer.id, 'c1'); assertEq(b.contacts.length, 1); assertEq(b.activities.length, 1);
  });
  it(s, 'addContact/addActivity forzano tenant+customer', async () => {
    const store = seedStore(); const sb = makeMock(store);
    const k = await CRM.addContact(sb, 't1', 'c2', { name: 'Ref B' });
    assertEq(k.tenant_id, 't1'); assertEq(k.customer_id, 'c2');
    const a = await CRM.addActivity(sb, 't1', 'c2', { type: 'call', body: 'ok' });
    assertEq(a.customer_id, 'c2');
  });
});

describe('CRM render + RBAC (offline)', (s) => {
  it(s, 'renderCustomerRows: righe reali con valore formattato', async () => {
    const html = renderCustomerRows([{ id: 'c1', name: 'Mario', email: 'm@x.it', phone: '333', segment: 'W', type: 'B2C', value_cached: 120 }]);
    assert(/data-cust="c1"/.test(html), 'riga senza id'); assert(/Mario/.test(html), 'nome mancante'); assert(/€\s?120|€120/.test(html), 'valore mancante');
  });
  it(s, 'renderCustomerRows: stato vuoto onesto', async () => {
    assert(/Nessun cliente/.test(renderCustomerRows([])), 'empty state mancante');
  });
  it(s, 'renderCustomerDetail mostra contatti/attività e bottone Modifica solo se write', async () => {
    const b = { customer: { id: 'c1', name: 'Mario', type: 'B2C', value_cached: 0 }, contacts: [{ name: 'Ref' }], activities: [{ type: 'note', body: 'x', occurred_at: '2026-01-01' }] };
    assert(/data-edit="c1"/.test(renderCustomerDetail(b, 'SALES')), 'edit assente per SALES');
    assert(!/data-edit=/.test(renderCustomerDetail(b, 'VIEWER')), 'edit presente per VIEWER');
  });
  it(s, 'RBAC: SALES/MANAGER/ADMIN/OWNER scrivono; VIEWER no; delete solo MANAGER+', async () => {
    ['OWNER', 'ADMIN', 'MANAGER', 'SALES'].forEach((r) => assert(CRM.canWrite(r), r + ' dovrebbe scrivere'));
    ['VIEWER', 'PRODUCTION', 'WAREHOUSE', 'FINANCE', 'DESIGNER'].forEach((r) => assert(!CRM.canWrite(r), r + ' non deve scrivere'));
    assert(CRM.canDelete('MANAGER') && !CRM.canDelete('SALES'), 'delete RBAC errato');
  });
  it(s, 'renderForm: nuovo vs modifica', async () => {
    assert(/Nuovo cliente/.test(renderForm('SALES')), 'form nuovo');
    assert(/Modifica cliente/.test(renderForm('SALES', { id: 'c1', name: 'Mario' })), 'form modifica');
  });
});

describe('CRM company/contact CRUD + errori (mock, offline)', (s) => {
  function store() {
    return { crm_company: [{ id: 'co1', tenant_id: 't1', name: 'Blu', deleted_at: null }],
      crm_contact: [{ id: 'k1', tenant_id: 't1', customer_id: 'c1', name: 'Ref', deleted_at: null }],
      crm_customer: [], crm_activity: [] };
  }
  it(s, 'createCompany forza tenant_id', async () => {
    const st = store(); const sb = makeMock(st);
    const out = await CRM.createCompany(sb, 't1', { name: 'Rossa' });
    assertEq(out.tenant_id, 't1'); assertEq(st.crm_company.length, 2);
  });
  it(s, 'updateCompany + softDeleteCompany', async () => {
    const st = store(); const sb = makeMock(st);
    const u = await CRM.updateCompany(sb, 'co1', { name: 'Blu2' }); assertEq(u.name, 'Blu2');
    await CRM.softDeleteCompany(sb, 'co1');
    assert(st.crm_company.find((x) => x.id === 'co1').deleted_at, 'company non soft-deleted');
  });
  it(s, 'listCompanies esclude soft-deleted', async () => {
    const st = store(); st.crm_company.push({ id: 'co2', tenant_id: 't1', name: 'X', deleted_at: '2026-01-01' });
    const sb = makeMock(st); const list = await CRM.listCompanies(sb, {});
    assert(!list.some((c) => c.id === 'co2'), 'soft-deleted incluso');
  });
  it(s, 'updateContact + softDeleteContact', async () => {
    const st = store(); const sb = makeMock(st);
    await CRM.updateContact(sb, 'k1', { role: 'Buyer' });
    assertEq(st.crm_contact.find((x) => x.id === 'k1').role, 'Buyer');
    await CRM.softDeleteContact(sb, 'k1');
    assert(st.crm_contact.find((x) => x.id === 'k1').deleted_at, 'contact non soft-deleted');
  });
  it(s, 'friendlyError traduce permission denied / RLS senza dettagli SQL', async () => {
    assertEq(CRM.friendlyError({ message: 'new row violates row-level security policy' }), 'Non hai i permessi necessari per questa operazione.');
    assertEq(CRM.friendlyError({ code: '42501', message: 'permission denied: delete' }), 'Non hai i permessi necessari per questa operazione.');
    assert(!/SQL|row-level|42501/i.test(CRM.friendlyError({ message: 'boom' })), 'errore generico espone dettagli');
  });
});
