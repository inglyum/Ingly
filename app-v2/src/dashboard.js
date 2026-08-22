// INGLY OS V2 — Dashboard data-layer. Metriche reali derivate dal CRM
// (nessun dato finto). Riusa le query CRM esistenti: nessuna tabella nuova.
import * as CRM from './crm.js';
import { listProducts } from './catalog.js';
import { listQuotes } from './quotes.js';

// Aggrega i KPI CRM+catalogo+preventivi. Ritorna sempre una struttura completa
// (0 se vuoto), mai eccezioni verso l'alto: errori → metriche a 0.
export async function loadDashboard(sb) {
  const out = {
    customers: 0, companies: 0, activities: 0, products: 0, b2b: 0, b2c: 0,
    totalValue: 0, recentCustomers: [], recentActivities: [], error: null,
    quotesTotal: 0, quotesDraft: 0, quotesSent: 0, quotesAccepted: 0, quotesAcceptedValue: 0,
  };
  try {
    const [customers, companies, activities, products, quotes] = await Promise.all([
      CRM.listCustomers(sb, { limit: 500 }),
      CRM.listCompanies(sb, { limit: 500 }),
      CRM.listActivities(sb, { limit: 20 }),
      listProducts(sb, { limit: 500 }).catch(() => []),
      listQuotes(sb, { limit: 500 }).catch(() => []),
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
