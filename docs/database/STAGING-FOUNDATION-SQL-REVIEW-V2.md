# INGLY OS V2 — Staging Foundation SQL Review V2 (post-fix)

> Static review **offline**. Nessun SQL eseguito, nessuna connessione Supabase.
> File revisionati: `0001_foundation_slice.sql`, `0001_foundation_slice_down.sql`,
> `0002_rbac_seed.sql`. Data: 2026-08-21.

## Esito
**STAGING SQL REVIEW V2: READY FOR STAGING** — tutte le rilevazioni V1 risolte;
nessuna irrisolta. Restano note di implementazione (seed permessi completo,
`has_permission()`) da completare in staging, non bloccanti per la foundation.

## Stato per rilevazione (V1 → V2)

| ID | Tema | Stato | Nota |
|--|--|--|--|
| **B-1** | RLS su tutte le tabelle public | **FIXED** | `enable row level security` su `tenant, profile, tenant_membership, role, permission, role_permission, user_role` + policy esplicite; `anon` mai consentito |
| **W-1** | `auth.jwt()` vs `current_setting` | **FIXED** | `current_tenant_ids()` usa `auth.jwt() -> 'app_metadata' -> 'tenant_ids'` |
| **W-2** | reference `security.role_perm_cache` | **FIXED** | creata in `0002_rbac_seed.sql` (+ schema `security`); niente reference irrisolta |
| **W-3** | `integration_credential` protetta | **FIXED** | RLS ON + `revoke all from anon,authenticated`; nessuna policy per client → deny |
| **W-4** | `CHECK (aggregate_version > 0)` | **FIXED** | vincolo `domain_event_aggver_positive` presente |
| **W-5** | immutabilità audit_log | **FIXED** | `revoke update,delete on audit.audit_log from anon,authenticated` |
| **W-6** | FK verso `auth.users(id)` | **FIXED** | su `profile.id`, `tenant_membership.user_id`, `user_role.user_id` (`on delete cascade`) |
| **W-7** | indici foundation | **FIXED** | 8 indici (audit×2, domain_event×2, outbox, dlq, membership.user, integration.tenant); nessun ridondante |
| **W-8** | rollback/down + schema inutilizzato | **FIXED** | `0001_..._down.sql` creato; schema `security` spostato in `0002` |

(Le sigle extra della review V1 — W-9 indici, W-10 down, W-11 schema — coincidono
con W-7/W-8 della lista approvata e sono anch'esse FIXED.)

## Validazione statica (checklist)
- [x] Ogni tabella `public` ha **RLS ENABLED** (7/7).
- [x] Ogni tabella `public` ha **policy intenzionali** (self / tenant / lookup RO).
- [x] Nessuna reference **`role_perm_cache`** irrisolta (creata in 0002).
- [x] Uso di **`auth.jwt()`** coerente (helper claim-based).
- [x] **Audit immutabile**: nessun UPDATE/DELETE a `anon`/`authenticated`.
- [x] **Credenziali** accessibili solo service-role (RLS + revoke).
- [x] **`aggregate_version > 0`** CHECK presente + UNIQUE per aggregato.
- [x] **FK** verso `auth.users(id)` presenti dove richiesto.
- [x] **Indici** foundation presenti, nessun ridondante.
- [x] **Rollback** (down migration) presente.
- [x] **Documenti concordano** con l'SQL (vedi `consistency-review.md` addendum Fase 4).

## Coerenza documentale
Aggiornati e concordi: `rls-model.md` (§10), `consistency-review.md` (addendum
Fase 4), `database-decisions.md` (§6), questo documento. Nessun impatto sui
contratti `docs/api/*.md` (comportamento RLS invariato a livello di contratto:
lettura per tenant/ruolo, scrittura via command server-side).

## Note di implementazione (non bloccanti, da completare in staging)
- Popolare il **set completo dei permessi** `(resource, action)` e la mappa
  `security.role_perm_cache` dalla matrice `rls-model §4` (script di seed).
- Definire `public.has_permission(tenant, resource, action)` (claim + cache) in una
  migrazione successiva (`0003`), con test.
- Definire l'**Auth Hook** che popola `app_metadata.tenant_ids`/`roles` nel JWT.

## Sicurezza — nota onesta
La correttezza RLS/immutabilità è verificata **staticamente**; la prova empirica
(test anti-leakage, concorrenza, eventi) richiede lo **staging** e resta pendente
(vedi `staging-foundation-test-report.md`).

---

# STAGING SQL REVIEW V2: READY FOR STAGING
Nessun SQL eseguito, nessuna connessione Supabase, produzione e V96 intatte.
