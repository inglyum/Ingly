// INGLY OS V2 — Finanza (data-layer). AGGREGAZIONE DERIVATA sui dati esistenti
// (fatture, incassi, ordini di acquisto) + pagamenti fornitori (unico evento
// nuovo, tabella supplier_payment). Nessuna seconda fonte di verità sugli importi.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { balanceDue } from './invoices.js';
export { friendlyError, canWrite, canDelete };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'paypal', 'stripe', 'other'];
export const METHOD_LABEL = { cash: 'Contanti', card: 'Carta', bank_transfer: 'Bonifico', paypal: 'PayPal', stripe: 'Stripe', other: 'Altro' };

function inPeriod(dateStr, from, to) {
  if (!from && !to) return true;
  const d = (dateStr || '').slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
export function periodRange(kind) {
  const now = new Date(); const iso = (d) => d.toISOString().slice(0, 10);
  if (kind === 'month') { const f = new Date(now.getFullYear(), now.getMonth(), 1); return { from: iso(f), to: iso(now) }; }
  if (kind === 'week') { const f = new Date(now); f.setDate(now.getDate() - 6); return { from: iso(f), to: iso(now) }; }
  return { from: '', to: '' }; // all
}

// ── Pagamenti fornitori (evento reale) ──────────────────────────────────────
export async function listSupplierPayments(sb, opts = {}) {
  let q = sb.from('supplier_payment')
    .select('id,purchase_order_id,supplier_id,supplier_name,amount,paid_date,method,reference,notes')
    .is('deleted_at', null);
  if (opts.purchaseOrderId) q = q.eq('purchase_order_id', opts.purchaseOrderId);
  const { data, error } = await q.order('paid_date', { ascending: false }).limit(opts.limit || 500);
  if (error) throw error;
  return data || [];
}

export async function registerSupplierPayment(sb, tenantId, data, residuo) {
  const amount = Number(data.amount) || 0;
  if (amount <= 0) throw new Error('Importo non valido.');
  if (!data.allow_overpayment && residuo != null && amount > Number(residuo) + 0.001) {
    const e = new Error('overpayment'); e.code = 'OVERPAY'; e.residuo = residuo; throw e;
  }
  const row = {
    tenant_id: tenantId, purchase_order_id: data.purchase_order_id || null,
    supplier_id: data.supplier_id || null, supplier_name: data.supplier_name || null,
    amount, method: data.method || 'bank_transfer', reference: data.reference || null,
    notes: data.notes || null, allow_overpayment: !!data.allow_overpayment,
  };
  if (data.paid_date) row.paid_date = data.paid_date;
  const { data: out, error } = await sb.from('supplier_payment').insert(row).select().single();
  if (error) throw error; return out;
}

export async function voidSupplierPayment(sb, id) {
  const { error } = await sb.from('supplier_payment').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

export function supplierPaidFor(payments, poId) {
  return r2((payments || []).filter((p) => p.purchase_order_id === poId).reduce((s, p) => s + Number(p.amount || 0), 0));
}

// ── Aggregazione Finanza (derivata) ─────────────────────────────────────────
export async function loadFinance(sb, opts = {}) {
  const { from = '', to = '' } = opts;
  const today = new Date().toISOString().slice(0, 10);
  const out = {
    from, to, today,
    incassato: 0, daIncassare: 0, scaduto: 0,
    pagatoFornitori: 0, daPagareFornitori: 0,
    entrate: 0, uscite: 0, cashflow: 0,
    esposizioneClienti: [], esposizioneFornitori: [],
    entrateRows: [], usciteRows: [], scadenzeClienti: [], scadenzeFornitori: [],
    error: null,
  };
  try {
    const [invoices, payments, purchases, supPays] = await Promise.all([
      sb.from('sales_invoice').select('id,number,customer_name,status,total,paid_total,due_date').is('deleted_at', null).then((r) => r.data || []),
      sb.from('sales_payment').select('id,invoice_id,amount,paid_date,method').is('deleted_at', null).then((r) => r.data || []),
      sb.from('purchase_order').select('id,number,supplier_name,status,total').is('deleted_at', null).then((r) => r.data || []),
      listSupplierPayments(sb, {}).catch(() => []),
    ]);

    // ENTRATE — incassi (reali) nel periodo
    const entrate = payments.filter((p) => inPeriod(p.paid_date, from, to));
    out.incassato = r2(entrate.reduce((s, p) => s + Number(p.amount || 0), 0));
    out.entrateRows = entrate.map((p) => ({ id: p.id, date: p.paid_date, amount: Number(p.amount || 0), method: p.method, source: 'Incasso fattura', ref: p.invoice_id }));
    out.entrate = out.incassato;

    // USCITE — pagamenti fornitori nel periodo
    const usc = supPays.filter((p) => inPeriod(p.paid_date, from, to));
    out.pagatoFornitori = r2(usc.reduce((s, p) => s + Number(p.amount || 0), 0));
    out.usciteRows = usc.map((p) => ({ id: p.id, date: p.paid_date, amount: Number(p.amount || 0), method: p.method, source: 'Pagamento fornitore', ref: p.supplier_name || p.purchase_order_id }));
    out.uscite = out.pagatoFornitori;
    out.cashflow = r2(out.entrate - out.uscite);

    // CREDITI clienti (da incassare / scaduto / esposizione)
    const activeInv = invoices.filter((i) => !['DRAFT', 'CANCELLED'].includes(i.status));
    out.daIncassare = r2(activeInv.reduce((s, i) => s + Math.max(0, balanceDue(i)), 0));
    out.scaduto = r2(activeInv.filter((i) => i.status !== 'PAID' && i.due_date && i.due_date < today).reduce((s, i) => s + Math.max(0, balanceDue(i)), 0));
    const expCli = {};
    for (const i of activeInv) { const due = Math.max(0, balanceDue(i)); if (due > 0) expCli[i.customer_name || '—'] = (expCli[i.customer_name || '—'] || 0) + due; }
    out.esposizioneClienti = Object.entries(expCli).map(([name, v]) => ({ name, value: r2(v) })).sort((a, b) => b.value - a.value).slice(0, 20);
    out.scadenzeClienti = activeInv.filter((i) => balanceDue(i) > 0).map((i) => ({ id: i.id, number: i.number, name: i.customer_name, due_date: i.due_date, residuo: r2(balanceDue(i)), overdue: !!(i.due_date && i.due_date < today) }))
      .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));

    // DEBITI fornitori (da pagare / esposizione) — derivati: PO total - pagato
    const activePo = purchases.filter((o) => o.status !== 'CANCELLED');
    const expForn = {};
    out.daPagareFornitori = 0;
    out.scadenzeFornitori = [];
    for (const o of activePo) {
      const paid = supplierPaidFor(supPays, o.id);
      const due = Math.max(0, r2(Number(o.total || 0) - paid));
      if (due > 0) { out.daPagareFornitori = r2(out.daPagareFornitori + due); expForn[o.supplier_name || '—'] = (expForn[o.supplier_name || '—'] || 0) + due;
        out.scadenzeFornitori.push({ id: o.id, number: o.number, name: o.supplier_name, residuo: due }); }
    }
    out.esposizioneFornitori = Object.entries(expForn).map(([name, v]) => ({ name, value: r2(v) })).sort((a, b) => b.value - a.value).slice(0, 20);
  } catch (e) { out.error = e; }
  return out;
}
