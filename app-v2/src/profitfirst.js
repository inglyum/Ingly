// INGLY OS V2 — Cassa Profit-First & KPI (data-layer). Aggregazione DERIVATA:
// ripartisce gli incassi reali nei conti profit-first (default KB 15/10/15/60,
// ora configurabili dalle Impostazioni) e calcola i KPI ufficiali KB in modo
// deterministico e spiegabile. Nessuna tabella nuova. Dove il dato non esiste
// (es. ore fatturabili: manca il Time Tracker) lo dichiara N/D, non lo inventa.
import { friendlyError } from './crm.js';
import { loadFinance, periodRange } from './finance.js';
import { getSettings } from './settings.js';
import { listQuotes } from './quotes.js';
import { listInvoices, balanceDue } from './invoices.js';
export { friendlyError };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// KPI ufficiali KB (definizioni). Target usati per il confronto.
export const KPI_TARGETS = {
  week: { revenue: 375, conversion: 0.40, billableHours: 15 },
  // conversion: stessa soglia KB (≥40%) applicata anche al mese (non è un valore
  // nuovo, è il target di conversione definito dalla KB).
  month: { revenueMin: 1500, revenueMax: 3000, margin: 0.60, ticket: 45, returnRate: 0.30, conversion: 0.40 },
};

// Ripartizione profit-first di un importo secondo le percentuali (default KB).
export function computeBuckets(amount, settings = {}) {
  const a = Math.max(0, Number(amount) || 0);
  const tax = Number(settings.cash_tax_pct != null ? settings.cash_tax_pct : 15);
  const reserve = Number(settings.cash_reserve_pct != null ? settings.cash_reserve_pct : 10);
  const goals = Number(settings.cash_goals_pct != null ? settings.cash_goals_pct : 15);
  const operational = Number(settings.cash_operational_pct != null ? settings.cash_operational_pct : 60);
  const sum = tax + reserve + goals + operational;
  return {
    percentages: { tax, reserve, goals, operational },
    valid: Math.abs(sum - 100) < 0.01,
    sumPct: r2(sum),
    tax: r2(a * tax / 100), reserve: r2(a * reserve / 100),
    goals: r2(a * goals / 100), operational: r2(a * operational / 100),
    total: a,
  };
}

// Cruscotto Profit-First + KPI. period: 'month' (default) | 'week'.
export async function loadProfitFirst(sb, opts = {}) {
  const period = opts.period === 'week' ? 'week' : 'month';
  const range = periodRange(period);
  const out = { period, range, incassato: 0, buckets: null, kpis: [], settingsUsed: null, error: null };
  try {
    const [fin, settings, quotes, invoices] = await Promise.all([
      loadFinance(sb, { from: range.from, to: range.to }).catch(() => ({ incassato: 0 })),
      getSettings(sb, opts.tenantId || null).catch(() => ({})),
      listQuotes(sb, { limit: 1000 }).catch(() => []),
      listInvoices(sb, { limit: 1000 }).catch(() => []),
    ]);
    out.incassato = r2(fin.incassato || 0);
    out.settingsUsed = { cash_tax_pct: settings.cash_tax_pct, cash_reserve_pct: settings.cash_reserve_pct, cash_goals_pct: settings.cash_goals_pct, cash_operational_pct: settings.cash_operational_pct };
    out.buckets = computeBuckets(out.incassato, settings);

    // KPI deterministici (solo ciò che è realmente calcolabile dai dati).
    const inRange = (d) => d && String(d).slice(0, 10) >= range.from && String(d).slice(0, 10) <= range.to;
    const activeInv = invoices.filter((i) => !['DRAFT', 'CANCELLED'].includes(i.status));
    const periodInv = activeInv.filter((i) => inRange(i.issue_date));
    const fatturatoPeriodo = r2(periodInv.reduce((s, i) => s + Number(i.total || 0), 0));
    const ticket = periodInv.length ? r2(fatturatoPeriodo / periodInv.length) : 0;

    // Conversione preventivi: accettati / (accettati + rifiutati) nel periodo.
    const periodQuotes = quotes.filter((q) => inRange(q.issue_date));
    const accepted = periodQuotes.filter((q) => q.status === 'ACCEPTED').length;
    const rejected = periodQuotes.filter((q) => q.status === 'REJECTED').length;
    const convDen = accepted + rejected;
    const conversion = convDen ? accepted / convDen : null;

    const T = period === 'month' ? KPI_TARGETS.month : KPI_TARGETS.week;
    const push = (key, label, actual, target, unit, ok, source, na) => out.kpis.push({ key, label, actual, target, unit, ok: na ? null : ok, na: !!na, source });

    if (period === 'month') {
      push('revenue', 'Ricavi MTD (incassato)', out.incassato, `${T.revenueMin}–${T.revenueMax}`, '€', out.incassato >= T.revenueMin, 'Finanza → incassi del mese');
      push('ticket', 'Ticket medio', ticket, T.ticket, '€', ticket >= T.ticket, 'Fatture del mese → totale / numero');
      push('conversion', 'Conversione preventivi', conversion == null ? 0 : r2(conversion * 100), r2(T.conversion * 100), '%', conversion != null && conversion >= T.conversion, 'Preventivi → accettati / (accettati+rifiutati)', conversion == null);
      push('margin', 'Margine', 0, r2(T.margin * 100), '%', false, 'Richiede COGS per riga (in arrivo con la contabilità di magazzino)', true);
    } else {
      push('revenue', 'Ricavi settimana (incassato)', out.incassato, T.revenue, '€', out.incassato >= T.revenue, 'Finanza → incassi della settimana');
      push('conversion', 'Conversione preventivi', conversion == null ? 0 : r2(conversion * 100), r2(T.conversion * 100), '%', conversion != null && conversion >= T.conversion, 'Preventivi → accettati / (accettati+rifiutati)', conversion == null);
      push('billableHours', 'Ore fatturabili', 0, T.billableHours, 'h', false, 'Richiede il Time Tracker (non ancora presente)', true);
    }
  } catch (e) { out.error = e; }
  return out;
}
