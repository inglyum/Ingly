# INGLY OS V2 — Staging Foundation SQL Review

> Review **offline** di `supabase/migrations/staging/0001_foundation_slice.sql` e
> coerenza con i documenti di design. **Nessun SQL eseguito, nessuna connessione
> Supabase, SQL non modificato** (le correzioni sono elencate, non applicate).
> Data: 2026-08-21.

## Esito
**STAGING SQL REVIEW: REQUIRES CHANGES** — 1 problema **BLOCKING** (RLS non
abilitata su alcune tabelle `public` esposte da PostgREST) + alcune WARNING.
Il resto è SAFE e coerente con il design.

---

## 1. Sintassi SQL — **SAFE**
- DDL valido Postgres. `create table if not exists`, `create policy` preceduto da
  `drop policy if exists` → **idempotente/rieseguibile**. Nessun errore di sintassi
  atteso.

## 2. Compatibilità PostgreSQL — **SAFE**
- `gen_random_uuid()` disponibile (core in PG13+; comunque `pgcrypto` creata).
- Tipi (`uuid, text, jsonb, timestamptz, bigint`) e vincoli standard.

## 3. Compatibilità Supabase — **WARNING**
- **W-1**: preferire **`auth.jwt()`** (helper documentato Supabase) invece di
  `current_setting('request.jwt.claims', true)::jsonb`. Entrambi funzionano, ma
  `auth.jwt()` è lo standard e più robusto ai cambi interni.
- **W-2**: `gen_random_uuid()` in Supabase può risiedere nello schema `extensions`;
  nei DEFAULT gira con la search_path di sessione (che include `extensions`) → ok.
  Nota: dentro funzioni con `search_path=''` NON usarlo non qualificato (qui non
  accade).

## 4. Correttezza RLS — **BLOCKING**
- **B-1 (BLOCKING)**: RLS abilitata **solo** su `tenant`, `tenant_membership`,
  `user_role`, `integ.integration`. **NON** su `public.profile`, `public.role`,
  `public.permission`, `public.role_permission`. In Supabase le tabelle in `public`
  sono **esposte via PostgREST**: senza `ENABLE ROW LEVEL SECURITY` (+ policy) una
  tabella public può risultare **accessibile** ai ruoli `anon`/`authenticated` a
  seconda dei grant → **rischio di lettura non controllata**. Va abilitata RLS su
  **tutte** le tabelle `public`.
  - `profile`: policy self (`id = auth.uid()`), lettura/scrittura solo del proprio profilo.
  - `role`, `permission`, `role_permission`: lookup globali → RLS ON + policy
    `for select to authenticated using (true)` (lettura consentita, scrittura no).
- **B-2 (WARNING→HIGH se non chiuso)**: `integ.integration_credential` non ha RLS.
  È in schema `integ` (non esposto), ma per difesa in profondità abilitare RLS e
  **negare** ogni accesso a `authenticated` (solo service-role).

## 5. SECURITY DEFINER — **SAFE (con nota)**
- `current_tenant_ids()` è `SECURITY DEFINER` con `set search_path = ''`,
  `revoke execute from public`, `grant to authenticated` → **corretto**.
- Le funzioni built-in usate (`jsonb_array_elements_text`, `array_agg`, `coalesce`,
  `nullif`, `current_setting`) sono in `pg_catalog`, **sempre** risolvibile anche con
  `search_path=''` → nessun rischio di hijack. **SAFE**.

## 6. search_path — **SAFE**
- `set search_path = ''` presente sulla funzione DEFINER. Nessun oggetto applicativo
  non qualificato viene richiamato al suo interno. OK.

## 7. Tenant isolation — **SAFE (dopo B-1)**
- Le policy usano `current_tenant_ids()` (da claim, **non ricorsivo**). Nessun join a
  `tenant_membership` dentro la policy → niente ricorsione. Corretto.
- **Dopo** aver chiuso B-1, l'isolamento è coerente. Prima di B-1 c'è un buco su
  profile/role/permission.

## 8. Modello ruoli/permessi — **WARNING**
- Struttura `role/permission/role_permission/user_role` corretta.
- **W-3**: manca il **seed** dei 9 ruoli e dei permessi base + la mappa
  ruolo→permessi (`security.role_perm_cache` citata in `rls-model §9.1` ma **non
  creata** in questo slice). Va aggiunta in una migrazione successiva (0002) o qui,
  altrimenti `has_permission()` non ha sorgente. Non blocca la *foundation*, ma va
  tracciato.
- **W-4**: `user_role` PK `(tenant_id, user_id)` ammette **un solo ruolo per utente
  per tenant** — coerente col design (un ruolo per tenant). OK, esplicitare la scelta.

## 9. Immutabilità audit — **SAFE (con rafforzamento)**
- `audit.audit_log` in schema non esposto + `revoke update, delete ... from
  authenticated`. **W-5**: aggiungere `revoke update, delete from anon` e non
  concedere mai UPDATE/DELETE; consentire solo INSERT via service-role/trigger →
  immutabilità a livello di privilegi completa.

## 10. Vincoli aggregate_version — **SAFE (con nota)**
- `domain_event.aggregate_version bigint not null` + UNIQUE
  `(tenant_id, aggregate_type, aggregate_id, aggregate_version)` → ordering per
  aggregato garantito. **W-6**: aggiungere `CHECK (aggregate_version > 0)`.

