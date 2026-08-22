// INGLY OS V2 — Preventivi (data-layer Supabase). Testata + righe su
// sales_quote/sales_quote_line (RLS per tenant + permesso sales.quote).
// NUMERO, VALID_UNTIL e TOTALI sono assegnati/calcolati LATO DB (trigger +
// colonna generata): il client non li invia mai. computeTotals serve solo per
// il display ottimistico; la fonte di verità resta il DB.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];

// Totale deterministico per display (identico alla logica DB: riga = q*prezzo
// - sconto + imposta; testata = somma delle righe).
export function computeTotals(lines) {
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  let subtotal = 0, discount = 0, tax = 0, total = 0;
  for (const l of lines || []) {
    const net = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
    subtotal += net; discount += Number(l.discount) || 0; tax += Number(l.tax) || 0;
    total += r2(net - (Number(l.discount) || 0) + (Number(l.tax) || 0));
  }
  return { subtotal: r2(subtotal), discount: r2(discount), tax: r2(tax), total: r2(total) };
}

export async function listQuotes(sb, opts = {}) {
  let q = sb.from('sales_quote')
    .select('id,number,customer_id,customer_name,status,issue_date,valid_until,total')
    .is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  if (opts.search) { const s = esc(opts.search); q = q.or(`number.ilike.%${s}%,customer_name.ilike.%${s}%`); }
  const { data, error } = await q.order('issue_date', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

export async function getQuote(sb, id) {
  const { data: quote, error } = await sb.from('sales_quote').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('sales_quote_line').select('*').eq('quote_id', id).order('sort_order', { ascending: true });
  const rows = lines || [];
  // fallback display se il DB non ha ancora propagato (o mock senza trigger)
  const totals = computeTotals(rows);
  return { quote: quote || null, lines: rows, totals };
}

// Crea la testata (DRAFT). NON invia number/valid_until/totali: li mette il DB.
export async function createQuote(sb, tenantId, data = {}) {
  const row = {
    tenant_id: tenantId,
    customer_id: data.customer_id || null,
    customer_name: data.customer_name || null,
    notes: data.notes || null,
    status: 'DRAFT',
  };
  if (data.issue_date) row.issue_date = data.issue_date;
  const { data: out, error } = await sb.from('sales_quote').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateQuote(sb, id, patch) {
  const allowed = {};
  for (const k of ['customer_id', 'customer_name', 'notes', 'valid_until', 'issue_date', 'status']) {
    if (k in patch) allowed[k] = patch[k];
  }
  allowed.updated_at = new Date().toISOString();
  const { data: out, error } = await sb.from('sales_quote').update(allowed).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function changeStatus(sb, id, status) {
  if (!QUOTE_STATUSES.includes(status)) throw new Error('stato non valido');
  return updateQuote(sb, id, { status });
}

export async function softDeleteQuote(sb, id) {
  const { error } = await sb.from('sales_quote').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Righe: line_total è colonna generata dal DB → non inviare line_total.
export async function addLine(sb, tenantId, quoteId, line) {
  const row = {
    tenant_id: tenantId, quote_id: quoteId,
    product_id: line.product_id || null,
    description: line.description || '',
    quantity: Number(line.quantity) || 0,
    unit_price: Number(line.unit_price) || 0,
    discount: Number(line.discount) || 0,
    tax: Number(line.tax) || 0,
    sort_order: Number(line.sort_order) || 0,
  };
  const { data: out, error } = await sb.from('sales_quote_line').insert(row).select().single();
  if (error) throw error; return out;
}

export async function updateLine(sb, id, patch) {
  const allowed = {};
  for (const k of ['description', 'quantity', 'unit_price', 'discount', 'tax', 'sort_order', 'product_id']) {
    if (k in patch) allowed[k] = patch[k];
  }
  allowed.updated_at = new Date().toISOString();
  const { data: out, error } = await sb.from('sales_quote_line').update(allowed).eq('id', id).select().single();
  if (error) throw error; return out;
}

export async function deleteLine(sb, id) {
  const { error } = await sb.from('sales_quote_line').delete().eq('id', id);
  if (error) throw error; return true;
}

// Duplica: crea un NUOVO preventivo DRAFT con nuovo numero (assegnato dal DB) e
// ricopia le righe. NON modifica l'originale.
export async function duplicateQuote(sb, tenantId, id) {
  const { quote, lines } = await getQuote(sb, id);
  if (!quote) throw new Error('preventivo non trovato');
  const copy = await createQuote(sb, tenantId, {
    customer_id: quote.customer_id, customer_name: quote.customer_name,
    notes: quote.notes,
  });
  for (const l of lines) {
    await addLine(sb, tenantId, copy.id, {
      product_id: l.product_id, description: l.description, quantity: l.quantity,
      unit_price: l.unit_price, discount: l.discount, tax: l.tax, sort_order: l.sort_order,
    });
  }
  return copy;
}
