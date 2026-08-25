// INGLY OS V2 — Smart Quoter parametrico (data-layer). Motore di prezzo
// DETERMINISTICO fedele alla Knowledge Base INGLY (fonte di verità):
//   Prezzo = (Materiale + Macchina + Lavoro + Design) × Markup canale, → ,90.
// Lavoro €18/h · Materiale +15% sfrido · Markup B2C ×3 / B2B ×2–2.5 / Etsy ×3.5
// · minimi psicologici · sconti ammessi · express +25% · acconto 50% > €50.
// Il calcolo qui è per la PREVIEW; la persistenza riusa il data-layer quotes.
// Nessuna tabella nuova, nessuna logica di business alterata (implementa la KB).
import { friendlyError } from './crm.js';
import { createQuote, addLine } from './quotes.js';
export { friendlyError };

export const SFRIDO = 0.15;            // +15% sfrido sul materiale
export const LABOR_RATE = 18;         // €/ora
export const EXPRESS_PCT = 0.25;      // +25% urgenza <48h (opt-in)
export const ORDER_MIN = 15;          // ordine minimo €

// Markup e margine minimo per canale (KB). Per B2B il markup è un range 2–2.5:
// default 2.5, regolabile entro [min,max]; sotto minMargin → warning.
export const CHANNELS = {
  B2C: { label: 'B2C (dettaglio)', markup: 3, markupMin: 3, markupMax: 3, minMargin: 0.65 },
  B2B: { label: 'B2B (rivendita)', markup: 2.5, markupMin: 2, markupMax: 2.5, minMargin: 0.55 },
  ETSY: { label: 'Etsy', markup: 3.5, markupMin: 3.5, markupMax: 3.5, minMargin: 0.65 },
};

// Minimi psicologici per tipo prodotto (KB). 'generico' = solo ordine minimo.
export const PSY_MIN = {
  generico: 0, portachiavi: 6.90, cake_topper: 24.90, targa_a5: 29.90, qr_menu: 19.90,
};
export const PSY_MIN_LABEL = {
  generico: 'Generico', portachiavi: 'Portachiavi', cake_topper: 'Cake topper', targa_a5: 'Targa A5', qr_menu: 'QR menu',
};

// Sconti quantità ammessi (KB): 10+ −10%, 25+ −15%, 50+ −20%.
export const QTY_TIERS = [{ min: 50, pct: 0.20 }, { min: 25, pct: 0.15 }, { min: 10, pct: 0.10 }];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Arrotonda per eccesso al più vicino x,90 (mai sotto il valore grezzo).
export function roundTo90(x) {
  const n = Number(x) || 0;
  let cand = Math.floor(n) + 0.90;
  if (cand < n - 1e-9) cand += 1;
  return r2(cand);
}

export function qtyDiscountPct(quantity) {
  const q = Number(quantity) || 0;
  for (const t of QTY_TIERS) if (q >= t.min) return t.pct;
  return 0;
}

