// INGLY OS V2 — Attrezzature / Macchine (data-layer). Anagrafica con tariffe
// reali (€/min) che alimentano lo Smart Quoter. Deterministico, RLS/RBAC.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function listEquipment(sb, opts = {}) {
  let q = sb.from('equipment').select('*').is('deleted_at', null);
  if (opts.activeOnly) q = q.eq('active', true);
  const { data, error } = await q.order('name', { ascending: true }).limit(opts.limit || 500);
  if (error) throw error;
  return data || [];
}

const CLEAN = ['name', 'category', 'cost_per_min', 'hourly_cost', 'power_w', 'active', 'notes'];
function sanitize(patch) {
  const out = {};
  for (const k of CLEAN) if (k in patch) out[k] = patch[k];
  if ('cost_per_min' in out) out.cost_per_min = Math.max(0, Number(out.cost_per_min) || 0);
  if ('hourly_cost' in out) out.hourly_cost = out.hourly_cost === '' || out.hourly_cost == null ? null : Math.max(0, Number(out.hourly_cost) || 0);
  if ('power_w' in out) out.power_w = out.power_w === '' || out.power_w == null ? null : Math.max(0, Number(out.power_w) || 0);
  if ('active' in out) out.active = !!out.active;
  return out;
}

// €/min derivato: usa cost_per_min; se assente ma c'è €/h → h/60.
export function costPerMin(eq) {
  if (!eq) return 0;
  if (Number(eq.cost_per_min) > 0) return r2(eq.cost_per_min);
  if (Number(eq.hourly_cost) > 0) return r2(Number(eq.hourly_cost) / 60);
  return 0;
}

export async function createEquipment(sb, tenantId, data) {
  const row = { tenant_id: tenantId, active: true, cost_per_min: 0, ...sanitize(data || {}) };
  if (!row.name) throw new Error('Nome obbligatorio.');
  const { data: out, error } = await sb.from('equipment').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateEquipment(sb, id, patch) {
  const { data, error } = await sb.from('equipment').update({ ...sanitize(patch || {}), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return data;
}

export async function softDeleteEquipment(sb, id) {
  const { error } = await sb.from('equipment').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}
