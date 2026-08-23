// INGLY OS V2 — Produzione (data-layer Supabase). Distinte base (BOM) + ordini
// di produzione. Al completamento: consuma i componenti (movimenti OUT) e carica
// il prodotto finito (movimento IN) a magazzino. RLS production.order.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }
export const PRODUCTION_STATUSES = ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

// ── BOM (distinte base) ─────────────────────────────────────────────────────
export async function listBoms(sb, opts = {}) {
  let q = sb.from('production_bom').select('id,product_id,name,active').is('deleted_at', null);
  if (opts.search) { const s = esc(opts.search); q = q.or(`name.ilike.%${s}%`); }
  const { data, error } = await q.order('name', { ascending: true }).limit(opts.limit || 200);
  if (error) throw error; return data || [];
}
export async function getBom(sb, id) {
  const { data: bom, error } = await sb.from('production_bom').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('production_bom_line').select('*').eq('bom_id', id).order('sort_order', { ascending: true });
  return { bom: bom || null, lines: lines || [] };
}
export async function createBom(sb, tenantId, data) {
  const row = { tenant_id: tenantId, product_id: data.product_id, name: data.name, notes: data.notes || null, active: data.active !== false };
  if (!row.product_id) throw new Error('Seleziona il prodotto finito.');
  if (!row.name) throw new Error('Nome distinta obbligatorio.');
  const { data: out, error } = await sb.from('production_bom').insert(row).select().single();
  if (error) throw error; return out;
}
export async function addBomLine(sb, tenantId, bomId, data) {
  const row = { tenant_id: tenantId, bom_id: bomId, component_product_id: data.component_product_id, quantity: Number(data.quantity) || 1, sort_order: Number(data.sort_order) || 0 };
  if (!row.component_product_id) throw new Error('Seleziona un componente.');
  const { data: out, error } = await sb.from('production_bom_line').insert(row).select().single();
  if (error) throw error; return out;
}
export async function deleteBomLine(sb, id) { const { error } = await sb.from('production_bom_line').delete().eq('id', id); if (error) throw error; return true; }
export async function softDeleteBom(sb, id) { const { error } = await sb.from('production_bom').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw error; return true; }

// Trova la BOM attiva per un prodotto finito (per l'ordine di produzione).
export async function bomForProduct(sb, productId) {
  const { data } = await sb.from('production_bom').select('id').eq('product_id', productId).is('deleted_at', null).limit(1);
  return (data && data[0] && data[0].id) || null;
}

// ── Ordini di produzione ────────────────────────────────────────────────────
export async function listProductionOrders(sb, opts = {}) {
  let q = sb.from('production_order').select('id,number,product_id,quantity,status,start_date,due_date,bom_id').is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error; return data || [];
}
export async function getProductionOrder(sb, id) {
  const { data: order, error } = await sb.from('production_order').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  let components = [];
  if (order && order.bom_id) { const { data: lines } = await sb.from('production_bom_line').select('*').eq('bom_id', order.bom_id).order('sort_order', { ascending: true }); components = lines || []; }
  return { order: order || null, components };
}
export async function createProductionOrder(sb, tenantId, data) {
  const row = { tenant_id: tenantId, product_id: data.product_id, bom_id: data.bom_id || null, quantity: Number(data.quantity) || 1, status: 'PLANNED', notes: data.notes || null };
  if (!row.product_id) throw new Error('Seleziona il prodotto da produrre.');
  if (data.start_date) row.start_date = data.start_date;
  if (data.due_date) row.due_date = data.due_date;
  const { data: out, error } = await sb.from('production_order').insert(row).select().single();
  if (error) throw error; return out;
}
export async function changeStatus(sb, id, status) {
  if (!PRODUCTION_STATUSES.includes(status)) throw new Error('stato non valido');
  const { data: out, error } = await sb.from('production_order').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return out;
}
export async function softDeleteProductionOrder(sb, id) { const { error } = await sb.from('production_order').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw error; return true; }

// COMPLETAMENTO: consuma componenti (OUT) e carica prodotto finito (IN) a
// magazzino, poi stato DONE. Integrazione Produzione → Magazzino.
export async function completeProduction(sb, tenantId, id) {
  const { order, components } = await getProductionOrder(sb, id);
  if (!order) throw new Error('ordine di produzione non trovato');
  if (order.status === 'DONE') throw new Error('ordine già completato');
  const qty = Number(order.quantity) || 0;
  let consumed = 0;
  for (const c of components) {
    const amt = (Number(c.quantity) || 0) * qty;
    if (amt <= 0) continue;
    const { error } = await sb.from('stock_movement').insert({ tenant_id: tenantId, product_id: c.component_product_id, type: 'OUT', quantity: amt, location: 'MAIN', reference_type: 'production', reference_id: id, note: 'Consumo ' + (order.number || '') });
    if (error) throw error; consumed += 1;
  }
  // carico prodotto finito
  const { error: e2 } = await sb.from('stock_movement').insert({ tenant_id: tenantId, product_id: order.product_id, type: 'IN', quantity: qty, location: 'MAIN', reference_type: 'production', reference_id: id, note: 'Produzione ' + (order.number || '') });
  if (e2) throw e2;
  await changeStatus(sb, id, 'DONE');
  return { consumed, produced: qty };
}
