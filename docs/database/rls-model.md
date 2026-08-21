# INGLY OS V2 — Row Level Security Model

> Fase 3 · solo documentazione. Modello RLS concettuale (nessuna policy creata,
> nessun SQL eseguito).

## 1. Fondamenti

- RLS **abilitata su tutte le tabelle di `public`** (e negata di default: nessun
  accesso senza policy).
- Confine primario di isolamento = **RLS nel database**: resta efficace **anche se
  un endpoint API viene aggirato** (il client usa la chiave `anon`/utente, mai la
  service-role).
- Schemi interni (`events`,`automation`,`ai`,`integ`,`audit`) **non esposti**:
  accessibili solo da Edge Functions con **service-role** a scope ridotto.

## 2. Funzioni di supporto (concettuali)

- `current_tenant_ids()` → insieme dei `tenant_id` di cui `auth.uid()` è membro
  attivo (`tenant_membership.status='active'`).
- `has_permission(tenant, resource, action)` → true se il ruolo dell'utente su
  quel tenant (`user_role → role_permission → permission`) include l'azione.
- `is_owner_or_admin(tenant)` → scorciatoia per override.

Queste funzioni sono `SECURITY DEFINER` con search_path bloccato e input validati.

## 3. Pattern di policy per tabella tenant-scoped

Per ogni tabella `T` con `tenant_id`:

| Comando | Condizione (USING / WITH CHECK) |
|--|--|
| **SELECT** | `tenant_id IN current_tenant_ids() AND has_permission(tenant_id,'T','read')` |
| **INSERT** | `WITH CHECK tenant_id IN current_tenant_ids() AND has_permission(tenant_id,'T','create')` |
| **UPDATE** | `USING` come SELECT + `has_permission(...,'update')`; `WITH CHECK` impedisce cambio di `tenant_id` |
| **DELETE** | `has_permission(...,'delete')` **oppure** soft-delete only; hard delete negato su tabelle immutabili |

**Override OWNER/ADMIN:** `is_owner_or_admin(tenant_id)` bypassa i check di
permesso di dettaglio (ma **non** il confine di tenant).

## 4. Restrizioni per ruolo (estratto matrice)

| Risorsa | OWNER | ADMIN | MANAGER | SALES | DESIGNER | PRODUCTION | WAREHOUSE | FINANCE | VIEWER |
|--|--|--|--|--|--|--|--|--|--|
| crm_* | CRUD | CRUD | CRUD | CRUD | R | R | R | R | R |
| sales_quote/order | CRUD | CRUD | CRUD | CRUD | R | R | R | R | R |
| cat_price_rule | CRUD | CRUD | approve | R | R | R | R | R | R |
| inv_* / movement | CRUD | CRUD | CRUD | R | R | consume | CRUD | R | R |
| prod_work_order | CRUD | CRUD | CRUD | R | R(design) | CRUD | R | R | R |
| mac_* | CRUD | CRUD | CRUD | R | R | CRUD | R | R | R |
| qc_* | CRUD | CRUD | CRUD | R | R | CRUD | R | R | R |
| dsn_* / prj_* | CRUD | CRUD | CRUD | R | CRUD | R | R | R | R |
| fin_* | CRUD | CRUD | R | R(propri) | – | – | – | CRUD | R |
| user_role / permission | CRUD | CRUD | – | – | – | – | – | – | – |
| audit.audit_log | R | R | R(propri) | – | – | – | – | R | – |

(CRUD=create/read/update/delete; R=read; "approve" per operazioni con gate;
"consume" = solo movimenti di consumo via produzione.)

## 5. Campi sensibili

- **Finanza** (`fin_*`): visibili solo a FINANCE/OWNER/ADMIN (policy per-tabella).
- **Credenziali integrazioni** (`integ.integration_credential`): mai in `public`,
  mai leggibili dal client; solo Edge con service-role; valore in **Vault**
  (`secret_ref`), non in colonna.
- **Dati personali cliente** (email/telefono): accesso per ruolo; export
  (`action='export'`) è permesso separato e **auditato**.

