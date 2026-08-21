# INGLY OS V2 — Fase 12: Auth → Tenant → Role context

> Diagnosi e fix della risoluzione del contesto (tenant/ruolo) nell'app V2.
> **Nessuna modifica allo schema/DB, nessun inserimento dati, produzione/V96 intatti.**

## 1. Flusso tracciato
```
Supabase Auth session → access_token (JWT)
   claims: app_metadata.{tenant_ids, roles, active_tenant}   ← popolati da un Auth Hook
→ profile (public.profile, self)
→ tenant_membership (public, self) → tenant accessibili
→ user_role (public) → role_id → role.key  → ruolo per tenant
→ role_permission / role_perm_cache → permessi (RBAC)
```

## 2. Perché la UI mostrava Tenant «—» / Role «—» / read-only
**Due cause concomitanti:**

### Causa A — codice client incompleto (FIXED)
`loadContext()` risolveva il contesto **solo dai claim JWT** e non interrogava mai
`tenant_membership` / `user_role`. Poiché in staging **non c'è (ancora) un Auth Hook**
che popola `app_metadata.tenant_ids/roles`, i claim sono vuoti → tenant/ruolo «—».

### Causa B — policy RLS "chicken-and-egg" (DB, NON modificata in questa fase)
Nella foundation (`20260101000001_foundation_slice.sql`, righe 210-211) la policy:
```sql
create policy membership_self on public.tenant_membership
  for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) );
```
legge `current_tenant_ids()` = **dal claim**, che è vuoto → l'utente **non può leggere
la propria membership** per fare il bootstrap. La stessa cosa vale per `user_role_read`.
La policy corretta per il bootstrap dovrebbe essere **`user_id = auth.uid()`**.

## 3. Fix applicato (SOLO client)
`app-v2/src/context.js` → `loadContext()` ora:
1. usa i claim se presenti (`source='claim'`);
2. **fallback DB**: se i claim non portano tenant, legge la propria membership
   (`tenant_membership` per `user_id`) e i ruoli (`user_role → role.key`) → `source='db'`;
3. espone `activeTenant`, `activeRole`, `permissions` (derivati dal ruolo);
4. degrada in modo pulito: anonimo/senza-tenant/senza-ruolo → stati coerenti.

Aggiunti helper `permissionsForRole(role)` e `can(ctx, action)` (RBAC lato UI; la RLS
resta il confine reale). La CRM UI consuma il contesto corretto senza altre modifiche.

## 4. Verifica dati di bootstrap in staging — DA FARE (non eseguibile da qui)
Questa sessione non ha rete verso Supabase, quindi **non posso verificare** se
l'account corrente ha le righe necessarie. Query diagnostiche (SQL Editor di
**staging**, sola lettura):
```sql
select auth.uid();                                   -- id utente corrente
select * from public.profile          where id = auth.uid();
select * from public.tenant_membership where user_id = auth.uid();
select * from public.user_role        where user_id = auth.uid();
```
**Se mancano** profilo/membership/user_role → sono **dati di bootstrap mancanti**:
**mi fermo e li segnalo, NON li inserisco** (come da istruzioni).

## 5. Cosa serve per far comparire Tenant/Role in staging (scelta dell'utente)
Uno dei due (entrambi = DB change → fuori scope di questa fase, da approvare a parte):
- **(a) Auth Hook** (Supabase → Auth → Hooks: "Custom Access Token") che aggiunge
  `app_metadata.tenant_ids/roles/active_tenant` leggendo membership/user_role.
  → i claim si popolano, il client usa il path `source='claim'`.
- **(b) Fix policy RLS bootstrap**: `tenant_membership`/`user_role` leggibili con
  `user_id = auth.uid()`. → il **fallback DB** già implementato funziona
  (`source='db'`). Richiede una nuova migrazione (es. `20260101000004_rls_bootstrap.sql`).

+ In ogni caso l'account deve avere **profile + tenant_membership(active) + user_role**
  (dati di bootstrap). Se assenti → vanno creati (dall'utente/onboarding), non da me.

## 6. Stato
- **Codice client**: corretto e testato (fallback DB + permessi).
- **DB**: invariato (nessuna migrazione, nessun dato). I blocker B e i dati di
  bootstrap richiedono un'azione esplicita in staging, riportata sopra.
