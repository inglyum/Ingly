// INGLY OS V2 — Intelligence (data-layer). Motori DETERMINISTICI e spiegabili
// sui dati reali dell'ERP: nessuna "AI" finta, nessuna tabella nuova. Ogni
// insight riporta fonte (source) e motivazione (reason). Dati insufficienti →
// liste vuote con nota.
import * as CRM from './crm.js';
import { listOrders } from './orders.js';
import { listProducts, marginPercent } from './catalog.js';
import { listMovements, loadInventory } from './warehouse.js';
import { listInvoices, balanceDue } from './invoices.js';
import { friendlyError } from './crm.js';
export { friendlyError };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysBetween = (a, b) => Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);
async function safe(p, f) { try { return await p; } catch (_) { return f; } }
const today = () => new Date().toISOString().slice(0, 10);

// ── 1) REORDER INTELLIGENCE ────────────────────────────────────────────────
// Consumo medio giornaliero dagli scarichi (OUT) recenti → giorni di copertura;
// urgenza in base a copertura vs lead time. Fonte: movimenti magazzino + soglie.
export async function reorderIntelligence(sb, opts = {}) {
  const leadDays = opts.leadDays || 7; const windowDays = opts.windowDays || 30;
  const [inv, movements] = await Promise.all([
    safe(loadInventory(sb, {}), { rows: [] }),
    safe(listMovements(sb, { limit: 3000 }), []),
  ]);
  const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const outByProd = {};
  for (const m of movements) if (m.type === 'OUT' && (m.created_at || '').slice(0, 10) >= since) outByProd[m.product_id] = (outByProd[m.product_id] || 0) + Number(m.quantity || 0);
  const items = [];
  for (const row of inv.rows) {
    const avgDaily = r2((outByProd[row.id] || 0) / windowDays);
    const daysCover = avgDaily > 0 ? Math.floor((row.available || 0) / avgDaily) : null;
    const belowThreshold = row.below;
    if (!belowThreshold && !(daysCover != null && daysCover <= leadDays)) continue;
    let urgency = 'low';
    if ((row.available || 0) <= 0) urgency = 'critical';
    else if (daysCover != null && daysCover <= leadDays) urgency = 'high';
    else if (belowThreshold) urgency = 'medium';
    const suggestQty = row.toReorder || Math.max(0, Math.ceil((avgDaily * (leadDays * 2)) - (row.available || 0)));
    items.push({ id: row.id, name: row.name, sku: row.sku, available: row.available, avgDaily, daysCover, suggestQty, urgency,
      reason: avgDaily > 0
        ? `Consumo medio ${avgDaily}/gg · copertura ${daysCover != null ? daysCover + ' gg' : '—'} · lead ${leadDays} gg`
        : `Disponibile ${row.available} sotto soglia (${Math.max(row.reorder_point || 0, row.min_stock || 0)})`,
      source: 'Magazzino → movimenti OUT ultimi ' + windowDays + ' gg + soglie catalogo' });
  }
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => rank[a.urgency] - rank[b.urgency] || b.suggestQty - a.suggestQty);
  return { items, meta: { source: 'stock_movement + catalog reorder', windowDays, leadDays } };
}

