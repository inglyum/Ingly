# INGLY OS V2 — Staging Foundation Test Report (4I)

> Fase 4I · report. **Esecuzione BLOCCATA**: nessun ambiente Supabase di staging
> identificabile in questa sessione. Nulla è stato eseguito su alcun database.
> Data: 2026-08-21.

## 1. Verifica ambiente (obbligatoria)
| Controllo | Esito |
|--|--|
| Supabase CLI presente | ❌ assente |
| Env var `SUPABASE_STAGING_*` | ❌ assenti |
| Progetto Supabase staging collegato | ❌ nessuno (solo produzione "Ingly 91" per auth/Stripe) |
| Egress verso supabase.com | ⚠️ ristretto |
| **Staging positivamente identificato?** | **NO → STOP esecuzione (regola critica)** |

Conseguenza: le fasi che richiedono un DB (4C provisioning, 4D apply migrazioni,
4E RLS, 4F concorrenza, 4G eventi) **non sono eseguibili**. Prodotto solo ciò che
è sicuro e offline: contratti API (4A/4B), policy migrazioni (4H) e **scaffolding
non eseguito** (SQL slice + stub test).

## 2. Test eseguiti / passati / falliti
- **Eseguiti: 0** (nessun DB disponibile).
- **Passati: 0 · Falliti: 0** — non applicabile.
- Test **progettati e stubbati** (pronti all'esecuzione in staging):
  - RLS isolation (7 casi) — `supabase/tests/rls_isolation.test.md`
  - Concurrency prenotazioni — `supabase/tests/reservation_concurrency.test.md`
  - Event/outbox — `supabase/tests/event_outbox.test.md`

## 3. Artefatti prodotti (sicuri, non eseguiti)
- Contratti API: `docs/api/{api-contracts,error-model,authentication,idempotency,
  pagination-filtering,domain-commands}.md`.
- Policy migrazioni: `docs/database/staging-migration-policy.md`.
- SQL slice fondazionale (10 tabelle + RLS base + helper claim + audit immutabile +
  outbox/aggregate_version): `supabase/migrations/staging/0001_foundation_slice.sql`
  — **NON eseguito**.
- Stub test 4E/4F/4G.

## 4. Limitazioni note
- Impossibile validare RLS/concorrenza/eventi senza un DB staging reale.
- `has_permission()` claim-based è descritto ma non implementato nello slice (rinviato
  alla fase con staging).
- Nessun dato reale toccato; V96 intatta; IndexedDB intatto.

## 5. Findings
- **Sicurezza**: nessun test eseguibile → nessun finding confermato; il design
  (rls-model §9) è pronto ma **da provare** in staging. **Rischio residuo**: alto
  finché i test RLS non girano.
- **Concorrenza**: invariante anti-overselling **non ancora dimostrato empiricamente**
  (solo progettato con lock+idempotenza).
- **Eventi**: atomicità outbox **non ancora dimostrata empiricamente**.

## 6. Blocker
**Manca un progetto Supabase di staging dedicato** (URL + service-role come secret,
distinti dalla produzione). Finché non è fornito, le fasi 4C–4G restano bloccate.
