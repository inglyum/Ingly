// INGLY OS V2 — Smart Quoter Studio (data-layer). Persistenza del preventivo
// premium con SNAPSHOT breakdown per riga. Riusa sales_quote/sales_quote_line
// (nessun secondo sistema). Gli extra sono righe kind='extra'. Il breakdown è
// congelato: le conversioni a ordine/fattura NON lo ricalcolano.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { computeLine, computeDocument } from './quoter.js';
export { friendlyError, canWrite, canDelete };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Costruisce la riga DB (snapshot) da una riga studio. discount/tax ASSOLUTI
// derivati dal calcolo così il ricalcolo header del DB resta coerente.
export function lineDbPayload(l, tenantId, quoteId, sortOrder, opts = {}) {
  const c = computeLine(l, opts);
  const discountAbs = r2(Math.max(0, c.unitPrice * c.qty - c.imponibile));
  const hasWorkings = Array.isArray(l.workings) && l.workings.length;
  // Con le lavorazioni i bucket di costo sono quelli calcolati (sfrido incluso);
  // senza, si conservano i valori flat grezzi (retro-compatibilità).
  const material = hasWorkings ? c.material : r2(Number(l.cost_material) || 0);
  const machine = hasWorkings ? c.machine : r2(Number(l.cost_machine) || 0);
  const labor = hasWorkings ? c.labor : r2(Number(l.cost_labor) || 0);
  const design = hasWorkings ? c.design : r2(Number(l.cost_design) || 0);
  const extra = hasWorkings ? c.extra : r2(Number(l.cost_extra) || 0);
  return {
    tenant_id: tenantId, quote_id: quoteId,
    product_id: l.product_id || null,
    kind: l.kind === 'extra' ? 'extra' : 'product',
    description: l.description || (l.kind === 'extra' ? 'Extra' : 'Riga'),
    quantity: c.qty, unit_price: c.unitPrice,
    discount: discountAbs, tax: c.iva,
    cost_material: material, cost_machine: machine, cost_labor: labor, cost_design: design, cost_extra: extra,
    markup_pct: c.markupPct, discount_pct: c.discountPct, vat_rate: c.vatRate,
    image_url: l.image_url || null, spec: l.spec || null,
    workings: hasWorkings ? (c.workings || l.workings) : null, // snapshot storico congelato
    sort_order: Number(sortOrder) || 0,
  };
}

const HEADER_COLS = ['title', 'priority', 'category', 'deposit_pct', 'customer_id', 'customer_name', 'notes', 'valid_until', 'issue_date', 'status'];
function headerPayload(doc) {
  const out = {};
  for (const k of HEADER_COLS) if (k in doc && doc[k] !== undefined) out[k] = doc[k];
  return out;
}

// Salva (crea o aggiorna) l'intero documento con le sue righe (snapshot).
export async function saveQuoteDoc(sb, tenantId, doc) {
  const opts = { defaultVat: doc.vat_rate, defaultMarkupPct: doc.markup_pct };
  let quoteId = doc.id;
  if (quoteId) {
    const { error } = await sb.from('sales_quote').update({ ...headerPayload(doc), updated_at: new Date().toISOString() }).eq('id', quoteId);
    if (error) throw error;
    await sb.from('sales_quote_line').delete().eq('quote_id', quoteId); // sostituzione atomica lato app
  } else {
    const { data, error } = await sb.from('sales_quote').insert({ tenant_id: tenantId, status: 'DRAFT', ...headerPayload(doc) }).select().single();
    if (error) throw error; quoteId = data.id;
  }
  let i = 0;
  for (const l of (doc.lines || [])) {
    const { error } = await sb.from('sales_quote_line').insert(lineDbPayload(l, tenantId, quoteId, i++, opts));
    if (error) throw error;
  }
  const { data: head } = await sb.from('sales_quote').select('*').eq('id', quoteId).maybeSingle();
  return head || { id: quoteId };
}

// Carica il documento completo (header + righe con breakdown) per l'editor.
export async function loadQuoteDoc(sb, id) {
  const { data: quote, error } = await sb.from('sales_quote').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('sales_quote_line').select('*').eq('quote_id', id).order('sort_order', { ascending: true });
  return { quote: quote || null, lines: lines || [] };
}

// Ricalcola il documento (per la UI) dalle righe caricate/dallo stato editor.
export function recalcDoc(doc) {
  return computeDocument(doc.lines || [], { defaultVat: doc.vat_rate, defaultMarkupPct: doc.markup_pct, depositPct: doc.deposit_pct, minMarginPct: doc.minMarginPct });
}

// Duplica un documento esistente in una nuova bozza (snapshot copiato).
export async function duplicateQuoteDoc(sb, tenantId, id) {
  const { quote, lines } = await loadQuoteDoc(sb, id);
  if (!quote) throw new Error('preventivo non trovato');
  const doc = {
    title: (quote.title || quote.number || 'Preventivo') + ' (copia)',
    priority: quote.priority, category: quote.category, deposit_pct: quote.deposit_pct,
    customer_id: quote.customer_id, customer_name: quote.customer_name, notes: quote.notes,
    lines: lines.map((l) => ({ ...l, id: undefined })),
  };
  return saveQuoteDoc(sb, tenantId, doc);
}
