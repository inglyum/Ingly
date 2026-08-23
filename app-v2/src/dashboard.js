// INGLY OS V2 — Dashboard data-layer. Metriche reali derivate dal CRM
// (nessun dato finto). Riusa le query CRM esistenti: nessuna tabella nuova.
import * as CRM from './crm.js';
import { listProducts } from './catalog.js';
import { listQuotes } from './quotes.js';
import { listOrders } from './orders.js';
import { listInvoices, balanceDue } from './invoices.js';
import { listPurchases } from './purchases.js';

// Aggrega i KPI CRM+catalogo+preventivi. Ritorna sempre una struttura completa
// (0 se vuoto), mai eccezioni verso l'alto: errori → metriche a 0.
export async function loadDashboard(sb) {
  const out = {
    customers: 0, companies: 0, activities: 0, products: 0, b2b: 0, b2c: 0,
    totalValue: 0, recentCustomers: [], recentActivities: [], error: null,
    quotesTotal: 0, quotesDraft: 0, quotesSent: 0, quotesAccepted: 0, quotesAcceptedValue: 0,
    ordersTotal: 0, ordersOpen: 0, ordersDelivered: 0, ordersRevenue: 0,
    invoicesTotal: 0, invoicesUnpaid: 0, invoicedTotal: 0, collectedTotal: 0, outstandingTotal: 0, overdueTotal: 0,
    purchasesTotal: 0, purchasesOpen: 0, purchasesValue: 0,
  };
  try {
    const [customers, companies, activities, products, quotes, orders, invoices, purchases] = await Promise.all([
      CRM.listCustomers(sb, { limit: 500 }),
      CRM.listCompanies(sb, { limit: 500 }),
      CRM.listActivities(sb, { limit: 20 }),
      listProducts(sb, { limit: 500 }).catch(() => []),
      listQuotes(sb, { limit: 500 }).catch(() => []),
      listOrders(sb, { limit: 500 }).catch(() => []),
      listInvoices(sb, { limit: 500 }).catch(() => []),
      listPurchases(sb, { limit: 500 }).catch(() => []),
    ]);
    out.customers = customers.length;
    out.companies = companies.length;
    out.activities = activities.length;
    out.products = products.length;
    out.quotesTotal = quotes.length;
    out.quotesDraft = quotes.filter((q) => q.status === 'DRAFT').length;
    out.quotesSent = quotes.filter((q) => q.status === 'SENT').length;
    out.quotesAccepted = quotes.filter((q) => q.status === 'ACCEPTED').length;
    out.quotesAcceptedValue = quotes.filter((q) => q.status === 'ACCEPTED').reduce((s, q) => s + Number(q.total || 0), 0);
    out.ordersTotal = orders.length;
    out.ordersOpen = orders.filter((o) => ['CONFIRMED', 'IN_PRODUCTION', 'READY'].includes(o.status)).length;
    out.ordersDelivered = orders.filter((o) => o.status === 'DELIVERED').length;
    // Ricavo reale = ordini non annullati (confermati→consegnati), semanticamente corretto.
    out.ordersRevenue = orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + Number(o.total || 0), 0);
    const activeInv = invoices.filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT');
    out.invoicesTotal = invoices.length;
    out.invoicesUnpaid = activeInv.filter((i) => balanceDue(i) > 0).length;
    out.invoicedTotal = activeInv.reduce((s, i) => s + Number(i.total || 0), 0);
    out.collectedTotal = activeInv.reduce((s, i) => s + Number(i.paid_total || 0), 0);
    out.outstandingTotal = activeInv.reduce((s, i) => s + Math.max(0, balanceDue(i)), 0);
    const today = new Date().toISOString().slice(0, 10);
    out.overdueTotal = activeInv.filter((i) => i.status !== 'PAID' && i.due_date && i.due_date < today)
      .reduce((s, i) => s + Math.max(0, balanceDue(i)), 0);
    out.purchasesTotal = purchases.length;
    out.purchasesOpen = purchases.filter((p) => ['ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status)).length;
    out.purchasesValue = purchases.filter((p) => p.status !== 'CANCELLED').reduce((s, p) => s + Number(p.total || 0), 0);
    out.b2b = customers.filter((c) => c.type === 'B2B').length;
    out.b2c = customers.filter((c) => c.type !== 'B2B').length;
    out.totalValue = customers.reduce((s, c) => s + Number(c.value_cached || 0), 0);
    out.recentCustomers = customers.slice(0, 5);
    out.recentActivities = activities.slice(0, 5);
  } catch (e) {
    out.error = e;
  }
  return out;
}
