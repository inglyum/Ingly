// INGLY OS V2 — Audit Log (data-layer, sola lettura). Legge le operazioni
// registrate dai trigger server-side. La scrittura è esclusiva del DB.
import { friendlyError } from './crm.js';
export { friendlyError };

export const OP_LABEL = { INSERT: 'Creazione', UPDATE: 'Modifica', DELETE: 'Eliminazione' };
export const TABLE_LABEL = {
  sales_invoice: 'Fattura', sales_order: 'Ordine', sales_payment: 'Incasso',
  catalog_product: 'Prodotto', tenant_settings: 'Impostazioni',
};

export async function listAudit(sb, opts = {}) {
  let q = sb.from('audit_log').select('id,tenant_id,table_name,op,row_id,actor,at');
  if (opts.table) q = q.eq('table_name', opts.table);
  if (opts.op) q = q.eq('op', opts.op);
  const { data, error } = await q.order('at', { ascending: false }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}

export function tableLabel(t) { return TABLE_LABEL[t] || t; }
export function opLabel(o) { return OP_LABEL[o] || o; }
