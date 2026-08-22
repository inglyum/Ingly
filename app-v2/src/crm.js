// INGLY OS V2 — CRM data-layer (Supabase). Query reali su crm_* (RLS per tenant).
// Nessun dato finto: se non connesso/nessuna riga → liste vuote. Il tenant_id è
// forzato lato scrittura; la RLS lo verifica anche server-side.

function esc(s) { return String(s == null ? '' : s).replace(/[%,()]/g, ' ').trim(); }

export async function listCustomers(sb, opts = {}) {
  const { search, segment, type, sort = 'created_at', dir = 'desc', limit = 100 } = opts;
  let q = sb.from('crm_customer')
    .select('id,name,email,phone,segment,type,value_cached,company_id')
    .is('deleted_at', null);
  if (segment) q = q.eq('segment', segment);
  if (type) q = q.eq('type', type);
  if (search) { const s = esc(search); q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%`); }
  q = q.order(sort, { ascending: dir === 'asc' }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getCustomer(sb, id) {
  const { data: customer, error } = await sb.from('crm_customer').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: contacts } = await sb.from('crm_contact').select('*').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: true });
  const { data: activities } = await sb.from('crm_activity').select('*').eq('customer_id', id).order('occurred_at', { ascending: false });
  return { customer: customer || null, contacts: contacts || [], activities: activities || [] };
}

// ── COMPANY CRUD ────────────────────────────────────────────────────────────
export async function listCompanies(sb, opts = {}) {
  let q = sb.from('crm_company').select('id,name,vat,tags').is('deleted_at', null);
  if (opts.search) { const s = esc(opts.search); q = q.or(`name.ilike.%${s}%,vat.ilike.%${s}%`); }
  const { data, error } = await q.order('name', { ascending: true }).limit(opts.limit || 200);
  if (error) throw error;
  return data || [];
}
export async function createCompany(sb, tenantId, data) {
  const { data: out, error } = await sb.from('crm_company').insert({ ...data, tenant_id: tenantId }).select().single();
  if (error) throw error; return out;
}
export async function updateCompany(sb, id, patch) {
  const { data: out, error } = await sb.from('crm_company').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return out;
}
export async function softDeleteCompany(sb, id) {
  const { error } = await sb.from('crm_company').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// ── CONTACT update / soft-delete ────────────────────────────────────────────
export async function updateContact(sb, id, patch) {
  const { data: out, error } = await sb.from('crm_contact').update(patch).eq('id', id).select().single();
  if (error) throw error; return out;
}
export async function softDeleteContact(sb, id) {
  const { error } = await sb.from('crm_contact').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error; return true;
}

// Traduce errori RLS/permission in messaggi comprensibili (no dettagli SQL).
export function friendlyError(e) {
  const m = String((e && (e.message || e.hint || e.code)) || e || '').toLowerCase();
  if (m.includes('permission denied') || m.includes('row-level security') || m.includes('42501') || m.includes('violates row-level'))
    return 'Non hai i permessi necessari per questa operazione.';
  return 'Operazione non riuscita. Riprova.';
}

export async function createCustomer(sb, tenantId, data) {
  const row = { ...data, tenant_id: tenantId };
  const { data: out, error } = await sb.from('crm_customer').insert(row).select().single();
  if (error) throw error;
  return out;
}

export async function updateCustomer(sb, id, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  const { data: out, error } = await sb.from('crm_customer').update(row).eq('id', id).select().single();
  if (error) throw error;
  return out;
}

export async function softDeleteCustomer(sb, id) {
  const { error } = await sb.from('crm_customer').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return true;
}

export async function addContact(sb, tenantId, customerId, data) {
  const { data: out, error } = await sb.from('crm_contact')
    .insert({ ...data, tenant_id: tenantId, customer_id: customerId }).select().single();
  if (error) throw error;
  return out;
}

export async function addActivity(sb, tenantId, customerId, data) {
  const { data: out, error } = await sb.from('crm_activity')
    .insert({ ...data, tenant_id: tenantId, customer_id: customerId }).select().single();
  if (error) throw error;
  return out;
}

// RBAC lato UI (il confine reale è la RLS server-side).
const WRITE_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SALES'];
const DELETE_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
export function canWrite(role) { return WRITE_ROLES.includes(role); }
export function canDelete(role) { return DELETE_ROLES.includes(role); }
