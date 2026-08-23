// INGLY OS V2 — Progetti/Commesse (data-layer Supabase). Commessa collegata a
// cliente; ricavi/costi/margine DERIVATI dagli ordini di vendita/acquisto
// collegati (project_id). Task con avanzamento. RLS project.project.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
export const TASK_STATUSES = ['TODO', 'DOING', 'DONE'];

export async function listProjects(sb, opts = {}) {
  let q = sb.from('project').select('id,code,name,customer_name,status,start_date,due_date,budget').is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  if (opts.search) { const s = esc(opts.search); q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%,customer_name.ilike.%${s}%`); }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

// Bundle commessa: testata + task + economics (ricavi/costi/margine) derivati.
export async function getProject(sb, id) {
  const { data: project, error } = await sb.from('project').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: tasks } = await sb.from('project_task').select('*').eq('project_id', id).order('sort_order', { ascending: true });
  const rows = tasks || [];
  let revenue = 0, cost = 0;
  try {
    const { data: so } = await sb.from('sales_order').select('total,status').eq('project_id', id).is('deleted_at', null);
    revenue = r2((so || []).filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + Number(o.total || 0), 0));
  } catch (_) { /* ordini vendita non disponibili */ }
  try {
    const { data: po } = await sb.from('purchase_order').select('total,status').eq('project_id', id).is('deleted_at', null);
    cost = r2((po || []).filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + Number(o.total || 0), 0));
  } catch (_) { /* acquisti non disponibili */ }
  const economics = { revenue, cost, margin: r2(revenue - cost), marginPct: revenue > 0 ? Math.round((revenue - cost) / revenue * 100) : 0, budget: Number((project && project.budget) || 0) };
  return { project: project || null, tasks: rows, economics, progress: taskProgress(rows) };
}

export function taskProgress(tasks) {
  if (!tasks || !tasks.length) return 0;
  const done = tasks.filter((t) => t.status === 'DONE').length;
  return Math.round((done / tasks.length) * 100);
}

export async function createProject(sb, tenantId, data = {}) {
  const row = {
    tenant_id: tenantId, customer_id: data.customer_id || null, customer_name: data.customer_name || null,
    name: data.name, notes: data.notes || null, status: data.status || 'PLANNED',
    budget: Number(data.budget) || 0,
  };
  if (!row.name) throw new Error('Il nome è obbligatorio.');
  if (data.start_date) row.start_date = data.start_date;
  if (data.due_date) row.due_date = data.due_date;
  const { data: out, error } = await sb.from('project').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateProject(sb, id, patch) {
  const allowed = {};
  for (const k of ['customer_id', 'customer_name', 'name', 'notes', 'status', 'budget', 'start_date', 'due_date']) if (k in patch) allowed[k] = patch[k];
  if ('budget' in allowed) allowed.budget = Number(allowed.budget) || 0;
  allowed.updated_at = new Date().toISOString();
  const { data: out, error } = await sb.from('project').update(allowed).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function changeStatus(sb, id, status) {
  if (!PROJECT_STATUSES.includes(status)) throw new Error('stato non valido');
  return updateProject(sb, id, { status });
}

export async function softDeleteProject(sb, id) {
  const { error } = await sb.from('project').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export async function addTask(sb, tenantId, projectId, data) {
  const row = {
    tenant_id: tenantId, project_id: projectId, title: data.title || '',
    status: data.status || 'TODO', assignee: data.assignee || null,
    estimated_hours: Number(data.estimated_hours) || 0, sort_order: Number(data.sort_order) || 0,
  };
  if (data.due_date) row.due_date = data.due_date;
  if (!row.title) throw new Error('Titolo attività obbligatorio.');
  const { data: out, error } = await sb.from('project_task').insert(row).select().single();
  if (error) throw error; return out;
}

export async function setTaskStatus(sb, id, status) {
  if (!TASK_STATUSES.includes(status)) throw new Error('stato task non valido');
  const { data: out, error } = await sb.from('project_task').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function deleteTask(sb, id) {
  const { error } = await sb.from('project_task').delete().eq('id', id);
  if (error) throw error; return true;
}
