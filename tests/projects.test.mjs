// INGLY OS V2 — test Progetti/Commesse (data-layer + economics + render), offline.
import { describe, it, assert, assertEq } from './harness.mjs';
import { readFileSync } from 'node:fs';
import * as PRJ from '../app-v2/src/projects.js';
import { renderProjectRows, renderProjectDetail, renderProjectForm } from '../app-v2/src/projects-ui.js';

function makeMock(store) {
  let uid = 0; const counters = {};
  function onInsert(table, row) {
    if (table === 'project') { const k = row.tenant_id; counters[k] = (counters[k] || 0) + 1; row.code = 'PRJ-' + String(counters[k]).padStart(6, '0'); row.status = row.status || 'PLANNED'; }
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
    if (st.op === 'insert') { const row = { id: 'id' + (++uid), ...st.payload }; onInsert(st.table, row); arr.push(row); return { data: row, error: null }; }
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

const store = () => ({ project: [], project_task: [], sales_order: [], purchase_order: [], crm_customer: [{ id: 'c1', tenant_id: 't1', name: 'Maria', deleted_at: null }] });

describe('Commesse data-layer (offline)', (s) => {
  it(s, 'createProject: codice PRJ per-tenant, stato PLANNED', async () => {
    const sb = makeMock(store());
    const a = await PRJ.createProject(sb, 't1', { name: 'Wedding', customer_id: 'c1', customer_name: 'Maria', budget: 2000 });
    const b = await PRJ.createProject(sb, 't1', { name: 'Fiera' });
    assertEq(a.code, 'PRJ-000001'); assertEq(b.code, 'PRJ-000002'); assertEq(a.status, 'PLANNED');
  });
  it(s, 'economics: ricavi (ordini) - costi (acquisti) = margine', async () => {
    const st = store(); const sb = makeMock(st);
    const p = await PRJ.createProject(sb, 't1', { name: 'X', budget: 1000 });
    st.sales_order.push({ id: 'so1', tenant_id: 't1', project_id: p.id, total: 900, status: 'CONFIRMED', deleted_at: null });
    st.sales_order.push({ id: 'so2', tenant_id: 't1', project_id: p.id, total: 100, status: 'CANCELLED', deleted_at: null });
    st.purchase_order.push({ id: 'po1', tenant_id: 't1', project_id: p.id, total: 300, status: 'ORDERED', deleted_at: null });
    const b = await PRJ.getProject(sb, p.id);
    assertEq(b.economics.revenue, 900); assertEq(b.economics.cost, 300);
    assertEq(b.economics.margin, 600); assertEq(b.economics.marginPct, 67);
  });
  it(s, 'task: add + avanzamento (DONE/total) + setStatus + delete', async () => {
    const st = store(); const sb = makeMock(st);
    const p = await PRJ.createProject(sb, 't1', { name: 'X' });
    const t1 = await PRJ.addTask(sb, 't1', p.id, { title: 'A' });
    await PRJ.addTask(sb, 't1', p.id, { title: 'B' });
    let b = await PRJ.getProject(sb, p.id); assertEq(b.progress, 0);
    await PRJ.setTaskStatus(sb, t1.id, 'DONE');
    b = await PRJ.getProject(sb, p.id); assertEq(b.progress, 50);
    await PRJ.deleteTask(sb, t1.id);
    b = await PRJ.getProject(sb, p.id); assertEq(b.tasks.length, 1);
  });
  it(s, 'changeStatus valido/invalido + archivio', async () => {
    const st = store(); const sb = makeMock(st);
    const p = await PRJ.createProject(sb, 't1', { name: 'X' });
    await PRJ.changeStatus(sb, p.id, 'ACTIVE'); assertEq(st.project[0].status, 'ACTIVE');
    let threw = false; try { await PRJ.changeStatus(sb, p.id, 'ZZ'); } catch { threw = true; } assert(threw, 'stato invalido');
    await PRJ.softDeleteProject(sb, p.id);
    assert(!(await PRJ.listProjects(sb, {})).some((x) => x.id === p.id), 'archiviata in lista');
  });
  it(s, 'taskProgress helper', async () => {
    assertEq(PRJ.taskProgress([]), 0);
    assertEq(PRJ.taskProgress([{ status: 'DONE' }, { status: 'TODO' }, { status: 'DONE' }, { status: 'DOING' }]), 50);
  });
});

describe('Commesse render + RBAC (offline)', (s) => {
  const bundle = { project: { id: 'p1', code: 'PRJ-000001', name: 'Wedding', customer_name: 'Maria', status: 'ACTIVE', due_date: '2026-09-15', budget: 2000 },
    tasks: [{ id: 't1', title: 'Sopralluogo', status: 'DONE' }, { id: 't2', title: 'Consegna', status: 'TODO' }],
    economics: { revenue: 900, cost: 300, margin: 600, marginPct: 67, budget: 2000 }, progress: 50 };
  it(s, 'renderProjectRows + empty', async () => {
    assert(/data-prj="p1"/.test(renderProjectRows([{ id: 'p1', code: 'PRJ-1', name: 'W', customer_name: 'M', status: 'ACTIVE', budget: 2000 }])), 'riga');
    assert(/Nessuna commessa/.test(renderProjectRows([])), 'empty');
  });
  it(s, 'renderProjectDetail: economics, avanzamento, edit SALES, archivia MANAGER+, VIEWER read-only', async () => {
    assert(/PRJ-000001/.test(renderProjectDetail(bundle, 'SALES')), 'codice');
    assert(/Margine/.test(renderProjectDetail(bundle, 'OWNER')) && /67%/.test(renderProjectDetail(bundle, 'OWNER')), 'economics');
    assert(/Avanzamento · 50%/.test(renderProjectDetail(bundle, 'OWNER')), 'avanzamento');
    assert(/data-edit="p1"/.test(renderProjectDetail(bundle, 'SALES')), 'edit SALES');
    assert(!/data-del=/.test(renderProjectDetail(bundle, 'SALES')), 'SALES non archivia');
    assert(/data-del=/.test(renderProjectDetail(bundle, 'MANAGER')), 'MANAGER archivia');
    assert(!/data-edit=/.test(renderProjectDetail(bundle, 'VIEWER')), 'VIEWER read-only');
  });
  it(s, 'renderProjectForm: nuovo vs modifica', async () => {
    assert(/Nuova commessa/.test(renderProjectForm(null, [{ id: 'c1', name: 'Maria' }])), 'nuovo');
    assert(/Modifica commessa/.test(renderProjectForm({ id: 'p1', name: 'W' }, [])), 'modifica');
  });
});

describe('Commesse migration 0017 — validazione statica', (s) => {
  const sql = readFileSync(new URL('../supabase/migrations/20260101000017_project.sql', import.meta.url), 'utf8');
  it(s, 'RLS + has_permission(project.project) + numerazione + FK + link ordini', async () => {
    assert(/alter table public\.project enable row level security/.test(sql), 'RLS project');
    assert(/alter table public\.project_task enable row level security/.test(sql), 'RLS task');
    assert(/has_permission\(tenant_id,'project\.project','read'\)/.test(sql), 'read perm');
    assert(/next_project_number/.test(sql), 'numerazione PRJ');
    assert(/customer_id uuid references public\.crm_customer\(id\)/.test(sql), 'FK cliente');
    assert(/alter table public\.sales_order add column if not exists project_id/.test(sql), 'link ordini');
    assert(/alter table public\.purchase_order add column if not exists project_id/.test(sql), 'link acquisti');
    assert(/crm_enforce_delete_perm\('project\.project'\)/.test(sql), 'trigger delete');
  });
});
