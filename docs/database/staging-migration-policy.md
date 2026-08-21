# INGLY OS V2 — Staging Migration Policy (4H)

> Fase 4H · documentazione. Regole per le migrazioni **solo staging**. Nessuna
> migrazione eseguita in questa sessione (ambiente staging non disponibile).

## 1. Principi
- **Staging only**: le migrazioni girano **esclusivamente** su un progetto Supabase
  di sviluppo/staging dedicato. **Mai** produzione.
- **Versionate**: file `NNNN_descrizione.sql` ordinati; ogni file idempotente dove
  possibile (`IF NOT EXISTS`).
- **Reversibili dove pratico**: ogni migrazione con nota di rollback o file `down`.
- **Reviewed before execution**: nessuna esecuzione senza revisione umana.
- **Mai** modificare/cancellare dati legacy o produzione.
- **Expand/contract**: cambi di schema in due passi (aggiungi → migra → rimuovi),
  mai `DROP`/rename distruttivi in un colpo solo.

## 2. Struttura repo
```
supabase/migrations/staging/   ← SQL versionato (NON eseguito qui)
supabase/tests/                ← test RLS/concorrenza/eventi (NON eseguiti qui)
```
I file di `staging/` sono **scaffolding da revisionare**: non vengono applicati
finché non esiste un progetto staging verificato e un revisore approva.

## 3. Procedura (quando lo staging sarà disponibile)
1. Creare progetto Supabase **staging** dedicato (ref diverso dalla produzione).
2. Configurare env/secrets **fuori dal repo** (`SUPABASE_STAGING_URL`,
   `SUPABASE_STAGING_SERVICE_ROLE` in vault/CI, mai nel client).
3. `supabase link` al ref staging; `supabase db push`/`migration up` in staging.
4. Eseguire i test (`supabase/tests/`) → report.
5. Nessuna promozione a produzione in questa fase.

## 4. Sicurezza
- Service-role solo in CI/Edge, mai nel browser/HTML/repo.
- Le migrazioni non inseriscono dati reali: solo schema + fixture di test fittizie.

## 5. Rollback
- Ogni migrazione forward ha strategia di rollback documentata (o file down).
- Backup dello staging prima di migrazioni non banali.
- Su produzione (fase futura, separata): mai migrazioni distruttive automatiche.
