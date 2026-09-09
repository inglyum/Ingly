// INGLY OS V2 — Materiali (master-data). Un materiale È un catalog_product con
// kind='material': UNA sola source of truth. Eredita Magazzino/Acquisti/Quoter/
// Produzione. Questo layer filtra i materiali e li arricchisce con lo stock reale
// (giacenza/impegnato/in arrivo/disponibile), riusando warehouse.js.
import { friendlyError, canWrite, canDelete } from './crm.js';
import { createProduct, updateProduct, softDeleteProduct } from './catalog.js';
import { listMovements, committedByProduct, incomingByProduct, stockLevels, isBelowMin } from './warehouse.js';
export { friendlyError, canWrite, canDelete };

export const MATERIAL_KIND = 'material';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function listMaterials(sb, opts = {}) {
  const [matsRes, movements, committed, incoming] = await Promise.all([
    sb.from('catalog_product').select('*').eq('kind', MATERIAL_KIND).is('deleted_at', null).order('name', { ascending: true }),
    listMovements(sb, { limit: 5000 }).catch(() => []),
    committedByProduct(sb).catch(() => ({})),
    incomingByProduct(sb).catch(() => ({})),
  ]);
  const mats = (matsRes.data || []);
  const lv = stockLevels(movements);
  return mats.map((m) => {
    const onHand = lv[m.id] || 0; const comm = committed[m.id] || 0; const inc = incoming[m.id] || 0;
    const available = r2(onHand - comm);
    return { ...m, onHand: r2(onHand), committed: r2(comm), incoming: r2(inc), available, below: isBelowMin({ ...m, available }), stockValue: r2(onHand * (Number(m.cost) || 0)) };
  }).filter((m) => (opts.onlyBelow ? m.below : true));
}

export async function getMaterial(sb, id) {
  const { data, error } = await sb.from('catalog_product').select('*').eq('id', id).maybeSingle();
  if (error) throw error; return data || null;
}

const CLEAN = ['name', 'sku', 'category', 'subcategory', 'material_type', 'unit', 'cost', 'cost_per_mq', 'cost_per_kg', 'supplier_id', 'min_stock', 'reorder_point', 'reorder_qty', 'image_url', 'notes', 'active'];
function sanitize(patch) {
  const out = {};
  for (const k of CLEAN) if (k in patch) out[k] = patch[k];
  for (const k of ['cost', 'cost_per_mq', 'cost_per_kg', 'min_stock', 'reorder_point', 'reorder_qty']) {
    if (k in out) out[k] = out[k] === '' || out[k] == null ? null : Math.max(0, Number(out[k]) || 0);
  }
  if ('supplier_id' in out && !out.supplier_id) out.supplier_id = null;
  if ('active' in out) out.active = !!out.active;
  return out;
}

export async function createMaterial(sb, tenantId, data) {
  const clean = sanitize(data || {});
  if (!clean.name) throw new Error('Nome obbligatorio.');
  return createProduct(sb, tenantId, { ...clean, kind: MATERIAL_KIND });
}

export async function updateMaterial(sb, id, patch) {
  return updateProduct(sb, id, sanitize(patch || {}));
}

export async function softDeleteMaterial(sb, id) { return softDeleteProduct(sb, id); }

// Costo/mq effettivo del materiale per lo Smart Quoter (cost_per_mq o cost).
export function materialCostPerMq(m) {
  if (!m) return 0;
  if (Number(m.cost_per_mq) > 0) return r2(m.cost_per_mq);
  return r2(Number(m.cost) || 0);
}

// Classifica un materiale in una vista tipizzata dal suo material_type/categoria.
// Vernici e Componenti sono viste sulla stessa master-data (nessuna anagrafica
// duplicata): non tabelle separate.
export function materialTypeGroup(m) {
  const t = String((m && (m.material_type || m.subcategory || m.category)) || '').toLowerCase();
  if (/vern|paint|bombolet|smalt/.test(t)) return 'paint';
  if (/compon|minuter|gadget|led|vite|magnet|accessor/.test(t)) return 'component';
  return 'material';
}

export const TYPE_GROUPS = [
  { k: '', label: 'Tutti' }, { k: 'material', label: 'Materiali' },
  { k: 'paint', label: 'Vernici' }, { k: 'component', label: 'Componenti' },
];
