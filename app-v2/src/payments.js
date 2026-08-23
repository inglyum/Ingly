// INGLY OS V2 — Pagamenti/Incassi (data-layer Supabase). Registrazione incassi
// su sales_payment (RLS per tenant + permesso sales.payment). Il DB aggiorna
// paid_total e lo STATO fattura via trigger; qui si valida anche lato client
// (il confine reale resta il DB). Più pagamenti per fattura, storno via soft-delete.
import { friendlyError, canWrite, canDelete } from './crm.js';
export { friendlyError, canWrite, canDelete };

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'paypal', 'stripe', 'other'];
export const METHOD_LABEL = { cash: 'Contanti', card: 'Carta', bank_transfer: 'Bonifico', paypal: 'PayPal', stripe: 'Stripe', other: 'Altro' };

export async function listPayments(sb, invoiceId) {
  const { data, error } = await sb.from('sales_payment')
    .select('id,amount,paid_date,method,reference,notes')
    .eq('invoice_id', invoiceId).is('deleted_at', null)
    .order('paid_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export function totalPaid(payments) {
  return Math.round((payments || []).reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
}

// Registra un incasso. Validazione client: importo>0 e ≤ residuo salvo overpayment
// esplicito (il DB rifiuta comunque via trigger). tenant_id forzato.
export async function registerPayment(sb, tenantId, invoiceId, data, residuo) {
  const amount = Number(data.amount) || 0;
  if (amount <= 0) throw new Error('Importo non valido.');
  if (!data.allow_overpayment && residuo != null && amount > Number(residuo) + 0.001) {
    const e = new Error('overpayment'); e.code = 'OVERPAY'; e.residuo = residuo; throw e;
  }
  const row = {
    tenant_id: tenantId, invoice_id: invoiceId, amount,
    method: data.method || 'bank_transfer', reference: data.reference || null,
    notes: data.notes || null, allow_overpayment: !!data.allow_overpayment,
  };
  if (data.paid_date) row.paid_date = data.paid_date;
  const { data: out, error } = await sb.from('sales_payment').insert(row).select().single();
  if (error) throw error; return out;
}

// Storno incasso (soft-delete): il trigger ricalcola paid_total/stato fattura.
export async function voidPayment(sb, id) {
  const { error } = await sb.from('sales_payment').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export function friendlyPaymentError(e) {
  const m = String((e && (e.message || e.code)) || e || '').toLowerCase();
  if (m.includes('overpay') || m.includes('superiore al residuo') || m.includes('23514'))
    return 'Importo superiore al residuo da incassare.';
  return friendlyError(e);
}
