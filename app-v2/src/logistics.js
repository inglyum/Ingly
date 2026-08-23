// INGLY OS V2 — Logistica/Spedizioni (data-layer Supabase). Workflow Ordine →
// Preparazione → Picking → Packing → Spedizione → Consegna. Lo SCARICO stock
// (movimenti OUT) avviene alla SPEDIZIONE; la consegna aggiorna solo stati.
// Integra sales_order + stock_movement (nessun ledger duplicato).
import { friendlyError, canWrite, canDelete } from './crm.js';
import { getOrder } from './orders.js';
import { stockLevels, listMovements, committedByProduct } from './warehouse.js';
export { friendlyError, canWrite, canDelete };

export const SHIP_STATUSES = ['PREPARING', 'PICKED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
export const NEXT_STATUS = { PREPARING: 'PICKED', PICKED: 'PACKED', PACKED: 'SHIPPED' };

export async function listShipments(sb, opts = {}) {
  let q = sb.from('shipment').select('id,number,order_id,customer_name,status,carrier,tracking,expected_date,shipped_date,delivered_date').is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.statuses) q = q.eq('status', opts.statuses); // singolo per il mock; UI filtra lato client per set
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 300);
  if (error) throw error;
  return data || [];
}

export async function getShipment(sb, id) {
  const { data: shipment, error } = await sb.from('shipment').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: lines } = await sb.from('shipment_line').select('*').eq('shipment_id', id).order('sort_order', { ascending: true });
  return { shipment: shipment || null, lines: lines || [] };
}

// Crea la spedizione da un ordine di vendita: righe con qty_ordered = quantità
// ordinata; qty_prepared precompilata = qty_ordered.
export async function createShipmentFromOrder(sb, tenantId, orderId) {
  const { order, lines } = await getOrder(sb, orderId);
  if (!order) throw new Error('ordine non trovato');
  const { data: sh, error } = await sb.from('shipment').insert({
    tenant_id: tenantId, order_id: order.id, customer_id: order.customer_id,
    customer_name: order.customer_name, status: 'PREPARING', notes: order.notes || null,
  }).select().single();
  if (error) throw error;
  let i = 0;
  for (const l of lines) {
    if (!l.product_id) continue;
    await sb.from('shipment_line').insert({
      tenant_id: tenantId, shipment_id: sh.id, product_id: l.product_id,
      description: l.description, qty_ordered: Number(l.quantity) || 0, qty_prepared: Number(l.quantity) || 0,
      sort_order: i++,
    });
  }
  return sh;
}

export async function updateShipment(sb, id, patch) {
  const allowed = {};
  for (const k of ['carrier', 'tracking', 'ship_address', 'packages', 'weight_kg', 'expected_date', 'notes']) if (k in patch) allowed[k] = patch[k];
  allowed.updated_at = new Date().toISOString();
  const { data, error } = await sb.from('shipment').update(allowed).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function setLinePrepared(sb, lineId, qty) {
  const { data, error } = await sb.from('shipment_line').update({ qty_prepared: Number(qty) || 0, updated_at: new Date().toISOString() }).eq('id', lineId).select().single();
  if (error) throw error; return data;
}
export async function setStatus(sb, id, status) {
  if (!SHIP_STATUSES.includes(status)) throw new Error('stato non valido');
  const { data, error } = await sb.from('shipment').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function softDeleteShipment(sb, id) {
  const { error } = await sb.from('shipment').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Disponibilità reale per un set di prodotti (giacenza - impegnato). Fonte:
// ledger stock_movement + ordini vendita aperti.
export async function availabilityFor(sb, productIds) {
  const [movements, committed] = await Promise.all([listMovements(sb, { limit: 5000 }), committedByProduct(sb)]);
  const lv = stockLevels(movements);
  const out = {};
  for (const pid of productIds) out[pid] = Math.round(((lv[pid] || 0) - (committed[pid] || 0)) * 100) / 100;
  return out;
}

// SPEDIZIONE: scarica lo stock (OUT per riga = qty_prepared) e passa a SHIPPED.
// Guard: nessun backorder — non spedire più della giacenza disponibile a stock.
export async function ship(sb, tenantId, id, data = {}) {
  const { shipment, lines } = await getShipment(sb, id);
  if (!shipment) throw new Error('spedizione non trovata');
  if (shipment.status === 'SHIPPED' || shipment.status === 'DELIVERED') throw new Error('spedizione già evasa');
  // controllo giacenza (stock fisico, non disponibile: la merce esce fisicamente)
  const movements = await listMovements(sb, { limit: 5000 });
  const lv = stockLevels(movements);
  for (const l of lines) {
    const q = Number(l.qty_prepared) || 0;
    if (q <= 0 || !l.product_id) continue;
    if ((lv[l.product_id] || 0) < q) { const e = new Error(`Stock insufficiente per ${l.description} (disp. ${lv[l.product_id] || 0}, richiesti ${q})`); e.code = 'NOSTOCK'; throw e; }
  }
  // scarico
  for (const l of lines) {
    const q = Number(l.qty_prepared) || 0;
    if (q <= 0 || !l.product_id) continue;
    const { error } = await sb.from('stock_movement').insert({ tenant_id: tenantId, product_id: l.product_id, type: 'OUT', quantity: q, location: 'MAIN', reference_type: 'shipment', reference_id: id, note: 'Spedizione ' + (shipment.number || '') });
    if (error) throw error;
    await sb.from('shipment_line').update({ qty_shipped: q, updated_at: new Date().toISOString() }).eq('id', l.id);
  }
  const { data: out, error: e2 } = await sb.from('shipment').update({
    status: 'SHIPPED', carrier: data.carrier || shipment.carrier || null, tracking: data.tracking || shipment.tracking || null,
    shipped_date: data.shipped_date || new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (e2) throw e2;
  return out;
}

// CONSEGNA: stato DELIVERED (+ qty_delivered = qty_shipped), aggiorna l'ordine
// collegato a DELIVERED. Nessun movimento di stock (già scaricato in spedizione).
export async function deliver(sb, id) {
  const { shipment, lines } = await getShipment(sb, id);
  if (!shipment) throw new Error('spedizione non trovata');
  if (shipment.status !== 'SHIPPED') throw new Error('consegnabile solo dopo la spedizione');
  for (const l of lines) await sb.from('shipment_line').update({ qty_delivered: Number(l.qty_shipped) || 0, updated_at: new Date().toISOString() }).eq('id', l.id);
  const { data: out, error } = await sb.from('shipment').update({ status: 'DELIVERED', delivered_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  if (shipment.order_id) { try { await sb.from('sales_order').update({ status: 'DELIVERED', updated_at: new Date().toISOString() }).eq('id', shipment.order_id); } catch (_) { /* best effort */ } }
  return out;
}