// Motore di preventivazione. Ritorna breakdown completo e spiegabile.
// input: { materiale, macchina, lavoroMin, design, channel, markup?, quantity,
//          productType, express, referral, riordino, personalizzato }
export function computeQuote(input = {}) {
  const materiale = Math.max(0, Number(input.materiale) || 0);
  const macchina = Math.max(0, Number(input.macchina) || 0);
  const lavoroMin = Math.max(0, Number(input.lavoroMin) || 0);
  const design = Math.max(0, Number(input.design) || 0);
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const channelKey = CHANNELS[input.channel] ? input.channel : 'B2C';
  const ch = CHANNELS[channelKey];
  const productType = PSY_MIN[input.productType] != null ? input.productType : 'generico';

  const materialeConSfrido = r2(materiale * (1 + SFRIDO));
  const lavoro = r2((lavoroMin / 60) * LABOR_RATE);
  const cost = r2(materialeConSfrido + macchina + lavoro + design); // costo pieno unitario

  // markup: valore richiesto limitato al range del canale
  let markup = input.markup != null ? Number(input.markup) : ch.markup;
  markup = Math.min(ch.markupMax, Math.max(ch.markupMin, markup || ch.markup));

  let base = cost * markup;
  const express = !!input.express;
  if (express) base *= (1 + EXPRESS_PCT);
  let unit = roundTo90(base);

  // minimo psicologico per tipo prodotto
  const psyMin = PSY_MIN[productType] || 0;
  const psyMinApplied = unit < psyMin;
  if (psyMinApplied) unit = psyMin;

  // sconti ammessi (quantità + referral + riordino), trasparenti
  const qtyPct = qtyDiscountPct(quantity);
  const referralPct = input.referral ? 0.10 : 0;
  const riordinoPct = input.riordino ? 0.10 : 0;
  const discountPct = Math.min(0.40, qtyPct + referralPct + riordinoPct); // cap prudenziale 40%
  let discountedUnit = r2(unit * (1 - discountPct));
  // il minimo psicologico resta un pavimento anche dopo sconto
  if (discountedUnit < psyMin) discountedUnit = psyMin;

  const lineTotal = r2(discountedUnit * quantity);
  const margin = discountedUnit > 0 ? r2((discountedUnit - cost) / discountedUnit) : 0;
  const marginOk = margin >= ch.minMargin;
  const orderOk = lineTotal >= ORDER_MIN;
  const personalizzato = !!input.personalizzato || design > 0;
  const acconto = (personalizzato && lineTotal > 50) ? r2(lineTotal * 0.5) : 0;

  const warnings = [];
  if (!orderOk) warnings.push(`Totale ${lineTotal}€ sotto l'ordine minimo di ${ORDER_MIN}€`);
  if (!marginOk) warnings.push(`Margine ${(margin * 100).toFixed(0)}% sotto il minimo ${channelKey} (${(ch.minMargin * 100).toFixed(0)}%)`);
  if (psyMinApplied) warnings.push(`Applicato minimo psicologico ${PSY_MIN_LABEL[productType]} (${psyMin.toFixed(2)}€)`);

  return {
    inputs: { materiale, macchina, lavoroMin, design, quantity, channel: channelKey, markup, productType, express, referral: !!input.referral, riordino: !!input.riordino },
    materialeConSfrido, lavoro, cost, markup, base: r2(base), unit, psyMin, psyMinApplied,
    discountPct, discountedUnit, quantity, lineTotal, margin, marginOk, orderOk, acconto,
    channel: channelKey, channelLabel: ch.label, minMargin: ch.minMargin,
    warnings,
    breakdown: [
      { label: 'Materiale (+15% sfrido)', value: materialeConSfrido, source: `KB · ${materiale}€ × 1,15` },
      { label: 'Macchina', value: macchina, source: 'KB · costo macchina' },
      { label: `Lavoro (${lavoroMin} min × 18€/h)`, value: lavoro, source: 'KB · €18/h' },
      { label: 'Design (una tantum)', value: design, source: 'KB · +10–30€' },
      { label: `Markup ${channelKey} ×${markup}`, value: r2(cost * markup), source: `KB · costo ${cost}€ × ${markup}` },
    ],
  };
}

// ==========================================================================
// MOTORE PREMIUM — breakdown per riga, anchoring, margine, prezzo minimo.
// Deterministico e spiegabile. markup/discount/IVA espressi in PERCENTUALE.
// ==========================================================================
const max0 = (n) => Math.max(0, Number(n) || 0);

// ── CONFIGURA LAVORAZIONE — categorie e calcolo per lavorazione (cost component)
// Ogni lavorazione ha una categoria con parametri dinamici; costo deterministico.
export const WORKING_CATEGORIES = [
  { k: 'material', label: 'Materiale', icon: '🧱' },
  { k: 'machine', label: 'Laser / Macchina', icon: '🔦' },
  { k: 'labor', label: 'Manodopera / Assemblaggio', icon: '🔧' },
  { k: 'design', label: 'Design', icon: '✏️' },
  { k: 'painting', label: 'Verniciatura', icon: '🎨' },
  { k: 'gadget', label: 'Gadget / LED / Minuteria', icon: '💡' },
  { k: 'catalog', label: 'Prodotto da Catalogo', icon: '📦' },
  { k: 'extra', label: 'Extra (setup/packaging…)', icon: '➕' },
];
// Mappa categoria → bucket costo (per colonne flat/BI). La verniciatura confluisce
// nel bucket 'material' (è materiale di consumo); resta distinta nel breakdown UI.
const CAT_BUCKET = { material: 'material', painting: 'material', machine: 'machine', labor: 'labor', design: 'design', gadget: 'extra', catalog: 'extra', extra: 'extra' };