// ── 2) ANOMALY DETECTION ───────────────────────────────────────────────────
// Anomalie deterministiche: giacenza negativa, margine negativo (prezzo<costo),
// fatture scadute, ordini a totale 0 (righe mancanti).
export async function anomalyDetection(sb) {
  const [inv, products, invoices, orders] = await Promise.all([
    safe(loadInventory(sb, {}), { rows: [] }),
    safe(listProducts(sb, { limit: 1000 }), []),
    safe(listInvoices(sb, { limit: 1000 }), []),
    safe(listOrders(sb, { limit: 1000 }), []),
  ]);
  const out = [];
  for (const r of inv.rows) if (r.qty < 0) out.push({ severity: 'danger', type: 'Giacenza negativa', entity: r.name, detail: `Giacenza ${r.qty}`, link: 'inventory', source: 'Magazzino → somma movimenti < 0' });
  for (const p of products) { if ((Number(p.price) || 0) > 0 && (Number(p.cost) || 0) > (Number(p.price) || 0)) out.push({ severity: 'warn', type: 'Margine negativo', entity: p.name, detail: `Prezzo ${p.price} < costo ${p.cost}`, link: 'catalog', source: 'Catalogo → prezzo < costo' }); }
  const t = today();
  for (const i of invoices) if (!['DRAFT', 'CANCELLED', 'PAID'].includes(i.status) && i.due_date && i.due_date < t && balanceDue(i) > 0) out.push({ severity: 'danger', type: 'Fattura scaduta', entity: i.number, detail: `Residuo ${r2(balanceDue(i))} · scad. ${i.due_date}`, link: 'aging', source: 'Fatture → oltre scadenza con residuo' });
  for (const o of orders) if (o.status !== 'CANCELLED' && Number(o.total || 0) === 0) out.push({ severity: 'info', type: 'Ordine senza righe', entity: o.number, detail: 'Totale 0', link: 'gestione_ordini', source: 'Ordini → totale = 0' });
  const rank = { danger: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { items: out, meta: { source: 'inventory/catalog/invoices/orders' } };
}

// ── 3) CUSTOMER RFM ────────────────────────────────────────────────────────
// Recency/Frequency/Monetary dagli ordini reali; score 1-3 per quantili
// semplici; segmento derivato. Fonte: sales_order per cliente.
export async function customerRFM(sb) {
  const orders = (await safe(listOrders(sb, { limit: 3000 }), [])).filter((o) => o.status !== 'CANCELLED');
  const t = today();
  const byCust = {};
  for (const o of orders) {
    const k = o.customer_name || '—';
    byCust[k] = byCust[k] || { name: k, freq: 0, monetary: 0, last: '0000-00-00' };
    byCust[k].freq += 1; byCust[k].monetary += Number(o.total || 0);
    if ((o.order_date || '') > byCust[k].last) byCust[k].last = o.order_date || byCust[k].last;
  }
  const rows = Object.values(byCust);
  if (!rows.length) return { items: [], meta: { source: 'sales_order', note: 'dati insufficienti' } };
  for (const r of rows) { r.recencyDays = r.last > '0000-00-00' ? Math.max(0, daysBetween(t, r.last)) : 9999; r.monetary = r2(r.monetary); }
  const score = (val, arr, invert) => { const sorted = arr.slice().sort((a, b) => a - b); const q1 = sorted[Math.floor(sorted.length / 3)]; const q2 = sorted[Math.floor(sorted.length * 2 / 3)]; let s = val <= q1 ? 1 : val <= q2 ? 2 : 3; return invert ? 4 - s : s; };
  const recArr = rows.map((r) => r.recencyDays), freqArr = rows.map((r) => r.freq), monArr = rows.map((r) => r.monetary);
  for (const r of rows) {
    r.R = score(r.recencyDays, recArr, true); r.F = score(r.freq, freqArr, false); r.M = score(r.monetary, monArr, false);
    r.rfm = `${r.R}${r.F}${r.M}`; const sum = r.R + r.F + r.M;
    r.segment = sum >= 8 ? 'Campione' : sum >= 6 ? 'Fedele' : (r.R === 1 ? 'A rischio' : 'Occasionale');
    r.reason = `R${r.R} (ultimo ordine ${r.recencyDays} gg) · F${r.F} (${r.freq} ordini) · M${r.M} (€${r.monetary})`;
    r.source = 'CRM/Ordini → RFM per cliente';
  }
  rows.sort((a, b) => (b.R + b.F + b.M) - (a.R + a.F + a.M) || b.monetary - a.monetary);
  return { items: rows.slice(0, 30), meta: { source: 'sales_order per cliente' } };
}

// ── 4) PRODUCT INTELLIGENCE ────────────────────────────────────────────────
// Best seller (qty venduta), dead stock (a stock ma zero vendite), margine basso,
// margine alto. Fonte: righe ordine + giacenza + catalogo.
export async function productIntelligence(sb) {
  const [products, inv] = await Promise.all([safe(listProducts(sb, { limit: 1000 }), []), safe(loadInventory(sb, {}), { rows: [] })]);
  let lines = []; try { const { data } = await sb.from('sales_order_line').select('product_id,quantity'); lines = data || []; } catch (_) { lines = []; }
  const sold = {}; for (const l of lines) if (l.product_id) sold[l.product_id] = (sold[l.product_id] || 0) + Number(l.quantity || 0);
  const stockById = Object.fromEntries(inv.rows.map((r) => [r.id, r.qty]));
  const best = [], dead = [], lowMargin = [], highMargin = [];
  for (const p of products) {
    const qtySold = r2(sold[p.id] || 0); const mp = marginPercent(p); const stock = stockById[p.id] || 0;
    if (qtySold > 0) best.push({ name: p.name, qty: qtySold, source: 'Ordini → quantità venduta' });
    if (qtySold === 0 && stock > 0) dead.push({ name: p.name, qty: stock, reason: `${stock} a stock, 0 venduti`, source: 'Magazzino+Ordini → stock senza vendite' });
    if ((Number(p.price) || 0) > 0 && mp < 20) lowMargin.push({ name: p.name, marginPct: mp, source: 'Catalogo → margine < 20%' });
    if (mp >= 50) highMargin.push({ name: p.name, marginPct: mp, source: 'Catalogo → margine ≥ 50%' });
  }
  best.sort((a, b) => b.qty - a.qty); dead.sort((a, b) => b.qty - a.qty); lowMargin.sort((a, b) => a.marginPct - b.marginPct); highMargin.sort((a, b) => b.marginPct - a.marginPct);
  return { best: best.slice(0, 10), dead: dead.slice(0, 10), lowMargin: lowMargin.slice(0, 10), highMargin: highMargin.slice(0, 10), meta: { source: 'sales_order_line + inventory + catalog' } };
}

// ── 5) FORECAST ────────────────────────────────────────────────────────────
// Run-rate deterministico: ricavo medio mensile dagli ordini ultimi 90 gg →
// proiezione mese prossimo; incasso atteso (fatture in scadenza 30 gg);
// esborso atteso (da pagare fornitori). Spiegabile, nessun modello nascosto.
export async function forecast(sb) {
  const [orders, invoices] = await Promise.all([safe(listOrders(sb, { limit: 3000 }), []), safe(listInvoices(sb, { limit: 2000 }), [])]);
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const recent = orders.filter((o) => o.status !== 'CANCELLED' && (o.order_date || '') >= since90);
  const rev90 = recent.reduce((s, o) => s + Number(o.total || 0), 0);
  const projMonthly = r2(rev90 / 3);
  const t = today(); const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const activeInv = invoices.filter((i) => !['DRAFT', 'CANCELLED', 'PAID'].includes(i.status));
  const expectedInflow = r2(activeInv.filter((i) => i.due_date && i.due_date >= t && i.due_date <= in30).reduce((s, i) => s + Math.max(0, balanceDue(i)), 0));
  const overdueInflow = r2(activeInv.filter((i) => i.due_date && i.due_date < t).reduce((s, i) => s + Math.max(0, balanceDue(i)), 0));
  return {
    projMonthlyRevenue: projMonthly, ordersLast90: recent.length,
    expectedInflow30: expectedInflow, overdueInflow,
    reason: `Ricavo ultimi 90 gg €${r2(rev90)} su ${recent.length} ordini → media mensile €${projMonthly}. Incasso atteso 30 gg da fatture in scadenza.`,
    source: 'sales_order (90 gg) + sales_invoice (scadenze)',
    sufficient: recent.length >= 1,
  };
}

// ── 6) BUSINESS ALERTS — compone i segnali prioritari con fonte+link ────────
export async function businessAlerts(sb) {
  const [reord, anom, rfm] = await Promise.all([reorderIntelligence(sb, {}), anomalyDetection(sb), customerRFM(sb)]);
  const alerts = [];
  const crit = reord.items.filter((i) => i.urgency === 'critical' || i.urgency === 'high');
  if (crit.length) alerts.push({ level: 'danger', text: `${crit.length} articoli da riordinare con urgenza`, source: 'Reorder Intelligence', link: 'inventory' });
  for (const a of anom.items.slice(0, 5)) alerts.push({ level: a.severity, text: `${a.type}: ${a.entity}`, source: a.source, link: a.link });
  const atRisk = rfm.items.filter((r) => r.segment === 'A rischio');
  if (atRisk.length) alerts.push({ level: 'warn', text: `${atRisk.length} clienti a rischio (RFM)`, source: 'Customer RFM → recency alta', link: 'clients' });
  const champs = rfm.items.filter((r) => r.segment === 'Campione');
  if (champs.length) alerts.push({ level: 'info', text: `${champs.length} clienti campione da fidelizzare`, source: 'Customer RFM', link: 'clients' });
  return { items: alerts, meta: { source: 'reorder+anomaly+rfm' } };
}
