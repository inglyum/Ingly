// INGLY OS V2 — Costi fissi (data-layer). Costi ricorrenti strutturali
// normalizzati al mese per burn, costo annuo e break-even. Deterministico.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

export const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'];
export const CADENCE_LABEL = { weekly: 'Settimanale', monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale' };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Normalizza un importo alla base mensile secondo la cadenza.
export function monthlyAmount(amount, cadence) {
  const a = Number(amount) || 0;
  if (cadence === 'weekly') return r2(a * 52 / 12);
  if (cadence === 'quarterly') return r2(a / 3);
  if (cadence === 'yearly') return r2(a / 12);
  return r2(a); // monthly
}

export async function listFixedCosts(sb, opts = {}) {
  let q = sb.from('fixed_cost').select('*').is('deleted_at', null);
  if (opts.activeOnly) q = q.eq('active', true);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 300);
  if (error) throw error;
  return data || [];
}

const CLEAN = ['name', 'category', 'amount', 'cadence', 'active', 'notes'];
function sanitize(patch) {
  const out = {};
  for (const k of CLEAN) if (k in patch) out[k] = patch[k];
  if ('amount' in out) out.amount = Math.max(0, Number(out.amount) || 0);
  if ('cadence' in out && !CADENCES.includes(out.cadence)) out.cadence = 'monthly';
  if ('active' in out) out.active = !!out.active;
  return out;
}

export async function createFixedCost(sb, tenantId, data) {
  const row = { tenant_id: tenantId, active: true, cadence: 'monthly', ...sanitize(data || {}) };
  if (!row.name) throw new Error('Nome obbligatorio.');
  const { data: out, error } = await sb.from('fixed_cost').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateFixedCost(sb, id, patch) {
  const { data, error } = await sb.from('fixed_cost').update({ ...sanitize(patch || {}), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return data;
}

export async function softDeleteFixedCost(sb, id) {
  const { error } = await sb.from('fixed_cost').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Riepilogo: burn mensile/annuo (solo attivi), per categoria, break-even a un
// dato ticket medio (numero ordini/mese per coprire i costi fissi).
export function summarize(rows, avgTicket) {
  const active = (rows || []).filter((r) => r.active && !r.deleted_at);
  let monthly = 0; const byCat = {};
  for (const r of active) { const m = monthlyAmount(r.amount, r.cadence); monthly += m; const c = r.category || 'Altro'; byCat[c] = r2((byCat[c] || 0) + m); }
  monthly = r2(monthly);
  const t = Number(avgTicket) || 0;
  return {
    monthlyBurn: monthly, annualBurn: r2(monthly * 12), count: active.length,
    byCategory: Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    breakEvenOrders: t > 0 ? Math.ceil(monthly / t) : null,
  };
}
