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

// Persiste il calcolo come preventivo reale riusando il data-layer quotes.
// Il prezzo autoritativo definitivo resterà lato server quando arriverà il
// backend; qui creiamo il documento con l'unitario calcolato (preview KB).
export async function createQuoteFromCalc(sb, tenantId, { customerId, customerName, description, calc, notes } = {}) {
  if (!calc) throw new Error('calcolo mancante');
  const quote = await createQuote(sb, tenantId, { customer_id: customerId || null, customer_name: customerName || null, notes: notes || null });
  await addLine(sb, tenantId, quote.id, {
    description: description || 'Prodotto personalizzato',
    quantity: calc.quantity,
    unit_price: calc.discountedUnit,
    discount: 0,
    tax: 0,
  });
  return quote;
}