## 6. Operazioni privilegiate (service-role)

Solo in **Edge Functions**, mai dal client:
- Scrittura in `events.*`, `automation.*`, `ai.*`, `audit.*`.
- Job worker (coda), dispatcher outbox, generazione documenti/fatture.
- Ricezione webhook (Stripe/SDI) con verifica firma.

Il **service-role key** non viene mai esposto al browser; le Edge Functions
validano ruolo/tenant prima di agire (difesa oltre la RLS).

## 7. Auditabilità

Le mutazioni sensibili scrivono su `audit.audit_log` tramite trigger o
esplicitamente in Edge. `audit_log` ha **solo grant INSERT** (no UPDATE/DELETE) →
immutabilità garantita a livello di privilegi, non solo di policy.

## 8. Test RLS (fase implementativa, non ora)
- Suite che verifica: nessun accesso cross-tenant; ruoli rispettati; override
  owner; impossibilità di cambiare `tenant_id`; immutabilità audit/movimenti.

---

## 9. Addendum Fase 3.6 — RLS via claim, Storage, MV (VINCOLANTE)

### 9.1 RLS via JWT claim (HR-3)
- Il JWT dell'utente porta `app_metadata.tenant_ids uuid[]` e
  `app_metadata.roles jsonb` (`{tenant_id: role_key}`), rigenerati al cambio
  membership (hook/Edge su login e su update membership).
- `current_tenant_ids()` legge dal claim (`auth.jwt()`), **non** da subquery su
  `tenant_membership` → nessun costo per riga, nessuna ricorsione.
- `has_permission(tenant, resource, action)` risolve dal claim + mappa
  ruolo→permessi **materializzata** (tabella cache `security.role_perm_cache`
  indicizzata, o set statico nel claim). Nessuna funzione costosa per-riga.
- **SECURITY DEFINER**: tutte le helper con `SET search_path = ''`, oggetti
  schema-qualified, `REVOKE EXECUTE FROM public`, `GRANT` mirati. Input validati.
- **Anti-ricorsione**: `tenant_membership`/`user_role` hanno policy **semplici**
  (self-membership) che non richiamano `has_permission`.

### 9.2 Storage tenant isolation (HR-8)
- Bucket **privati** (`designs`, `assets`, `exports`). Convenzione path:
  `{{tenant_id}}/{{design_id}}/{{version}}/file.ext`.
- **Storage policy**: `SELECT/INSERT/UPDATE/DELETE` consentiti solo se
  `(storage.foldername(name))[1]::uuid = ANY(current_tenant_ids())`.
- Download solo via **signed URL** a scadenza breve generati da Edge dopo check
  ruolo. Update/delete: solo ruoli con permesso su `dsn_*`/`prj_*`; le **versioni**
  pubblicate non si sovrascrivono (nuovo path per nuova versione) → isolamento e
  immutabilità coerenti con HR-4.

### 9.3 Analytics tenant-safe (HR-9)
- Ogni `mv_*` ha colonna `tenant_id`; accesso via viste con RLS o funzioni
  `SECURITY INVOKER` che filtrano `current_tenant_ids()`. Vietati aggregati globali
  leggibili dal client.

---

## 10. Addendum Fase 4 — foundation SQL (allineamento)
- **RLS su TUTTE le tabelle `public`** della foundation: `tenant`, `profile`
  (self), `tenant_membership` (self/tenant), `role`/`permission`/`role_permission`
  (lettura globale `authenticated`, scrittura solo service-role), `user_role`
  (per tenant). Nessun accesso `anon`.
- `current_tenant_ids()` usa **`auth.jwt()`** (non `current_setting`).
- **`integ.integration_credential`**: RLS ON + `revoke all from anon,authenticated`
  → accesso solo service-role/Edge.
- **`audit.audit_log`**: `revoke update,delete from anon,authenticated` → immutabile.
- **`security.role_perm_cache`** (creata in `0002_rbac_seed.sql`): mappa
  ruolo→permessi materializzata usata da `has_permission()` senza costi/ricorsione.
