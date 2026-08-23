// INGLY OS V2 — Ordini (data-layer Supabase). Testata + righe su
// sales_order/sales_order_line (RLS per tenant + permesso sales.order).
// NUMERO e TOTALI lato DB (trigger + colonna generata). Include la conversione
// Preventivo → Ordine (snapshot righe, link quote_id). Base per Fattura/Pagamento.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { computeTotals } from './quotes.js';
import { getQuote } from './quotes.js';
export { friendlyError, canWrite, canDelete, computeTotals };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export const ORDER_STATUSES = ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED'];

export async function listOrders(sb, opts = {}) {
  let q = sb.from('sales_order')
    .select('id,number,customer_id,customer_name,status,order_date,total')
    .is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  if (opts.search) { const s = esc(opts.search); q = q.or(`number.ilike.%${s}%,customer_name.ilike.%${s}%`); }
  const { data, error } = await q.order('order_date', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

export async function getOrder(sb, id) {
  const { data: order, error } = await sb.from('sales_order').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('sales_order_line').select('*').eq('order_id', id).order('sort_order', { ascending: true });
  const rows = lines || [];
  return { order: order || null, lines: rows, totals: computeTotals(rows) };
}

export async function createOrder(sb, tenantId, data = {}) {
  const row = {
    tenant_id: tenantId, customer_id: data.customer_id || null,
    quote_id: data.quote_id || null, customer_name: data.customer_name || null,
    notes: data.notes || null, status: 'CONFIRMED',
  };
  if (data.order_date) row.order_date = data.order_date;
  const { data: out, error } = await sb.from('sales_order').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateOrder(sb, id, patch) {
  const allowed = {};
  for (const k of ['customer_id', 'customer_name', 'notes', 'order_date', 'status']) if (k in patch) allowed[k] = patch[k];
  allowed.updated_at = new Date().toISOString();
  const { data: out, error } = await sb.from('sales_order').update(allowed).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function changeStatus(sb, id, status) {
  if (!ORDER_STATUSES.includes(status)) throw new Error('stato non valido');
  return updateOrder(sb, id, { status });
}

export async function softDeleteOrder(sb, id) {
  const { error } = await sb.from('sales_order').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export async function addLine(sb, tenantId, orderId, line) {
  const row = {
    tenant_id: tenantId, order_id: orderId, product_id: line.product_id || null,
    description: line.description || '', quantity: Number(line.quantity) || 0,
    unit_price: Number(line.unit_price) || 0, discount: Number(line.discount) || 0,
    tax: Number(line.tax) || 0, sort_order: Number(line.sort_order) || 0,
  };
  const { data: out, error } = await sb.from('sales_order_line').insert(row).select().single();
  if (error) throw error; return out;
}

export async function deleteLine(sb, id) {
  const { error } = await sb.from('sales_order_line').delete().eq('id', id);
  if (error) throw error; return true;
}

// Converte un preventivo in ordine: nuovo record ordine (link quote_id) + righe
// copiate come snapshot. NON modifica il preventivo originale.
export async function convertQuoteToOrder(sb, tenantId, quoteId) {
  const { quote, lines } = await getQuote(sb, quoteId);
  if (!quote) throw new Error('preventivo non trovato');
  const order = await createOrder(sb, tenantId, {
    customer_id: quote.customer_id, customer_name: quote.customer_name,
    quote_id: quote.id, notes: quote.notes,
  });
  for (const l of lines) {
    await addLine(sb, tenantId, order.id, {
      product_id: l.product_id, description: l.description, quantity: l.quantity,
      unit_price: l.unit_price, discount: l.discount, tax: l.tax, sort_order: l.sort_order,
    });
  }
  return order;
}
