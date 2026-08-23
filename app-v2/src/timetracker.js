// INGLY OS V2 — Time Tracker (data-layer). Registra ore di lavoro (fatturabili
// e non), opzionalmente su commessa. Aggregazioni deterministiche; alimenta il
// KPI "ore fatturabili" (KB ≥15h/settimana). Nessuna logica business alterata.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);

export async function listEntries(sb, opts = {}) {
  let q = sb.from('time_entry').select('*').is('deleted_at', null);
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  const { data, error } = await q.order('entry_date', { ascending: false }).limit(opts.limit || 500);
  if (error) throw error;
  return data || [];
}

const CLEAN = ['project_id', 'description', 'entry_date', 'minutes', 'billable', 'hourly_rate'];
function sanitize(patch) {
  const out = {};
  for (const k of CLEAN) if (k in patch) out[k] = patch[k];
  if ('minutes' in out) out.minutes = Math.max(0, Math.round(Number(out.minutes) || 0));
  if ('hourly_rate' in out) out.hourly_rate = Math.max(0, Number(out.hourly_rate) || 0);
  if ('billable' in out) out.billable = !!out.billable;
  if ('project_id' in out && !out.project_id) out.project_id = null;
  return out;
}

export async function createEntry(sb, tenantId, data) {
  const row = { tenant_id: tenantId, entry_date: iso(new Date()), minutes: 0, billable: true, hourly_rate: 18, ...sanitize(data || {}) };
  if (!row.description) throw new Error('Descrizione obbligatoria.');
  const { data: out, error } = await sb.from('time_entry').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateEntry(sb, id, patch) {
  const { data, error } = await sb.from('time_entry').update({ ...sanitize(patch || {}), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return data;
}

export async function softDeleteEntry(sb, id) {
  const { error } = await sb.from('time_entry').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Ore fatturabili (in ore) in un intervallo [from,to] inclusi.
export function billableHours(entries, from, to) {
  const min = (entries || []).filter((e) => e.billable && (!from || String(e.entry_date) >= from) && (!to || String(e.entry_date) <= to))
    .reduce((s, e) => s + (Number(e.minutes) || 0), 0);
  return r2(min / 60);
}

// Riepilogo: ore totali/fatturabili, valore fatturabile (min/60*rate).
export function summarize(entries) {
  let totalMin = 0, billMin = 0, value = 0;
  for (const e of entries || []) {
    const m = Number(e.minutes) || 0; totalMin += m;
    if (e.billable) { billMin += m; value += (m / 60) * (Number(e.hourly_rate) || 0); }
  }
  return { totalHours: r2(totalMin / 60), billableHours: r2(billMin / 60), nonBillableHours: r2((totalMin - billMin) / 60), billableValue: r2(value), count: (entries || []).length };
}
