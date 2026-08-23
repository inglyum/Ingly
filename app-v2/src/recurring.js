// INGLY OS V2 — Fatture ricorrenti (data-layer). Template di fatturazione
// periodica; alla scadenza genera una fattura REALE riusando invoices.js
// (numerazione fiscale, RLS). Nessuna logica di fatturazione duplicata.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { createInvoice, addLine } from './invoices.js';
export { friendlyError, canWrite, canDelete };

export const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'];
export const CADENCE_LABEL = { weekly: 'Settimanale', monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale' };

const iso = (d) => d.toISOString().slice(0, 10);

// Avanza una data secondo la cadenza (deterministico, UTC).
export function advanceDate(dateStr, cadence) {
  const d = new Date((dateStr || iso(new Date())) + 'T00:00:00Z');
  if (cadence === 'weekly') { d.setUTCDate(d.getUTCDate() + 7); return iso(d); }
  // Cadenze a mesi/anni: avanza il mese e, se il giorno di origine non esiste nel
  // mese target (es. 31 gen → feb), aggancia all'ultimo giorno del mese (no drift).
  const months = cadence === 'quarterly' ? 3 : cadence === 'yearly' ? 12 : 1;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return iso(d);
}

export async function listRecurring(sb, opts = {}) {
  let q = sb.from('recurring_invoice').select('*').is('deleted_at', null);
  if (opts.activeOnly) q = q.eq('active', true);
  const { data, error } = await q.order('next_run_date', { ascending: true }).limit(opts.limit || 300);
  if (error) throw error;
  return data || [];
}

export async function getRecurring(sb, id) {
  const { data, error } = await sb.from('recurring_invoice').select('*').eq('id', id).maybeSingle();
  if (error) throw error; return data || null;
}

const CLEAN = ['customer_id', 'customer_name', 'description', 'amount', 'vat_rate', 'cadence', 'next_run_date', 'active', 'notes'];
function sanitize(patch) {
  const out = {};
  for (const k of CLEAN) if (k in patch) out[k] = patch[k];
  if ('amount' in out) out.amount = Number(out.amount) || 0;
  if ('vat_rate' in out) out.vat_rate = Number(out.vat_rate) || 0;
  if ('cadence' in out && !CADENCES.includes(out.cadence)) out.cadence = 'monthly';
  return out;
}

export async function createRecurring(sb, tenantId, data) {
  const row = { tenant_id: tenantId, active: true, cadence: 'monthly', vat_rate: 22, next_run_date: iso(new Date()), ...sanitize(data || {}) };
  if (!row.description) throw new Error('Descrizione obbligatoria.');
  const { data: out, error } = await sb.from('recurring_invoice').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateRecurring(sb, id, patch) {
  const { data, error } = await sb.from('recurring_invoice').update({ ...sanitize(patch || {}), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return data;
}

export async function softDeleteRecurring(sb, id) {
  const { error } = await sb.from('recurring_invoice').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Template scaduti (attivi con next_run_date <= oggi).
export function dueList(rows, today = iso(new Date())) {
  return (rows || []).filter((r) => r.active && !r.deleted_at && String(r.next_run_date) <= today);
}

// Genera UNA fattura dal template e avanza next_run_date. Riusa invoices.js.
export async function generateOne(sb, tenantId, id) {
  const r = await getRecurring(sb, id);
  if (!r) throw new Error('template non trovato');
  if (!r.active) throw new Error('template non attivo');
  const invoice = await createInvoice(sb, tenantId, { customer_id: r.customer_id, customer_name: r.customer_name, notes: r.notes, status: 'ISSUED' });
  const amount = Number(r.amount) || 0; const tax = Math.round(amount * (Number(r.vat_rate) || 0)) / 100;
  await addLine(sb, tenantId, invoice.id, { description: r.description, quantity: 1, unit_price: amount, discount: 0, tax });
  await sb.from('recurring_invoice').update({
    next_run_date: advanceDate(r.next_run_date, r.cadence),
    last_generated_at: new Date().toISOString(), last_invoice_id: invoice.id, updated_at: new Date().toISOString(),
  }).eq('id', id);
  return invoice;
}

// Genera tutte le fatture scadute. Ritorna il numero di fatture emesse.
export async function generateDue(sb, tenantId) {
  const due = dueList(await listRecurring(sb, { activeOnly: true }));
  let count = 0;
  for (const r of due) { try { await generateOne(sb, tenantId, r.id); count++; } catch (_) { /* prosegue */ } }
  return count;
}