// Costo di UNA lavorazione secondo la categoria (deterministico, spiegabile).
export function computeWorking(w = {}) {
  const n = (x) => Math.max(0, Number(x) || 0);
  let cost = 0;
  switch (w.category) {
    case 'material': cost = n(w.mq) * (1 + n(w.sfrido_pct) / 100) * n(w.cost_per_mq); break;
    case 'machine': cost = n(w.minutes) * n(w.cost_per_min); break;
    case 'labor': cost = (n(w.minutes) / 60 + n(w.hours)) * n(w.rate_per_hour); break;
    case 'painting': cost = n(w.surface_mq) * n(w.cost_per_mq) * Math.max(1, n(w.coats) || 1); break;
    case 'design': cost = n(w.amount); break;
    case 'gadget': case 'catalog': case 'extra': cost = n(w.quantity) * n(w.unit_cost); break;
    default: cost = n(w.cost);
  }
  return { ...w, cost: r2(cost) };
}

// Somma le lavorazioni in bucket di costo (già finali: lo sfrido è dentro la
// lavorazione 'material', quindi NON va riapplicato).
export function bucketsFromWorkings(workings) {
  const computed = (workings || []).map(computeWorking);
  const b = { material: 0, machine: 0, labor: 0, design: 0, extra: 0 };
  for (const w of computed) { const k = CAT_BUCKET[w.category] || 'extra'; b[k] = r2(b[k] + w.cost); }
  return { buckets: b, computed, unitCost: r2(b.material + b.machine + b.labor + b.design + b.extra) };
}

// Calcolo completo di una riga. Se la riga ha `workings` (Configura Lavorazione)
// il costo unitario è la somma delle lavorazioni (sfrido già incluso); altrimenti
// usa il breakdown flat (materiale riceve lo sfrido KB). Ritorna costi, prezzo,
// sconto, IVA, imponibile, totale, margine, margine%.
export function computeLine(l = {}, opts = {}) {
  const qty = Math.max(1, Math.floor(Number(l.quantity) || 1));
  let material, machine, labor, design, extra, unitCost, workings = null;
  if (Array.isArray(l.workings) && l.workings.length) {
    const bw = bucketsFromWorkings(l.workings);
    material = bw.buckets.material; machine = bw.buckets.machine; labor = bw.buckets.labor;
    design = bw.buckets.design; extra = bw.buckets.extra; unitCost = bw.unitCost; workings = bw.computed;
  } else {
    const sfrido = opts.sfridoPct != null ? Number(opts.sfridoPct) / 100 : SFRIDO;
    material = r2(max0(l.cost_material) * (1 + sfrido));
    machine = r2(max0(l.cost_machine));
    labor = r2(max0(l.cost_labor));
    design = r2(max0(l.cost_design));
    extra = r2(max0(l.cost_extra));
    unitCost = r2(material + machine + labor + design + extra);
  }
  const markupPct = Number(l.markup_pct != null ? l.markup_pct : (opts.defaultMarkupPct != null ? opts.defaultMarkupPct : 200));
  // prezzo unitario: esplicito (unit_price) se fornito e useStoredPrice, altrimenti da markup
  const priceFromMarkup = roundTo90(unitCost * (1 + markupPct / 100));
  const unitPrice = (opts.useStoredPrice && l.unit_price != null) ? r2(l.unit_price) : priceFromMarkup;
  const discountPct = Math.min(100, Math.max(0, Number(l.discount_pct) || 0));
  const netUnit = r2(unitPrice * (1 - discountPct / 100));
  const vatRate = Number(l.vat_rate != null ? l.vat_rate : (opts.defaultVat != null ? opts.defaultVat : 22));
  const imponibile = r2(netUnit * qty);
  const iva = r2(imponibile * vatRate / 100);
  const total = r2(imponibile + iva);
  const cost = r2(unitCost * qty);
  const margin = r2(imponibile - cost);
  const marginPct = imponibile > 0 ? r2((margin / imponibile) * 100) : 0;
  return {
    qty, material, machine, labor, design, extra, unitCost, markupPct, unitPrice, workings,
    discountPct, netUnit, vatRate, imponibile, iva, total, cost, margin, marginPct,
    minPrice: unitCost, // prezzo minimo vitale = break-even unitario
  };
}

// Prezzo unitario (,90) per ottenere un margine target sul prezzo.
export function priceForMargin(unitCost, targetMarginPct) {
  const m = Number(targetMarginPct) / 100;
  if (!(m < 1)) return null;
  return roundTo90(max0(unitCost) / (1 - m));
}

