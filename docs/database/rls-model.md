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