## 11. Integrità event/outbox — **SAFE**
- `outbox.event_id` FK → `domain_event(event_id) on delete cascade`; `dlq` traccia
  fallimenti. `idempotency_key` UNIQUE su domain_event → dedup. Coerente con design.
- **W-7**: `events.dlq.event_id` senza FK (intenzionale, per conservare il riferimento
  anche se l'evento viene ripulito) → esplicitare la scelta con commento.

## 12. sync.mutation_log idempotency — **SAFE**
- UNIQUE su `client_mutation_id` e su `idempotency_key` → dedup a due livelli.
  Coerente con `offline-sync-model §10` e `idempotency.md`.

## 13. Foreign keys — **WARNING**
- **W-8**: `profile.id`, `tenant_membership.user_id`, `user_role.user_id` referenziano
  logicamente `auth.users(id)` ma **senza FK**. Consigliato FK
  `references auth.users(id) on delete cascade` per evitare orfani (Supabase lo
  consente). Scelta da confermare (alcuni preferono no-FK verso `auth`).

## 14. Unique constraints — **SAFE**
- `tenant.slug` UNIQUE, `role.key` UNIQUE, `permission (resource,action)` UNIQUE,
  `tenant_membership (tenant_id,user_id)` UNIQUE, domain_event/mutation_log UNIQUE
  come sopra. Corretti.

## 15. Indici — **WARNING**
- **W-9**: lo slice non crea indici oltre a PK/UNIQUE. Per la foundation è
  accettabile, ma prima dell'uso aggiungere gli indici previsti in
  `indexing-strategy §7` per le tabelle che cresceranno
  (`audit_log(tenant_id, occurred_at)`, `domain_event(tenant_id,status,occurred_at)`,
  `outbox(status)`, `mutation_log` già coperto da UNIQUE). Non blocca la creazione.

## 16. Rollback — **WARNING**
- **W-10**: manca un file **down** (`0001_foundation_slice_down.sql`). C'è solo una
  nota di rollback. Aggiungere il down (drop in ordine inverso: policy → tabelle →
  schemi) per reversibilità piena (staging-migration-policy §5).

## 17. Coerenza naming — **WARNING**
- **W-11**: schema `security` creato ma **non usato** in questo slice (la cache
  permessi arriva dopo). Rimuoverlo da 0001 o aggiungere subito `role_perm_cache`.
- Naming prefissi coerente con `schema-map` (public senza prefisso per foundation
  identity/RBAC — coerente col design che usa prefissi solo per i domini business).

## 18. Compatibilità migrazioni future — **SAFE**
- Idempotenza (`if not exists`, `drop policy if exists`) rende lo slice
  ri-applicabile e non conflittuale con 0002+. Le tabelle business (prefisso
  dominio) arriveranno in migrazioni successive senza collisioni.

---

## Coerenza con i documenti di design

| Documento | Coerente? | Nota |
|--|--|--|
| `database-v2.md` §9 | ✔ | aggregate_version, outbox, audit immutabile, claim RLS: presenti |
| `rls-model.md` §9 | ✔ (parziale) | claim JWT ok; manca `role_perm_cache` (W-3) e RLS su tutte le public (B-1) |
| `database-decisions.md` (DB-5, DB-6) | ✔ | claim RLS + aggregate_version rispettati |
| `consistency-review.md` | ✔ | nessuna contraddizione nuova introdotta |
| `docs/api/*.md` | ✔ | `current_tenant_ids()`/claim allineati ad `authentication.md`; command non presenti in questo slice (corretto: solo foundation) |

---

## Correzioni richieste (da applicare PRIMA dello staging — NON applicate)

**BLOCKING**
1. **B-1**: `ENABLE ROW LEVEL SECURITY` su **tutte** le tabelle `public` mancanti
   (`profile`, `role`, `permission`, `role_permission`) + policy:
   - `profile`: self (`id = auth.uid()`).
   - `role`/`permission`/`role_permission`: `for select to authenticated using (true)`,
     nessuna scrittura da client.

**HIGH / WARNING (consigliate prima dell'uso)**
2. B-2: RLS + deny su `integ.integration_credential` (solo service-role).
3. W-1: usare `auth.jwt()` al posto di `current_setting('request.jwt.claims')`.
4. W-3: creare `security.role_perm_cache` (+ seed ruoli/permessi) in 0002.
5. W-5: `revoke update,delete on audit.audit_log from anon` + solo INSERT service-role.
6. W-6: `CHECK (aggregate_version > 0)` su `domain_event`.
7. W-8: valutare FK verso `auth.users(id)`.
8. W-9: aggiungere indici foundation (audit/domain_event/outbox).
9. W-10: aggiungere file **down** di rollback.
10. W-11: rimuovere schema `security` da 0001 o crearvi subito la cache.

---

# STAGING SQL REVIEW: REQUIRES CHANGES
Chiudere **B-1** (bloccante) e recepire le WARNING elencate. Nessun SQL eseguito,
nessuna connessione Supabase, SQL non modificato, V96 intatta. In attesa di
approvazione: alla conferma applicherò le correzioni al file (sempre senza
eseguirlo) e/o creerò `0002`.
