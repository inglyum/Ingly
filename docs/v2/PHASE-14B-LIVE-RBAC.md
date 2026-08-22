# PHASE 14B — Live RBAC Security Validation

Prova a **runtime reale** che il server-side RBAC della migrazione `0006`
(RLS + `has_permission()` + trigger soft-delete) è applicato dal database, non
solo nella UI. Le operazioni passano **direttamente** dall'API REST/Auth di
Supabase (bypass UI): si dimostra che il SERVER rifiuta le scritture non
autorizzate, non che i bottoni siano nascosti.

## Harness
`tests/live_rbac_staging.mjs` — Node ≥18 (fetch nativo), nessuna dipendenza.

Copre:
- Matrice per ruolo su `crm_customer`: SELECT / INSERT / UPDATE / SOFT-DELETE
  (OWNER/ADMIN/MANAGER full · SALES no delete · VIEWER read-only).
- **Tenant isolation** (TASK 3): utente tenant A non vede/scrive record tenant B.
- **Bypass UI** (TASK 4): INSERT VIEWER e soft-delete SALES via client diretto → DENIED.
- **Activity immutability** (TASK 7): create/read PASS, update/delete DENIED.
- **Cleanup** (TASK 8): ogni record è taggato `PHASE14 LIVE TEST` e soft-deleted a fine run.

## Sicurezza (TASK 5/6)
- Nessuna password/anon-key/service-key/token nel repo: **tutto da env**.
- `service_role` mai usata: login utente reale (anon key + email/password),
  stesso modello di `app-v2/src/supabase.js`.
- Guard target: se l'URL non è lo staging `uepyexyosyogyvzorata` (es. production
  `dhfuokioyuytbxxgoilp`) → **STOP** (exit 2), nessuna operazione.

## Esecuzione (ambiente con egress + credenziali)
```bash
export SUPABASE_URL="https://uepyexyosyogyvzorata.supabase.co"
export SUPABASE_ANON_KEY="<publishable/anon key>"
export RBAC_OWNER_EMAIL=...   RBAC_OWNER_PASSWORD=...
export RBAC_ADMIN_EMAIL=...   RBAC_ADMIN_PASSWORD=...
export RBAC_MANAGER_EMAIL=... RBAC_MANAGER_PASSWORD=...
export RBAC_SALES_EMAIL=...   RBAC_SALES_PASSWORD=...
export RBAC_VIEWER_EMAIL=...  RBAC_VIEWER_PASSWORD=...
# opzionale, per l'isolamento tenant (secondo tenant B):
export RBAC_TENANTB_EMAIL=... RBAC_TENANTB_PASSWORD=...
node tests/live_rbac_staging.mjs
```
Exit: `0` = SECURITY VERIFIED · `1` = SECURITY NOT VERIFIED · `2` = STOP guard.
Il report finale è stampato nel formato PHASE 14B.

## Stato in questa sessione — BLOCCATO (non un fallimento del RBAC)
La sandbox di questa sessione **nega l'egress** verso Supabase: il gateway del
proxy risponde **403 a CONNECT** per `uepyexyosyogyvzorata.supabase.co:443`
(registrato in `recentRelayFailures`), e non sono presenti credenziali dei 5
utenti di test. Quindi i test runtime non possono essere eseguiti da qui.

Verificato comunque, senza rete:
- Guard production → STOP (exit 2). ✅
- Guard "no secrets" → STOP (exit 2). ✅
- Target staging + creds fittizie → login 403 (egress bloccato). ✅

**Risultato in questa sessione: SECURITY NOT VERIFIED (esecuzione bloccata
dall'ambiente).** L'harness è pronto: eseguirlo da un ambiente con egress verso
`*.supabase.co` e le 5 (o 6) credenziali utente produce il verdetto reale.

## Utenti di test necessari (una tantum, su staging)
5 utenti auth nello stesso tenant, uno per ruolo (`user_role`): OWNER, ADMIN,
MANAGER, SALES, VIEWER. Opzionale: 1 utente in un secondo tenant per TASK 3.
Creazione consigliata via dashboard/Edge con service_role **lato server** —
mai da questo repo.
