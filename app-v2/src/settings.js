// INGLY OS V2 — Impostazioni ERP per tenant (data-layer). Singleton per tenant.
// I default ricalcano la Knowledge Base. In questa fase le impostazioni sono
// SOLO memorizzate (default-OFF): non ancora cablate nei calcoli di
// pricing/numerazione (che restano autoritativi lato server coi valori KB).
import { friendlyError } from './crm.js';
export { friendlyError };

// Scrittura riservata a OWNER/ADMIN (più restrittiva di canWrite: le
// impostazioni governano fisco/numerazione/pricing).
export function canEditSettings(role) { return role === 'OWNER' || role === 'ADMIN'; }

export const DEFAULTS = {
  company_name: '', vat_number: '', address: '', city: '', email: '', phone: '',
  default_vat_rate: 22,
  labor_rate: 18, sfrido_pct: 15, markup_b2c: 3, markup_b2b: 2.5, markup_etsy: 3.5,
  quote_prefix: 'PREV', order_prefix: 'ORD', invoice_prefix: 'FATT',
  cash_tax_pct: 15, cash_reserve_pct: 10, cash_goals_pct: 15, cash_operational_pct: 60,
  // Fattura elettronica / SDI (cedente) — vuoti finché compilati dall'utente
  fiscal_code: '', tax_regime: '', rea_office: '', rea_number: '',
  sede_cap: '', sede_comune: '', sede_provincia: '', sede_nazione: 'IT',
};

const NUMERIC = new Set(['default_vat_rate', 'labor_rate', 'sfrido_pct', 'markup_b2c', 'markup_b2b', 'markup_etsy',
  'cash_tax_pct', 'cash_reserve_pct', 'cash_goals_pct', 'cash_operational_pct']);
const TEXT = new Set(['company_name', 'vat_number', 'address', 'city', 'email', 'phone',
  'quote_prefix', 'order_prefix', 'invoice_prefix',
  'fiscal_code', 'tax_regime', 'rea_office', 'rea_number',
  'sede_cap', 'sede_comune', 'sede_provincia', 'sede_nazione']);
const EDITABLE = [...NUMERIC, ...TEXT];

// La somma delle percentuali cassa dovrebbe fare 100 (KB 15/10/15/60).
export function cashBucketsValid(s) {
  const sum = Number(s.cash_tax_pct || 0) + Number(s.cash_reserve_pct || 0) + Number(s.cash_goals_pct || 0) + Number(s.cash_operational_pct || 0);
  return Math.abs(sum - 100) < 0.01;
}

export async function getSettings(sb, tenantId) {
  const { data, error } = await sb.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return { ...DEFAULTS, ...(data || {}), tenant_id: tenantId, _exists: !!data };
}

// Normalizza il patch alle sole colonne ammesse e ai tipi corretti.
function sanitize(patch) {
  const out = {};
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    if (NUMERIC.has(k)) { const n = Number(patch[k]); if (!Number.isNaN(n)) out[k] = n; }
    else out[k] = patch[k] == null ? null : String(patch[k]).trim();
  }
  return out;
}

// Upsert mock-friendly: update se esiste, altrimenti insert.
export async function saveSettings(sb, tenantId, patch) {
  const clean = sanitize(patch || {});
  const existing = await getSettings(sb, tenantId);
  if (existing._exists) {
    const { data, error } = await sb.from('tenant_settings').update({ ...clean, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).select().single();
    if (error) throw error; return { ...DEFAULTS, ...data };
  }
  const { data, error } = await sb.from('tenant_settings').insert({ ...DEFAULTS, ...clean, tenant_id: tenantId }).select().single();
  if (error) throw error; return { ...DEFAULTS, ...data };
}
