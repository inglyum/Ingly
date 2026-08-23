-- INGLY OS V2 — Rollback 0002 rbac_seed. Rimuove i 9 ruoli base seminati e la
-- tabella cache security.role_perm_cache. ATTENZIONE: non eseguire se moduli
-- successivi (0006/0007/0008/0009/0010) sono ancora applicati e dipendono dai
-- ruoli/cache — eseguire prima i rispettivi rollback. Idempotente.
-- ==========================================================================
-- Nota: role_permission e permission per i moduli sono rimossi dai rispettivi
-- rollback; qui si rimuovono solo i ruoli base e la struttura cache.
delete from public.role where key in
  ('OWNER','ADMIN','MANAGER','SALES','DESIGNER','PRODUCTION','WAREHOUSE','FINANCE','VIEWER');

drop table if exists security.role_perm_cache;
-- lo schema security resta (potrebbe contenere altri oggetti); rimuoverlo solo
-- se vuoto e non più necessario:
-- drop schema if exists security;
-- ==========================================================================
