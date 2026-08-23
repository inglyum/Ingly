// INGLY OS V2 — Ricerca globale (cross-module). Aggregazione DERIVATA sulle
// query esistenti: nessuna tabella nuova, nessuna migrazione. Interroga in
// parallelo clienti, prodotti, preventivi, ordini, fatture, fornitori e
// spedizioni; il filtro server-side (.or ilike) è rinforzato da un match
// client-side così la ricerca è coerente anche sui mock/demo.
import { friendlyError } from './crm.js';
import { listCustomers } from './crm.js';
import { listProducts } from './catalog.js';
import { listQuotes } from './quotes.js';
import { listOrders } from './orders.js';
import { listInvoices } from './invoices.js';
import { listSuppliers } from './suppliers.js';
import { listShipments } from './logistics.js';
export { friendlyError };

export const MIN_QUERY = 2;

const norm = (s) => String(s == null ? '' : s).toLowerCase().trim();
const hit = (q, ...fields) => { const s = norm(q); return s === '' || fields.some((f) => norm(f).includes(s)); };
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ogni gruppo: { type, icon, label, route, items:[{id,label,sublabel,route}] }.
// Ritorna sempre struttura completa (mai eccezioni verso l'alto).
export async function globalSearch(sb, query, opts = {}) {
  const q = norm(query);
  const groups = [];
  if (q.length < MIN_QUERY) return { query: q, groups, total: 0, tooShort: true, error: null };
  const lim = opts.limitPerGroup || 8;
  let error = null;
  try {
    const [customers, products, quotes, orders, invoices, suppliers, shipments] = await Promise.all([
      listCustomers(sb, { search: query, limit: 50 }).catch(() => []),
      listProducts(sb, { search: query, limit: 50 }).catch(() => []),
      listQuotes(sb, { search: query, limit: 50 }).catch(() => []),
      listOrders(sb, { search: query, limit: 50 }).catch(() => []),
      listInvoices(sb, { search: query, limit: 50 }).catch(() => []),
      listSuppliers(sb, { search: query, limit: 50 }).catch(() => []),
      listShipments(sb, { limit: 100 }).catch(() => []),
    ]);
    const push = (type, icon, label, route, items) => { if (items.length) groups.push({ type, icon, label, route, items: items.slice(0, lim) }); };

    push('customer', '👥', 'Clienti', 'clients',
      (customers || []).filter((c) => hit(query, c.name, c.email, c.phone))
        .map((c) => ({ id: c.id, label: c.name || '—', sublabel: [c.type, c.email].filter(Boolean).join(' · '), route: 'clients' })));

    push('product', '📚', 'Catalogo', 'catalog',
      (products || []).filter((p) => hit(query, p.name, p.sku))
        .map((p) => ({ id: p.id, label: p.name || '—', sublabel: [p.sku, p.price != null ? eur(p.price) : null].filter(Boolean).join(' · '), route: 'catalog' })));

    push('quote', '🧾', 'Preventivi', 'quotes',
      (quotes || []).filter((x) => hit(query, x.number, x.customer_name))
        .map((x) => ({ id: x.id, label: x.number || '—', sublabel: [x.customer_name, x.total != null ? eur(x.total) : null].filter(Boolean).join(' · '), route: 'quotes' })));

    push('order', '📦', 'Ordini', 'gestione_ordini',
      (orders || []).filter((x) => hit(query, x.number, x.customer_name))
        .map((x) => ({ id: x.id, label: x.number || '—', sublabel: [x.customer_name, x.total != null ? eur(x.total) : null].filter(Boolean).join(' · '), route: 'gestione_ordini' })));

    push('invoice', '🧮', 'Fatture', 'invoices',
      (invoices || []).filter((x) => hit(query, x.number, x.customer_name))
        .map((x) => ({ id: x.id, label: x.number || '—', sublabel: [x.customer_name, x.total != null ? eur(x.total) : null].filter(Boolean).join(' · '), route: 'invoices' })));

    push('supplier', '🚚', 'Fornitori', 'suppliers',
      (suppliers || []).filter((x) => hit(query, x.name, x.vat, x.email))
        .map((x) => ({ id: x.id, label: x.name || '—', sublabel: [x.vat, x.email].filter(Boolean).join(' · '), route: 'suppliers' })));

    push('shipment', '📮', 'Spedizioni', 'logistics',
      (shipments || []).filter((x) => hit(query, x.number, x.customer_name, x.tracking))
        .map((x) => ({ id: x.id, label: x.number || '—', sublabel: [x.customer_name, x.tracking].filter(Boolean).join(' · '), route: 'logistics' })));
  } catch (e) { error = e; }
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  return { query: q, groups, total, tooShort: false, error };
}
