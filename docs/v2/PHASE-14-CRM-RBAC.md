# INGLY OS V2 — Fase 14: CRM CRUD completo + RBAC server-side

## Architettura
RLS = **tenant boundary + authorization**. Usa il modello foundation esistente
(`role`, `security.role_perm_cache`, `current_tenant_ids`). Nessun secondo RBAC/tenant.

## Permission model (convenzione `resource.action`)
`crm.company|customer|contact . read|create|update|delete` · `crm.activity . read|create`.
Seminati in `public.permission` + `security.role_perm_cache` (+ `role_permission` derivato).

## Matrice ruoli (0006)
| Risorsa/Azione | OWNER | ADMIN | MANAGER | SALES | VIEWER |
|--|--|--|--|--|--|
| company/customer/contact · read | ✔ | ✔ | ✔ | ✔ | ✔ |
| … · create/update | ✔ | ✔ | ✔ | ✔ | ✖ |
| … · delete (soft) | ✔ | ✔ | ✔ | ✖ | ✖ |
| activity · read | ✔ | ✔ | ✔ | ✔ | ✔ |
| activity · create | ✔ | ✔ | ✔ | ✔ | ✖ |
| activity · update/delete | ✖ | ✖ | ✖ | ✖ | ✖ (immutabile) |

## Helper (SECURITY DEFINER, search_path='')
- `current_tenant_ids()` (0001/0005: claim + fallback membership).
- `current_user_role(tenant)` — ruolo dell'utente per QUEL tenant (claim o user_role).
- `has_permission(tenant, resource, action)` — consulta `role_perm_cache`; nessun
  permesso cross-tenant.

## RLS CRM (0006)
SELECT/INSERT/UPDATE su company/customer/contact = `tenant_id ∈ current_tenant_ids()`
**AND** `has_permission(tenant, 'crm.<x>', '<action>')`. activity = read/create con
permesso; niente update/delete. Hard delete revocato (0003/0005).

## Soft-delete + enforcement 'delete'
`deleted_at` su company/customer/contact (aggiunto a contact in 0006). Il soft-delete
è un UPDATE: un **trigger BEFORE UPDATE** (`crm_enforce_delete_perm`) richiede
`has_permission(...,'delete')` quando cambia `deleted_at` → SALES può UPDATE ma **non**
soft-delete; MANAGER+ sì. Server-side, indipendente dalla UI.

## Tenant isolation
`current_tenant_ids()` e `current_user_role()` risolvono per `auth.uid()`; nessuna
riga di altri tenant è leggibile/scrivibile. Cross-tenant negato dalla RLS.

## Frontend
La UI riflette i permessi (nasconde Nuovo/Modifica/Elimina secondo il ruolo) ma è
**solo UX**: la sicurezza è nel DB. Gli errori RLS/permesso sono tradotti in
"Non hai i permessi necessari per questa operazione." (nessun dettaglio SQL).
Aggiunti: company/contact CRUD nel data-layer, soft-delete cliente in dettaglio.

## Migration
`20260101000006_crm_server_rbac.sql` (+ down). Idempotente, reversibile. Ordering:
…0005 → **0006** → stripe (20260817, NON applicata).

## Test
- Statici SQL (+9): seed permission/cache, helper DEFINER, policy con has_permission,
  trigger delete, contact.deleted_at, no service_role/hard-delete/RLS-disable, down.
- Matrice RBAC (mirror, `tests/rbac.test.mjs`): OWNER/ADMIN/MANAGER full; SALES no
  delete; VIEWER read-only; activity immutabile; unauthorized denied.
- CRM mock (+5): company/contact CRUD, soft-delete, friendlyError.

## Known limitations
- **Apply e test runtime (RLS reale, trigger, cross-tenant, direct-DB unauthorized)
  NON eseguiti da questa sessione** (no `SUPABASE_ACCESS_TOKEN`/egress). La matrice è
  provata come *intento* (mirror) + wiring statico; la prova server va eseguita in
  staging. Vedi procedura sotto.
- Il ruolo nel claim JWT è popolato solo con un Auth Hook; senza, `current_user_role`
  usa `user_role` (fallback) — funziona con la membership di bootstrap.

## Procedura apply + test runtime (staging, ambiente connesso)
```
export SUPABASE_ACCESS_TOKEN=…
npx supabase link --project-ref uepyexyosyogyvzorata
npx supabase db push --dry-run    # deve mostrare SOLO 20260101000006_crm_server_rbac.sql
npx supabase db push
npx supabase migration list       # 0001..0006 REMOTE; 20260817 NON applicata
```
Poi test runtime: VIEWER direct INSERT → DENIED; SALES direct DELETE/soft-delete →
DENIED; cross-tenant → DENIED; OWNER full CRUD. NON applicare 20260817_stripe.sql.
