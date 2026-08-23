// INGLY OS V2 — Acquisti (data-layer Supabase). Ordini di acquisto su
// purchase_order/purchase_order_line (RLS per tenant + permesso purchasing.order).
// NUMERO e TOTALI lato DB. Righe con snapshot prodotto, collegamento fornitore.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { computeTotals } from './quotes.js';
export { friendlyError, canWrite, canDelete, computeTotals };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export const PURCHASE_STATUSES = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];

export async function listPurchases(sb, opts = {}) {
  let q = sb.from('purchase_order')
    .select('id,number,supplier_id,supplier_name,status,order_date,expected_date,total')
    .is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.supplierId) q = q.eq('supplier_id', opts.supplierId);
  if (opts.search) { const s = esc(opts.search); q = q.or(`number.ilike.%${s}%,supplier_name.ilike.%${s}%`); }
  const { data, error } = await q.order('order_date', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

export async function getPurchase(sb, id) {
  const { data: order, error } = await sb.from('purchase_order').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('purchase_order_line').select('*').eq('purchase_order_id', id).order('sort_order', { ascending: true });
  const rows = lines || [];
  return { order: order || null, lines: rows, totals: computeTotals(rows) };
}

export async function createPurchase(sb, tenantId, data = {}) {
  const row = {
    tenant_id: tenantId, supplier_id: data.supplier_id || null,
    supplier_name: data.supplier_name || null, notes: data.notes || null, status: 'DRAFT',
  };
  if (data.order_date) row.order_date = data.order_date;
  if (data.expected_date) row.expected_date = data.expected_date;
  const { data: out, error } = await sb.from('purchase_order').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updatePurchase(sb, id, patch) {
  const allowed = {};
  for (const k of ['supplier_id', 'supplier_name', 'notes', 'order_date', 'expected_date', 'status']) if (k in patch) allowed[k] = patch[k];
  allowed.updated_at = new Date().toISOString();
  const { data: out, error } = await sb.from('purchase_order').update(allowed).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function changeStatus(sb, id, status) {
  if (!PURCHASE_STATUSES.includes(status)) throw new Error('stato non valido');
  return updatePurchase(sb, id, { status });
}

export async function softDeletePurchase(sb, id) {
  const { error } = await sb.from('purchase_order').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export async function addLine(sb, tenantId, poId, line) {
  const row = {
    tenant_id: tenantId, purchase_order_id: poId, product_id: line.product_id || null,
    description: line.description || '', quantity: Number(line.quantity) || 0,
    unit_price: Number(line.unit_price) || 0, discount: Number(line.discount) || 0,
    tax: Number(line.tax) || 0, sort_order: Number(line.sort_order) || 0,
  };
  const { data: out, error } = await sb.from('purchase_order_line').insert(row).select().single();
  if (error) throw error; return out;
}

export async function deleteLine(sb, id) {
  const { error } = await sb.from('purchase_order_line').delete().eq('id', id);
  if (error) throw error; return true;
}

// RICEZIONE MERCE: carica a magazzino le righe dell'ordine (movimenti IN,
// reference all'ordine di acquisto) e porta lo stato a RECEIVED. Integra il
// ciclo passivo Acquisti → Magazzino. Righe senza prodotto (product_id null)
// vengono ignorate (servizi/spese non a stock).
export async function receivePurchase(sb, tenantId, poId) {
  const { order, lines } = await getPurchase(sb, poId);
  if (!order) throw new Error('ordine di acquisto non trovato');
  let received = 0;
  for (const l of lines) {
    if (!l.product_id || Number(l.quantity) <= 0) continue;
    const { error } = await sb.from('stock_movement').insert({
      tenant_id: tenantId, product_id: l.product_id, type: 'IN',
      quantity: Number(l.quantity), location: 'MAIN',
      reference_type: 'purchase', reference_id: poId,
      note: 'Ricezione ' + (order.number || ''),
    });
    if (error) throw error;
    received += 1;
  }
  await updatePurchase(sb, poId, { status: 'RECEIVED' });
  return { received };
}
