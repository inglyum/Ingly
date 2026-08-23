// INGLY OS V2 — Magazzino (data-layer Supabase). Ledger movimenti stock e
// GIACENZA derivata (nessuna tabella giacenza duplicata). Tipi: IN (carico),
// OUT (scarico), ADJUST (rettifica, quantità firmata), TRANSFER (trasferimento).
import { friendlyError, canWrite, canDelete } from './crm.js';
import { listProducts } from './catalog.js';
export { friendlyError, canWrite, canDelete };

export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST', 'TRANSFER'];
export const TYPE_LABEL = { IN: 'Carico', OUT: 'Scarico', ADJUST: 'Rettifica', TRANSFER: 'Trasferimento' };

// delta sulla giacenza totale (coerente con la colonna generata DB).
export function movementDelta(m) {
  const q = Number(m.quantity) || 0;
  if (m.type === 'IN') return q;
  if (m.type === 'OUT') return -q;
  if (m.type === 'ADJUST') return q;
  return 0; // TRANSFER netto 0 sul totale
}

export async function listMovements(sb, opts = {}) {
  let q = sb.from('stock_movement')
    .select('id,product_id,type,quantity,location,location_to,reference_type,note,created_at')
    .is('deleted_at', null);
  if (opts.productId) q = q.eq('product_id', opts.productId);
  if (opts.type) q = q.eq('type', opts.type);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 300);
  if (error) throw error;
  return data || [];
}

export async function createMovement(sb, tenantId, data) {
  const type = data.type; const qty = Number(data.quantity) || 0;
  if (!MOVEMENT_TYPES.includes(type)) throw new Error('Tipo movimento non valido.');
  if (qty === 0) throw new Error('La quantità non può essere zero.');
  if (type !== 'ADJUST' && qty < 0) throw new Error('La quantità deve essere positiva.');
  const row = {
    tenant_id: tenantId, product_id: data.product_id, type, quantity: qty,
    location: data.location || 'MAIN', location_to: data.location_to || null,
    reference_type: data.reference_type || 'manual', reference_id: data.reference_id || null,
    note: data.note || null,
  };
  if (!row.product_id) throw new Error('Seleziona un prodotto.');
  const { data: out, error } = await sb.from('stock_movement').insert(row).select().single();
  if (error) throw error; return out;
}

export async function voidMovement(sb, id) {
  const { error } = await sb.from('stock_movement').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Giacenza per prodotto (mappa product_id → qty) dai movimenti non stornati.
export function stockLevels(movements) {
  const lv = {};
  for (const m of movements || []) lv[m.product_id] = (lv[m.product_id] || 0) + movementDelta(m);
  for (const k of Object.keys(lv)) lv[k] = Math.round(lv[k] * 100) / 100;
  return lv;
}

// Riepilogo giacenze arricchito con dati prodotto + valore (giacenza*costo).
export async function loadInventory(sb, opts = {}) {
  const [movements, products] = await Promise.all([
    listMovements(sb, { limit: 2000 }),
    listProducts(sb, { limit: 1000 }),
  ]);
  const lv = stockLevels(movements);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  let rows = products.map((p) => {
    const qty = lv[p.id] || 0;
    return { id: p.id, name: p.name, sku: p.sku, cost: Number(p.cost) || 0, qty, value: Math.round(qty * (Number(p.cost) || 0) * 100) / 100 };
  });
  // includi eventuali movimenti su prodotti non più in lista (edge)
  for (const pid of Object.keys(lv)) if (!byId[pid]) rows.push({ id: pid, name: '(prodotto rimosso)', sku: '—', cost: 0, qty: lv[pid], value: 0 });
  if (opts.onlyStock) rows = rows.filter((r) => r.qty !== 0);
  if (opts.search) { const s = String(opts.search).toLowerCase(); rows = rows.filter((r) => (r.name || '').toLowerCase().includes(s) || (r.sku || '').toLowerCase().includes(s)); }
  rows.sort((a, b) => b.qty - a.qty);
  const totalValue = Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100;
  const totalUnits = Math.round(rows.reduce((s, r) => s + r.qty, 0) * 100) / 100;
  return { rows, totalValue, totalUnits, skuInStock: rows.filter((r) => r.qty > 0).length };
}
