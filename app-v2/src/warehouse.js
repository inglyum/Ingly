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

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Stock IMPEGNATO (committed): quantità sulle righe degli ordini di vendita
// aperti (non consegnati/annullati). Derivato, nessuna tabella nuova.
export async function committedByProduct(sb) {
  const map = {};
  try {
    const { data: orders } = await sb.from('sales_order').select('id,status').is('deleted_at', null);
    const open = (orders || []).filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));
    if (!open.length) return map;
    const ids = new Set(open.map((o) => o.id));
    const { data: lines } = await sb.from('sales_order_line').select('order_id,product_id,quantity');
    for (const l of lines || []) if (l.product_id && ids.has(l.order_id)) map[l.product_id] = (map[l.product_id] || 0) + Number(l.quantity || 0);
  } catch (_) { /* ordini non disponibili */ }
  return map;
}

// Stock IN ARRIVO (incoming): quantità sulle righe degli ordini di acquisto
// aperti (ordinati/parziali, non ricevuti/annullati). Derivato.
export async function incomingByProduct(sb) {
  const map = {};
  try {
    const { data: pos } = await sb.from('purchase_order').select('id,status').is('deleted_at', null);
    const open = (pos || []).filter((o) => ['ORDERED', 'PARTIALLY_RECEIVED'].includes(o.status));
    if (!open.length) return map;
    const ids = new Set(open.map((o) => o.id));
    const { data: lines } = await sb.from('purchase_order_line').select('purchase_order_id,product_id,quantity');
    for (const l of lines || []) if (l.product_id && ids.has(l.purchase_order_id)) map[l.product_id] = (map[l.product_id] || 0) + Number(l.quantity || 0);
  } catch (_) { /* acquisti non disponibili */ }
  return map;
}

// Quantità consigliata da riordinare per un articolo sotto soglia.
export function reorderQtyFor(row) {
  if (Number(row.reorder_qty) > 0) return r2(row.reorder_qty);
  const target = Math.max(Number(row.reorder_point) || 0, Number(row.min_stock) || 0);
  const gap = target - (Number(row.available) || 0);
  return gap > 0 ? r2(gap) : 0;
}
export function isBelowMin(row) {
  const threshold = Math.max(Number(row.reorder_point) || 0, Number(row.min_stock) || 0);
  return threshold > 0 && (Number(row.available) || 0) < threshold;
}

// Riepilogo giacenze arricchito: on-hand (ledger), impegnato, in arrivo,
// disponibile, soglie, valore (giacenza*costo). onlyBelow filtra i critici.
export async function loadInventory(sb, opts = {}) {
  const [movements, products, committed, incoming] = await Promise.all([
    listMovements(sb, { limit: 2000 }),
    listProducts(sb, { limit: 1000 }),
    committedByProduct(sb),
    incomingByProduct(sb),
  ]);
  const lv = stockLevels(movements);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  let rows = products.map((p) => {
    const qty = lv[p.id] || 0;
    const comm = committed[p.id] || 0; const inc = incoming[p.id] || 0;
    const available = r2(qty - comm);
    const row = {
      id: p.id, name: p.name, sku: p.sku, cost: Number(p.cost) || 0,
      qty, committed: r2(comm), incoming: r2(inc), available,
      min_stock: Number(p.min_stock) || 0, reorder_point: Number(p.reorder_point) || 0, reorder_qty: Number(p.reorder_qty) || 0,
      value: r2(qty * (Number(p.cost) || 0)),
    };
    row.below = isBelowMin(row); row.toReorder = row.below ? reorderQtyFor(row) : 0;
    return row;
  });
  for (const pid of Object.keys(lv)) if (!byId[pid]) rows.push({ id: pid, name: '(prodotto rimosso)', sku: '—', cost: 0, qty: lv[pid], committed: 0, incoming: 0, available: lv[pid], min_stock: 0, reorder_point: 0, reorder_qty: 0, value: 0, below: false, toReorder: 0 });
  if (opts.onlyStock) rows = rows.filter((r) => r.qty !== 0);
  if (opts.onlyBelow) rows = rows.filter((r) => r.below);
  if (opts.search) { const s = String(opts.search).toLowerCase(); rows = rows.filter((r) => (r.name || '').toLowerCase().includes(s) || (r.sku || '').toLowerCase().includes(s)); }
  rows.sort((a, b) => b.qty - a.qty);
  const totalValue = r2(rows.reduce((s, r) => s + r.value, 0));
  const totalUnits = r2(rows.reduce((s, r) => s + r.qty, 0));
  const belowCount = rows.filter((r) => r.below).length;
  return { rows, totalValue, totalUnits, skuInStock: rows.filter((r) => r.qty > 0).length, belowCount };
}
