// INGLY OS V2 — contesto utente/tenant/ruolo, derivato da sessione + claim JWT.
// Il claim app_metadata.{tenant_ids,roles,active_tenant} è popolato lato server
// (Auth Hook). Qui lo leggiamo e carichiamo profilo/ruoli seed via RLS.

// Decodifica payload JWT (base64url) senza verificarne la firma (solo lettura claim).
export function decodeJwt(token) {
  try {
    const part = String(token).split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (_) { return {}; }
}

export function claimsFromSession(session) {
  const token = session && session.access_token;
  const c = token ? decodeJwt(token) : (session && session.claims) || {};
  const app = c.app_metadata || {};
  return {
    userId: c.sub || (session && session.user && session.user.id) || null,
    email: c.email || (session && session.user && session.user.email) || null,
    tenantIds: Array.isArray(app.tenant_ids) ? app.tenant_ids : [],
    roles: app.roles || {},               // { tenant_id: role_key }
    activeTenant: app.active_tenant || (Array.isArray(app.tenant_ids) ? app.tenant_ids[0] : null),
  };
}

export function roleForTenant(ctx, tenantId) {
  if (!ctx) return null;
  return (ctx.roles && ctx.roles[tenantId]) || null;
}

// Permessi CRM lato UI derivati dal ruolo (il confine reale è la RLS).
export const ROLE_ACTIONS = {
  OWNER:      ['read', 'create', 'update', 'delete', 'export'],
  ADMIN:      ['read', 'create', 'update', 'delete', 'export'],
  MANAGER:    ['read', 'create', 'update', 'delete', 'export'],
  SALES:      ['read', 'create', 'update', 'export'],
  DESIGNER:   ['read'],
  PRODUCTION: ['read'],
  WAREHOUSE:  ['read'],
  FINANCE:    ['read'],
  VIEWER:     ['read'],
};
export function permissionsForRole(role) { return (ROLE_ACTIONS[role] || []).slice(); }
export function can(ctx, action) {
  const role = ctx && roleForTenant(ctx, ctx.activeTenant);
  return permissionsForRole(role).includes(action);
}

// Risolve il contesto: PRIMA dai claim JWT; se assenti, FALLBACK dal DB via RLS
// (tenant_membership per i tenant, user_role→role per il ruolo). Additivo: se i
// claim ci sono, il DB non viene interrogato per tenant/role.
export async function loadContext(supabase, session) {
  const ctx = claimsFromSession(session);
  ctx.source = ctx.tenantIds.length ? 'claim' : 'none';
  if (!supabase || !ctx.userId) return ctx;

  // profilo (self)
  try {
    const { data: profile } = await supabase.from('profile').select('*').eq('id', ctx.userId).maybeSingle();
    ctx.profile = profile || null;
  } catch (_) { ctx.profile = null; }

  // FALLBACK tenant: se il claim non porta tenant, leggi la PROPRIA membership.
  if (!ctx.tenantIds.length) {
    try {
      const { data: mems } = await supabase.from('tenant_membership')
        .select('tenant_id,status').eq('user_id', ctx.userId).eq('status', 'active');
      if (mems && mems.length) {
        ctx.tenantIds = mems.map((m) => m.tenant_id);
        ctx.activeTenant = ctx.activeTenant || ctx.tenantIds[0];
        ctx.source = 'db';
      }
    } catch (_) { /* RLS potrebbe bloccare: vedi report Fase 12 */ }
  }

  // FALLBACK ruolo: se il claim non porta ruoli, leggi user_role→role.
  if (!ctx.roles || !Object.keys(ctx.roles).length) {
    ctx.roles = {};
    try {
      const { data: urs } = await supabase.from('user_role')
        .select('tenant_id, role:role_id(key)').eq('user_id', ctx.userId);
      (urs || []).forEach((u) => { ctx.roles[u.tenant_id] = (u.role && u.role.key) || u.role_key || null; });
    } catch (_) { /* RLS/seed */ }
  }

  // catalogo ruoli (lookup globale)
  try {
    const { data: roles } = await supabase.from('role').select('key,name,level').order('level', { ascending: true });
    ctx.roleCatalog = roles || [];
  } catch (_) { ctx.roleCatalog = []; }

  ctx.activeRole = roleForTenant(ctx, ctx.activeTenant);
  ctx.permissions = permissionsForRole(ctx.activeRole);
  return ctx;
}
