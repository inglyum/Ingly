// INGLY OS V2 — Fornitori (data-layer Supabase). CRUD su supplier (RLS per
// tenant + permesso purchasing.supplier). Base del ciclo passivo (Acquisti).
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export async function listSuppliers(sb, opts = {}) {
  let q = sb.from('supplier').select('id,name,vat,email,phone,active').is('deleted_at', null);
  if (opts.search) { const s = esc(opts.search); q = q.or(`name.ilike.%${s}%,vat.ilike.%${s}%,email.ilike.%${s}%`); }
  const { data, error } = await q.order('name', { ascending: true }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}
export async function getSupplier(sb, id) {
  const { data, error } = await sb.from('supplier').select('*').eq('id', id).maybeSingle();
  if (error) throw error; return data || null;
}
export async function createSupplier(sb, tenantId, data) {
  const { data: out, error } = await sb.from('supplier').insert({ ...data, tenant_id: tenantId }).select().single();
  if (error) throw error; return out;
}
export async function updateSupplier(sb, id, patch) {
  const { data: out, error } = await sb.from('supplier').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return out;
}
export async function softDeleteSupplier(sb, id) {
  const { error } = await sb.from('supplier').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}
