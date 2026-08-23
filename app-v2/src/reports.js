// INGLY OS V2 — Reporting/BI (data-layer). AGGREGAZIONE READ-ONLY sui dati reali
// cross-module: vendite, finanza, magazzino, acquisti, commesse. Nessuna tabella
// nuova, nessun dato finto: dove i dati mancano → 0 / lista vuota.
import * as CRM from './crm.js';
import { listQuotes } from './quotes.js';
import { listOrders } from './orders.js';
import { listProducts } from './catalog.js';
import { listPurchases } from './purchases.js';
import { listProjects, getProject } from './projects.js';
import { loadInventory } from './warehouse.js';
import { loadFinance } from './finance.js';
import { friendlyError } from './crm.js';
export { friendlyError };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function safe(p, fallback) { try { return await p; } catch (_) { return fallback; } }

export async function loadReports(sb) {
  const out = {
    sales: { revenue: 0, orders: 0, quotes: 0, accepted: 0, conversion: 0, avgTicket: 0 },
    topCustomers: [], topProducts: [],
    finance: { incassato: 0, daIncassare: 0, scaduto: 0, daPagareFornitori: 0, cashflow: 0 },
    warehouse: { value: 0, below: 0, units: 0 },
    purchases: { value: 0, count: 0 },
    projects: { total: 0, active: 0, revenue: 0, cost: 0, margin: 0, critical: [] },
    alerts: [], error: null,
  };
  try {
    const [customers, quotes, orders, products, purchases, projects, inv, fin] = await Promise.all([
      safe(CRM.listCustomers(sb, { limit: 1000 }), []),
      safe(listQuotes(sb, { limit: 1000 }), []),
      safe(listOrders(sb, { limit: 1000 }), []),
      safe(listProducts(sb, { limit: 1000 }), []),
      safe(listPurchases(sb, { limit: 1000 }), []),
      safe(listProjects(sb, { limit: 1000 }), []),
      safe(loadInventory(sb, {}), { totalValue: 0, belowCount: 0, totalUnits: 0, rows: [] }),
      safe(loadFinance(sb, {}), { incassato: 0, daIncassare: 0, scaduto: 0, daPagareFornitori: 0, cashflow: 0, esposizioneClienti: [] }),
    ]);

    // ── VENDITE ──
    const activeOrders = orders.filter((o) => o.status !== 'CANCELLED');
    out.sales.revenue = r2(activeOrders.reduce((s, o) => s + Number(o.total || 0), 0));
    out.sales.orders = activeOrders.length;
    out.sales.quotes = quotes.length;
    out.sales.accepted = quotes.filter((q) => q.status === 'ACCEPTED').length;
    out.sales.conversion = quotes.length ? Math.round(out.sales.accepted / quotes.length * 100) : 0;
    out.sales.avgTicket = activeOrders.length ? r2(out.sales.revenue / activeOrders.length) : 0;

    // ── TOP CLIENTI (per valore ordini) ──
    const byCust = {};
    for (const o of activeOrders) { const k = o.customer_name || '—'; byCust[k] = (byCust[k] || 0) + Number(o.total || 0); }
    out.topCustomers = Object.entries(byCust).map(([name, v]) => ({ name, value: r2(v) })).sort((a, b) => b.value - a.value).slice(0, 10);

    // ── TOP PRODOTTI (per quantità venduta) ──
    const pname = Object.fromEntries(products.map((p) => [p.id, p.name]));
    let lines = [];
    try { const { data } = await sb.from('sales_order_line').select('product_id,quantity,line_total'); lines = data || []; } catch (_) { lines = []; }
    const byProd = {};
    for (const l of lines) { if (!l.product_id) continue; const k = l.product_id; byProd[k] = byProd[k] || { qty: 0, value: 0 }; byProd[k].qty += Number(l.quantity || 0); byProd[k].value += Number(l.line_total || 0); }
    out.topProducts = Object.entries(byProd).map(([id, v]) => ({ name: pname[id] || '—', qty: r2(v.qty), value: r2(v.value) })).sort((a, b) => b.qty - a.qty).slice(0, 10);

    // ── FINANZA / MAGAZZINO / ACQUISTI ──
    out.finance = { incassato: fin.incassato, daIncassare: fin.daIncassare, scaduto: fin.scaduto, daPagareFornitori: fin.daPagareFornitori, cashflow: fin.cashflow };
    out.warehouse = { value: inv.totalValue, below: inv.belowCount, units: inv.totalUnits };
    const activePur = purchases.filter((p) => p.status !== 'CANCELLED');
    out.purchases = { value: r2(activePur.reduce((s, p) => s + Number(p.total || 0), 0)), count: activePur.length };

    // ── COMMESSE (economics reali, top 12 per contenere le query) ──
    out.projects.total = projects.length;
    out.projects.active = projects.filter((p) => p.status === 'ACTIVE').length;
    let pr = 0, pc = 0;
    for (const p of projects.slice(0, 12)) {
      const b = await safe(getProject(sb, p.id), null);
      if (!b) continue;
      pr += b.economics.revenue; pc += b.economics.cost;
      if (b.economics.margin < 0) out.projects.critical.push({ name: p.name, margin: b.economics.margin });
    }
    out.projects.revenue = r2(pr); out.projects.cost = r2(pc); out.projects.margin = r2(pr - pc);

    // ── ALERT deterministici (con fonte) ──
    if (inv.belowCount > 0) out.alerts.push({ level: 'warn', text: `${inv.belowCount} prodotti sotto scorta`, source: 'Magazzino → giacenza < punto riordino', link: 'inventory' });
    if (fin.scaduto > 0) out.alerts.push({ level: 'danger', text: `€${fin.scaduto.toLocaleString('it-IT')} scaduto da incassare`, source: 'Finanza → fatture oltre scadenza', link: 'aging' });
    const topExp = (fin.esposizioneClienti || [])[0];
    if (topExp && topExp.value > 0) out.alerts.push({ level: 'info', text: `Cliente ad alta esposizione: ${topExp.name} (€${topExp.value.toLocaleString('it-IT')})`, source: 'Finanza → esposizione clienti', link: 'finance' });
    const sentOld = quotes.filter((q) => q.status === 'SENT').length;
    if (sentOld > 0) out.alerts.push({ level: 'info', text: `${sentOld} preventivi inviati non ancora convertiti`, source: 'Vendite → preventivi in stato SENT', link: 'quotes' });
    const overdueOrders = activeOrders.filter((o) => o.status !== 'DELIVERED' && o.order_date && false).length; // ordini vendita non hanno due date → skip deterministico
    if (out.projects.critical.length) out.alerts.push({ level: 'danger', text: `${out.projects.critical.length} commesse in perdita`, source: 'Commesse → margine < 0', link: 'projects' });
    void overdueOrders;
  } catch (e) { out.error = e; }
  return out;
}