// Anchoring a 3 livelli attorno al markup base: economy / consigliato / premium.
export function anchoringTiers(unitCost, baseMarkupPct) {
  const c = max0(unitCost); const mk = Number(baseMarkupPct) || 0;
  return {
    economy: roundTo90(c * (1 + (mk * 0.8) / 100)),
    consigliato: roundTo90(c * (1 + mk / 100)),
    premium: roundTo90(c * (1 + (mk * 1.3) / 100)),
  };
}

// Indicatore di rischio margine rispetto a una soglia minima (default 55%).
export function marginRisk(marginPct, minMarginPct = 55) {
  const m = Number(marginPct) || 0;
  if (m < minMarginPct) return 'high';
  if (m < minMarginPct + 10) return 'medium';
  return 'low';
}

// Aggregazione documento: somma righe (product+extra), sconto/IVA/margine e
// acconto. lines = array di righe grezze (col breakdown); opts.depositPct.
export function computeDocument(lines = [], opts = {}) {
  const rows = (lines || []).map((l) => ({ ...computeLine(l, opts), kind: l.kind || 'product', description: l.description }));
  const sum = (f) => r2(rows.reduce((s, r) => s + r[f], 0));
  const imponibile = sum('imponibile'); const iva = sum('iva'); const total = sum('total');
  const cost = sum('cost'); const margin = r2(imponibile - cost);
  const marginPct = imponibile > 0 ? r2((margin / imponibile) * 100) : 0;
  const depositPct = opts.depositPct != null ? Number(opts.depositPct) : 0;
  const deposit = depositPct > 0 ? r2(total * depositPct / 100) : 0;
  return { rows, imponibile, iva, total, cost, margin, marginPct, deposit, depositPct, risk: marginRisk(marginPct, opts.minMarginPct) };
}

// Descrizione-SNAPSHOT: congela nel testo della riga il dettaglio del calcolo,
// così il documento resta spiegabile e NON dipende dai valori futuri del
// catalogo (nessun ricalcolo retroattivo). Solo il prezzo unitario fa fede.
export function snapshotDescription(baseDesc, calc) {
  const base = (baseDesc && String(baseDesc).trim()) || 'Prodotto personalizzato';
  if (!calc) return base;
  const parts = `Mat ${calc.materialeConSfrido} + Macc ${calc.inputs.macchina} + Lav ${calc.lavoro} + Design ${calc.inputs.design}`;
  const extra = `${calc.inputs.express ? ' +25% express' : ''}${calc.discountPct ? ` −${Math.round(calc.discountPct * 100)}%` : ''}`;
  return `${base} — [${parts}] ×${calc.markup}${extra} = ${calc.discountedUnit}€ (KB)`;
}

// Costruisce il payload di riga (snapshot) dal calcolo. Prezzo unitario e
// descrizione sono congelati; line_total è colonna generata dal DB.
export function quoterLinePayload({ description, calc, sortOrder } = {}) {
  if (!calc) throw new Error('calcolo mancante');
  return {
    description: snapshotDescription(description, calc),
    quantity: calc.quantity,
    unit_price: calc.discountedUnit,
    discount: 0,
    tax: 0,
    sort_order: Number(sortOrder) || 0,
  };
}

// Aggiunge una riga (snapshot) a un preventivo ESISTENTE riusando quotes.addLine.
export async function addQuoterLineToQuote(sb, tenantId, quoteId, { description, calc, sortOrder } = {}) {
  if (!quoteId) throw new Error('preventivo mancante');
  return addLine(sb, tenantId, quoteId, quoterLinePayload({ description, calc, sortOrder }));
}

// Persiste il calcolo come NUOVO preventivo reale riusando il data-layer quotes.
// Il prezzo autoritativo definitivo resterà lato server quando arriverà il
// backend; qui creiamo il documento con l'unitario calcolato (snapshot KB).
export async function createQuoteFromCalc(sb, tenantId, { customerId, customerName, description, calc, notes } = {}) {
  if (!calc) throw new Error('calcolo mancante');
  const quote = await createQuote(sb, tenantId, { customer_id: customerId || null, customer_name: customerName || null, notes: notes || null });
  await addLine(sb, tenantId, quote.id, quoterLinePayload({ description, calc, sortOrder: 0 }));
  return quote;
}
