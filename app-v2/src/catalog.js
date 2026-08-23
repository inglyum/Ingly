// INGLY OS V2 — Catalogo prodotti/servizi (data-layer Supabase).
// Query reali su catalog_product (RLS per tenant + permesso). tenant_id forzato
// in scrittura. Riusa friendlyError/canWrite/canDelete del CRM (stessa matrice).
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export async function listProducts(sb, opts = {}) {
  let q = sb.from('catalog_product')
    .select('id,sku,name,category,kind,price,cost,unit,active,image_url,min_stock,reorder_point,reorder_qty').is('deleted_at', null);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.search) { const s = esc(opts.search); q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`); }
  const { data, error } = await q.order('name', { ascending: true }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

export async function getProduct(sb, id) {
  const { data, error } = await sb.from('catalog_product').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createProduct(sb, tenantId, data) {
  const { data: out, error } = await sb.from('catalog_product')
    .insert({ ...data, tenant_id: tenantId }).select().single();
  if (error) throw error; return out;
}

export async function updateProduct(sb, id, patch) {
  const { data: out, error } = await sb.from('catalog_product')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function softDeleteProduct(sb, id) {
  const { error } = await sb.from('catalog_product').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export const PRODUCT_KINDS = ['product', 'service'];

// Margine assoluto = prezzo - costo (mai NaN).
export function marginValue(p) {
  const price = Number(p.price) || 0; const cost = Number(p.cost) || 0;
  const m = price - cost;
  return Number.isFinite(m) ? Math.round(m * 100) / 100 : 0;
}
// Margine % = (prezzo-costo)/prezzo*100. Mai NaN/Infinity: 0 se prezzo ≤ 0.
export function marginPercent(p) {
  const price = Number(p.price) || 0; const cost = Number(p.cost) || 0;
  if (!(price > 0)) return 0;
  const pct = ((price - cost) / price) * 100;
  return Number.isFinite(pct) ? Math.round(pct) : 0;
}
// Compat: margine % (usato altrove).
export function margin(p) { return marginPercent(p); }
