# Staging migrations — NON ESEGUITE

Questi file sono **scaffolding da revisionare**, NON applicati.
Ambiente staging Supabase **non disponibile/identificabile** in questa sessione
→ nessuna migrazione è stata eseguita (CRITICAL ENVIRONMENT RULE, Fase 4).

Per applicarle servono (forniti dall'utente, mai in repo):
- Un progetto Supabase **staging dedicato** (ref diverso dalla produzione "Ingly 91").
- `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_SERVICE_ROLE` come secret in CI/vault.
- Supabase CLI + `supabase link` allo staging, poi review e `migration up`.

Vedi `docs/database/staging-migration-policy.md`.
