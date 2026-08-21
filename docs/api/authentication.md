# INGLY OS V2 — Authentication / Authorization Contract (4B)

> Fase 4B · documentazione. Flusso Auth → JWT → membership → ruoli/permessi → RLS.
> Nessuna implementazione eseguita.

## 1. Flusso
```
Supabase Auth (email/OAuth) → access_token (JWT) + refresh_token
   JWT.app_metadata: { tenant_ids: uuid[], roles: { <tenant_id>: <role_key> } }
   → PostgREST/Edge leggono i claim → RLS applica isolamento tenant + permessi
```

## 2. Claims
- `sub` = user id (auth.users.id).
- `app_metadata.tenant_ids`: tenant di cui l'utente è membro **attivo**.
- `app_metadata.roles`: mappa `tenant_id → role_key` (OWNER…VIEWER).
- `app_metadata.active_tenant`: tenant corrente (per default nelle query).
- I claim sono popolati da un **Auth Hook** (o Edge post-login) che legge
  `tenant_membership`/`user_role`. **Mai** impostati dal client.

## 3. Ciclo di vita token
- `access_token` breve (es. 1h); `refresh_token` per rinnovo.
- **Refresh**: alla scadenza, il client rinnova; i claim vengono **rigenerati**
  (riflettono membership/ruoli correnti).

## 4. Tenant switching
- `switch_tenant(tenant_id)` (command): verifica membership → aggiorna
  `active_tenant` e forza **re-issue** del token (nuovo claim). Le richieste
  successive usano il nuovo tenant di default.

## 5. Cambi ruolo / accesso revocato
- `assign_role/revoke_role` aggiornano `user_role`; un **hook** invalida/rigenera i
  claim al successivo refresh. Per revoche immediate: lista di revoca
  (`security.revoked_sessions`) controllata dalle Edge per i command sensibili.
- **Utente rimosso** (`membership.status='revoked'`): `current_tenant_ids()` non
  include più il tenant → RLS nega tutto immediatamente al refresh; le Edge dei
  command controllano la revoca in tempo reale.

## 6. Confini service-role
- La **service-role key** vive **solo** nelle Edge Functions (server), **mai** nel
  browser/HTML/repo. Bypassa la RLS, quindi ogni Edge **ri-valida** tenant+ruolo
  prima di agire.
- Il client usa solo `anon`/user JWT.

## 7. Autorizzazione nei command (Edge)
Ogni Edge Function privilegiata:
1. Verifica JWT (firma/scadenza).
2. Estrae `tenant_id` target e verifica che sia in `tenant_ids`.
3. Verifica `role` → `permission(resource, action)` per il command.
4. Controlla revoca sessione (per operazioni sensibili).
5. Esegue in transazione (con lock dove serve) → domain event → audit.
6. Ritorna output o errore deterministico.

## 8. RLS (riassunto; dettaglio in database/rls-model.md §9)
- Policy leggono `current_tenant_ids()` e ruolo **dal claim** (no funzioni costose
  per riga). Helper `SECURITY DEFINER` con `search_path=''`. Nessuna policy ricorsiva.

## 9. Storage
- Bucket privati; accesso via signed URL emessi dalle Edge dopo check ruolo/tenant;
  path `tenant_id/...` (vedi rls §9.2).
