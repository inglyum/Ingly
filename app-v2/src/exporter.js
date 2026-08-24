// INGLY OS V2 — Backup / Export / Portabilità (data-layer, sola lettura).
// Esporta i dati del tenant in JSON completo o CSV per entità. Client-side,
// CSP-safe, nessuna dipendenza. Non modifica nulla.
import { friendlyError } from './crm.js';
export { friendlyError };

// Tabelle esportabili (dati del tenant). Etichette per la UI.
export const TABLES = [
  { t: 'crm_customer', label: 'Clienti' },
  { t: 'crm_company', label: 'Aziende' },
  { t: 'catalog_product', label: 'Catalogo' },
  { t: 'sales_quote', label: 'Preventivi' },
  { t: 'sales_quote_line', label: 'Righe preventivo' },
  { t: 'sales_order', label: 'Ordini' },
  { t: 'sales_order_line', label: 'Righe ordine' },
  { t: 'sales_invoice', label: 'Fatture' },
  { t: 'sales_invoice_line', label: 'Righe fattura' },
  { t: 'sales_payment', label: 'Incassi' },
  { t: 'supplier', label: 'Fornitori' },
  { t: 'purchase_order', label: 'Acquisti' },
  { t: 'purchase_order_line', label: 'Righe acquisto' },
  { t: 'stock_movement', label: 'Movimenti magazzino' },
  { t: 'project', label: 'Commesse' },
  { t: 'shipment', label: 'Spedizioni' },
  { t: 'shipment_line', label: 'Righe spedizione' },
  { t: 'time_entry', label: 'Ore lavoro' },
  { t: 'recurring_invoice', label: 'Fatture ricorrenti' },
  { t: 'fixed_cost', label: 'Costi fissi' },
  { t: 'tenant_settings', label: 'Impostazioni' },
];

async function fetchAll(sb, table) {
  try { const { data, error } = await sb.from(table).select('*'); if (error) throw error; return data || []; }
  catch (_) { return []; }
}

// Backup completo: { version, generatedAt, tables:{ name: rows[] }, counts }.
export async function buildBackup(sb) {
  const out = { version: 1, generatedAt: new Date().toISOString(), tables: {}, counts: {} };
  await Promise.all(TABLES.map(async ({ t }) => { const rows = await fetchAll(sb, t); out.tables[t] = rows; out.counts[t] = rows.length; }));
  return out;
}

// Serializza righe in CSV (RFC-4180: virgolette raddoppiate, campi quotati).
export function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const cols = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set()));
  const escv = (v) => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = cols.map(escv).join(',');
  const lines = rows.map((r) => cols.map((c) => escv(r[c])).join(','));
  return [header, ...lines].join('\n');
}

export async function exportTableCSV(sb, table) {
  const rows = await fetchAll(sb, table);
  return { csv: toCSV(rows), count: rows.length };
}
