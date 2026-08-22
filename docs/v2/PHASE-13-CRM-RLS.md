# INGLY OS V2 — Fase 13: CRM RLS fix

## Causa del "new row violates RLS for crm_customer"
Le policy CRM (0003) usano `current_tenant_ids()`, che leggeva **solo il claim JWT**
(`app_metadata.tenant_ids`). Senza Auth Hook il claim è vuoto → l'INSERT `with check
tenant_id = any(current_tenant_ids())` fallisce anche per un membro legittimo.

## Fix (20260101000005_crm_rls.sql) — modello foundation esistente
- **Parte A**: `current_tenant_ids()` risolve dal claim **e in FALLBACK dalla
  membership** (`tenant_membership` per `auth.uid()`, status active), come funzione
  `SECURITY DEFINER` `search_path=''` (legge solo le PROPRIE membership → nessun
  leakage). Così tutte le policy tenant funzionano con la sola membership, senza
  Auth Hook. → INSERT/SELECT/UPDATE CRM ora passano per il membro del tenant.
- **Parte B** (idempotente): riafferma SELECT/INSERT/UPDATE per company/customer/
  contact per tenant; `crm_activity` immutabile (solo SELECT/INSERT, revoke update);
  soft-delete (revoke delete ai client). RLS resta ABILITATA; nessun service_role.
- Down: ripristina `current_tenant_ids()` claim-only.

## RBAC — limitazione documentata (nessun aggiramento)
`permission`/`role_permission` **non sono ancora seminati** → il confine di sicurezza
server-side resta il **TENANT (RLS)**. L'RBAC per azione (write OWNER/ADMIN/MANAGER/
SALES; VIEWER read-only; delete MANAGER+) è applicato **lato UI**; l'affinamento
server (`has_permission` + `role_perm_cache`) è una slice successiva. Non si indebolisce
la RLS tenant per aggirarlo.

## Apply e test live — DA ESEGUIRE in ambiente con rete+token (non da qui)
Questa sessione non ha `SUPABASE_ACCESS_TOKEN`/egress → `db push --dry-run` →
`LegacyProjectNotLinkedError`. Procedura:
```
export SUPABASE_ACCESS_TOKEN=…            # secret, non in repo
npx supabase link --project-ref uepyexyosyogyvzorata
npx supabase db push --dry-run           # deve mostrare SOLO 20260101000005_crm_rls.sql
npx supabase db push                      # applica solo 0005
```
Poi i test live (TASK6/7): login→tenant INGLY→ruolo OWNER→crea/edit/soft-delete
cliente, contatti/attività, refresh persistente; anon non legge; cross-tenant negato;
VIEWER (a livello UI) read-only. NON applicare 20260817_stripe.sql.
