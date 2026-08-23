// INGLY OS V2 — Fatture (data-layer Supabase). Testata + righe su
// sales_invoice/sales_invoice_line (RLS per tenant + permesso sales.invoice).
// NUMERO fiscale (progressivo annuale) e TOTALI lato DB. Conversione
// Ordine → Fattura (snapshot righe, link order_id). Base per Pagamenti.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { computeTotals } from './quotes.js';
import { getOrder } from './orders.js';
export { friendlyError, canWrite, canDelete, computeTotals };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

// Stato pagamento derivato da total/paid_total (display); il DB resta autorevole.
export function paymentStatus(inv) {
  const total = Number(inv.total || 0); const paid = Number(inv.paid_total || 0);
  if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return inv.status;
  if (paid <= 0) return inv.status === 'OVERDUE' ? 'OVERDUE' : 'ISSUED';
  if (paid >= total && total > 0) return 'PAID';
  return 'PARTIALLY_PAID';
}
export function balanceDue(inv) {
  return Math.round((Number(inv.total || 0) - Number(inv.paid_total || 0)) * 100) / 100;
}

export async function listInvoices(sb, opts = {}) {
  let q = sb.from('sales_invoice')
    .select('id,number,customer_id,customer_name,status,issue_date,due_date,total,paid_total')
    .is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  if (opts.search) { const s = esc(opts.search); q = q.or(`number.ilike.%${s}%,customer_name.ilike.%${s}%`); }
  const { data, error } = await q.order('issue_date', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

export async function getInvoice(sb, id) {
  const { data: invoice, error } = await sb.from('sales_invoice').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('sales_invoice_line').select('*').eq('invoice_id', id).order('sort_order', { ascending: true });
  const rows = lines || [];
  return { invoice: invoice || null, lines: rows, totals: computeTotals(rows) };
}

export async function createInvoice(sb, tenantId, data = {}) {
  const row = {
    tenant_id: tenantId, customer_id: data.customer_id || null,
    order_id: data.order_id || null, customer_name: data.customer_name || null,
    notes: data.notes || null, status: data.status || 'DRAFT',
  };
  if (data.issue_date) row.issue_date = data.issue_date;
  if (data.due_date) row.due_date = data.due_date;
  const { data: out, error } = await sb.from('sales_invoice').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateInvoice(sb, id, patch) {
  const allowed = {};
  for (const k of ['customer_id', 'customer_name', 'notes', 'issue_date', 'due_date', 'status']) if (k in patch) allowed[k] = patch[k];
  allowed.updated_at = new Date().toISOString();
  const { data: out, error } = await sb.from('sales_invoice').update(allowed).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function changeStatus(sb, id, status) {
  if (!INVOICE_STATUSES.includes(status)) throw new Error('stato non valido');
  return updateInvoice(sb, id, { status });
}

export async function softDeleteInvoice(sb, id) {
  const { error } = await sb.from('sales_invoice').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export async function addLine(sb, tenantId, invoiceId, line) {
  const row = {
    tenant_id: tenantId, invoice_id: invoiceId, product_id: line.product_id || null,
    description: line.description || '', quantity: Number(line.quantity) || 0,
    unit_price: Number(line.unit_price) || 0, discount: Number(line.discount) || 0,
    tax: Number(line.tax) || 0, sort_order: Number(line.sort_order) || 0,
  };
  const { data: out, error } = await sb.from('sales_invoice_line').insert(row).select().single();
  if (error) throw error; return out;
}

export async function deleteLine(sb, id) {
  const { error } = await sb.from('sales_invoice_line').delete().eq('id', id);
  if (error) throw error; return true;
}

// Converte un ordine in fattura ISSUED: nuovo record (link order_id) + righe
// snapshot. NON modifica l'ordine originale.
export async function convertOrderToInvoice(sb, tenantId, orderId) {
  const { order, lines } = await getOrder(sb, orderId);
  if (!order) throw new Error('ordine non trovato');
  const invoice = await createInvoice(sb, tenantId, {
    customer_id: order.customer_id, customer_name: order.customer_name,
    order_id: order.id, notes: order.notes, status: 'ISSUED',
  });
  for (const l of lines) {
    await addLine(sb, tenantId, invoice.id, {
      product_id: l.product_id, description: l.description, quantity: l.quantity,
      unit_price: l.unit_price, discount: l.discount, tax: l.tax, sort_order: l.sort_order,
    });
  }
  return invoice;
}
