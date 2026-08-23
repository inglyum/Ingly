// INGLY OS V2 — Scadenziario (data-layer). Modulo DERIVATO sulle fatture
// esistenti (sales_invoice): nessuna tabella nuova, nessuna duplicazione.
// Espone scadenze, residui e fasce di ritardo (aging) per l'incasso.
import { listInvoices, balanceDue } from './invoices.js';
export { balanceDue };
import { friendlyError } from './crm.js';
export { friendlyError };

// Fascia di aging in base a due_date rispetto ad oggi (solo fatture con residuo).
export function agingBucket(inv, today) {
  const t = today || new Date().toISOString().slice(0, 10);
  if (!inv.due_date) return 'nodate';
  if (inv.due_date >= t) return 'current';       // non ancora scaduta
  const days = Math.floor((Date.parse(t) - Date.parse(inv.due_date)) / 86400000);
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90p';
}

export const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90p'];
export const BUCKET_LABEL = { current: 'A scadere', d1_30: '1–30 gg', d31_60: '31–60 gg', d61_90: '61–90 gg', d90p: '>90 gg', nodate: 'Senza data' };

// Carica lo scadenziario: fatture aperte (residuo>0, non DRAFT/CANCELLED) con
// residuo e bucket; più i totali per fascia. today opzionale (test).
export async function loadAging(sb, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const invoices = await listInvoices(sb, { limit: 500 });
  const open = invoices
    .filter((i) => !['DRAFT', 'CANCELLED', 'PAID'].includes(i.status) && balanceDue(i) > 0)
    .map((i) => ({ ...i, residuo: balanceDue(i), bucket: agingBucket(i, today), overdue: i.due_date ? i.due_date < today : false }));
  if (opts.bucket) return { rows: open.filter((r) => r.bucket === opts.bucket), totals: totalsByBucket(open), today };
  // ordina per scadenza (più urgenti prima)
  open.sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  return { rows: open, totals: totalsByBucket(open), today };
}

export function totalsByBucket(rows) {
  const t = { total: 0, overdue: 0 };
  for (const k of BUCKETS) t[k] = 0;
  for (const r of rows) {
    t.total += r.residuo; t[r.bucket] = (t[r.bucket] || 0) + r.residuo;
    if (r.overdue) t.overdue += r.residuo;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  for (const k of Object.keys(t)) t[k] = r2(t[k]);
  return t;
}
