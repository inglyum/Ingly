// INGLY OS V2 — configurazione runtime (SOLO da env, mai segreti hardcoded).
// La config arriva da window.INGLY_ENV, impostata da app-v2/env.js (git-ignored),
// generato dalle variabili d'ambiente. In assenza → stato "config richiesta".
// SOLO chiavi browser-safe (URL + publishable/anon). MAI service-role qui.
export function getConfig() {
  const e = (typeof window !== 'undefined' && window.INGLY_ENV) || {};
  const url = e.SUPABASE_URL || '';
  const anon = e.SUPABASE_ANON_KEY || e.SUPABASE_PUBLISHABLE_KEY || '';
  return {
    env: e.ENVIRONMENT || 'unknown',
    url,
    anonKey: anon,
    configured: Boolean(url && anon),
  };
}

// Guardia di sicurezza: non deve mai comparire una service-role key nel client.
export function assertBrowserSafe(cfg) {
  const k = cfg.anonKey || '';
  // le service_role JWT contengono il claim role=service_role; blocco esplicito.
  if (/service_role/i.test(k)) {
    throw new Error('SECURITY: service-role key rilevata nel client. Usa SOLO la publishable/anon key.');
  }
  return true;
}
