# INGLY OS V2 — Phase 5 Offline Development Report

> Sviluppo proseguito **offline** (nessuna connessione Supabase, nessun SQL remoto,
> nessun link/login, produzione e V96 intatte). Data: 2026-08-21.

## 1. Stato di implementazione INGLY OS V2 (fotografia)
- **Frontend/app di produzione**: `INGLY-OS-v96-STANDALONE.html` — monolite
  offline-first su IndexedDB. **Intatto** (nessuna modifica in questa fase).
- **Backend V2**: in fase di **fondazione documentale + scaffolding SQL**. Nessun
  codice backend eseguibile ancora (solo `supabase/functions/stripe-webhook`
  preesistente, che referenzia il ref di **produzione** solo in un **commento**).
- **Migrazioni staging** (scaffolding, non applicate):
  - `0001_foundation_slice.sql` (10 tabelle foundation + RLS + helper claim +
    audit immutabile + outbox/aggregate_version + indici)
  - `0001_foundation_slice_down.sql` (rollback)
  - `0002_rbac_seed.sql` (`security.role_perm_cache` + seed 9 ruoli)
- **Documentazione**: architettura, DB v2, RLS, indici, sync, mapping, API,
  policy migrazioni, review V1/V2 — complete e coerenti.

## 2. Ordering e dipendenze migrazioni — VERIFICATO
- Prefissi numerici crescenti: `0001` → `0002` (test automatico).
- `0001` crea schemi (`audit/events/integ/sync`) e tabelle; `0002` crea schema
  `security` + `role_perm_cache` + seed ruoli (dipende da `public.role` creata in 0001).
- `0001_*_down.sql` droppa in **ordine inverso** (funzione → tabelle → schemi).

## 3. Validazione statica SQL — VERIFICATA (17 test automatici)
Aggiunto `tests/staging_sql.test.mjs` (offline, integrato in `npm test`). Verifica:
- Presenza file + ordering migrazioni.
- Creazione di tutte le 7 tabelle `public` foundation.
- **RLS abilitata su TUTTE le tabelle public** (B-1) + almeno una policy ciascuna.
- Claim via **`auth.jwt()`** (non `current_setting`) — W-1.
- `current_tenant_ids()` **SECURITY DEFINER** + `search_path=''` + `revoke ... from public`.
- `domain_event`: **CHECK aggregate_version>0** + UNIQUE per aggregato + UNIQUE idempotency_key.
- **Audit immutabile** (`revoke update,delete from anon,authenticated`) — W-5.
- **integration_credential** protetta (RLS + `revoke all`) — W-3.
- **FK verso `auth.users(id)`** (≥3) — W-8.
- **Indici foundation** presenti — W-9.
- **Down** droppa tutte le tabelle + la funzione.
- `0002`: `role_perm_cache` + schema `security` + seed dei 9 ruoli — W-2.
- **Nessun ref di PRODUZIONE** nelle migrazioni staging; staging ref ≠ produzione.
- Bilanciamento `$$` nelle funzioni.

## 4. RLS / vincoli / FK / funzioni / SECURITY DEFINER — VERIFICA STATICA
- RLS: enable + policy su tutte le public; `integ.*` con RLS di difesa; schemi
  interni non esposti. ✔
- SECURITY DEFINER: unica funzione (`current_tenant_ids`) con `search_path=''`,
  built-in in `pg_catalog` (nessun hijack), `revoke from public`. ✔
- FK/UNIQUE/CHECK: presenti e coerenti col design (verificati dai test). ✔
- **Limite onesto**: la validazione è **statica** (parsing/regex). La verifica di
  **esecuzione** (apply, comportamento RLS runtime, concorrenza, eventi) richiede lo
  **staging** e resta pendente.

## 5. Codice applicativo vs contratto DB — VERIFICATO
- V96 usa IndexedDB e **non** dipende dal DB V2 → nessun conflitto; **intatto**.
- `supabase/functions/stripe-webhook/index.ts`: preesistente; il ref di produzione
  compare **solo in un commento** di documentazione, non in codice eseguito contro
  il nuovo schema. Isolato e marcato.
- Nessun nuovo codice backend introdotto (coerente: prima serve lo staging).

## 6. Test — STATO
- Suite estesa: **14 → 31 test** (aggiunti 17 statici SQL). Eseguiti offline.
- Nessun test richiede Supabase remoto.
- Test empirici (RLS runtime, concorrenza stock, eventi/outbox) restano **stub**
  in `supabase/tests/` → da eseguire in staging.

## 7. Cosa resta bloccato dallo staging remoto
- Applicazione migrazioni (`db push`), verifica RLS/concorrenza/eventi **runtime**,
  seed permessi completo, definizione `has_permission()`, Auth Hook per i claim JWT.
- Sblocco: `SUPABASE_ACCESS_TOKEN` in env + rete verso Supabase (o esecuzione da CI).

## 8. Sicurezza — nessun indebolimento
- Nessuna policy allentata per sbloccare lo sviluppo. B-1 e le WARNING restano chiuse
  nello scaffolding. Ref di produzione mai usato; V96 intatta.
