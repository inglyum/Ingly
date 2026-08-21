// INGLY OS V2 — client Supabase (browser-safe). Usa la lib vendored (CSP-safe).
// Nessun segreto hardcoded: prende URL + anon key dalla config runtime.
import { getConfig, assertBrowserSafe } from './config.js';

let _client = null;

// Consente l'iniezione di un client mock nei test (nessuna rete).
export function __setClientForTest(mock) { _client = mock; }

export function getSupabase() {
  if (_client) return _client;
  const cfg = getConfig();
  if (!cfg.configured) return null;               // stato "config richiesta"
  assertBrowserSafe(cfg);
  const lib = (typeof window !== 'undefined' && window.supabase) || null;
  if (!lib || !lib.createClient) {
    throw new Error('supabase-js (vendored) non caricato: includi app-v2/vendor/supabase.js');
  }
  _client = lib.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}
