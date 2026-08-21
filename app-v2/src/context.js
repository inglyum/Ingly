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

// Carica dati di contorno via RLS (profilo, ruoli seed) — richiede client reale.
export async function loadContext(supabase, session) {
  const ctx = claimsFromSession(session);
  if (!supabase) return ctx;
  try {
    const { data: profile } = await supabase.from('profile').select('*').eq('id', ctx.userId).maybeSingle();
    ctx.profile = profile || null;
  } catch (_) { ctx.profile = null; }
  try {
    // authenticated può leggere i ruoli seed (lookup globale)
    const { data: roles } = await supabase.from('role').select('key,name,level').order('level');
    ctx.roleCatalog = roles || [];
  } catch (_) { ctx.roleCatalog = []; }
  return ctx;
}
