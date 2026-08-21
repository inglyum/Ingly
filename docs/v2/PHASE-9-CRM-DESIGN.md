# INGLY OS V2 — CRM Module Design (Fase 9)

> Design del modulo **CRM** V2 su Supabase **staging**. **Nessuna migrazione
> applicata** in questa fase. Fonte di verità: comportamento V96 +
> `ERP-FUNCTIONAL-MAP.md` + `ERP-DATA-MAPPING.md`. Produzione e V96 intatti.

## A. Entità V96 usate (CRM)
Moduli v96: `clients` (CRM Clienti), `clientintel`, `clv`, `leadscorer`,
`b2bpitch`. Il cuore è lo store **`clients`**; gli altri sono viste/intelligence
sopra gli stessi dati (+ vendite/ordini per il valore).

## B. Modello IndexedDB attuale (store `clients`)
Campi osservati (da `migrateRecord` + uso reale):
```
id (string/uid), name, phone, email, address, notes, tags[] , ltv (number),
segment (B2C/B2B), type, company (azienda B2B), vat/piva, createdAt
```
Store correlati usati dal CRM: `sales`, `orders`, `quotes` (per LTV/valore),
`events`/`bookings` (attività). Nessun `tenant_id` (dati locali al browser).

## C. Tabelle Supabase proposte (V2)
La **foundation** (tenant/membership/ruoli/audit/eventi) è già applicata
(`20260101000001/2`). Per il CRM si aggiungono (migrazione incrementale
**`20260101000003_crm.sql`**, NON applicata qui):

- **`public.crm_company`** (aziende B2B)
- **`public.crm_customer`** (clienti B2C/B2B) — entità principale
- **`public.crm_contact`** (contatti del cliente/azienda)
- **`public.crm_activity`** (note/attività/follow-up)
- *(rinviate a slice successive: `crm_lead`, `crm_opportunity`, `crm_task`)*

## D. Relazioni
```
crm_company 1─* crm_customer         (customer.company_id → company, opzionale)
crm_customer 1─* crm_contact         (contact.customer_id → customer)
crm_customer 1─* crm_activity        (activity.customer_id → customer)
tenant 1─* (tutte).tenant_id
crm_customer.value_cached  ← derivato da sales/orders (job/vista, fase successiva)
```

## E. Colonne (DDL proposto — NON eseguito)
### crm_company
`id uuid pk · tenant_id uuid not null · name text not null · vat text ·
address jsonb · tags text[] default '{}' · created_at timestamptz default now() ·
created_by uuid · updated_at timestamptz · deleted_at timestamptz`
### crm_customer
`id uuid pk · tenant_id uuid not null · company_id uuid null → crm_company ·
type text not null default 'B2C' check (type in ('B2C','B2B')) ·
name text not null · email text · phone text · address jsonb ·
segment text · tags text[] default '{}' · notes text ·
value_cached numeric default 0 · created_at · created_by · updated_at · deleted_at`
### crm_contact
`id uuid pk · tenant_id uuid not null · customer_id uuid not null → crm_customer ·
name text not null · role text · email text · phone text · created_at`
### crm_activity
`id uuid pk · tenant_id uuid not null · customer_id uuid → crm_customer ·
type text not null (note|call|email|meeting|followup) · body text ·
occurred_at timestamptz default now() · actor_id uuid`

## F. Indici
- `crm_customer (tenant_id, segment)`, `(tenant_id, type)`, `(tenant_id, deleted_at)`
- **GIN trigram** su `crm_customer(name)` e `(email)` per la ricerca fuzzy
- `crm_contact (tenant_id, customer_id)`
- `crm_activity (tenant_id, customer_id, occurred_at)`
- `crm_company (tenant_id)` + trigram su `name`

## G. Tenant ownership
Ogni riga ha `tenant_id NOT NULL`. Nessun accesso cross-tenant (RLS). `INSERT`
forza `tenant_id ∈ current_tenant_ids()`; `UPDATE` non può cambiare `tenant_id`.

## H. RLS policies (concettuali, allineate a rls-model §9)
Per ogni tabella `crm_*` (RLS ENABLED):
- **SELECT**: `tenant_id = any(current_tenant_ids())`
- **INSERT**: `with check tenant_id = any(current_tenant_ids())` + permesso `create`
- **UPDATE**: `using` SELECT + permesso `update`; `with check` blocca cambio tenant
- **DELETE**: soft-delete (`deleted_at`) per customer/company; permesso `delete`
- Ruolo/permesso letti dal **claim JWT** (no funzioni costose per riga).

## I. Permessi RBAC (matrice CRM)
| Azione | OWNER | ADMIN | MANAGER | SALES | DESIGNER | PRODUCTION | WAREHOUSE | FINANCE | VIEWER |
|--|--|--|--|--|--|--|--|--|--|
| crm read | ✔ | ✔ | ✔ | ✔ | R | R | R | R | R |
| crm create/update | ✔ | ✔ | ✔ | ✔ | – | – | – | – | – |
| crm delete (soft) | ✔ | ✔ | ✔ | – | – | – | – | – | – |
| crm export | ✔ | ✔ | ✔ | ✔ | – | – | – | – | – |

## J. Operazioni CRUD (API)
- **Read/list**: PostgREST `GET crm_customer` (RLS) + filtri (segment/type/search
  trigram) + sort (`created_at`, `name`, `value_cached`) + cursor pagination.
- **Detail**: `GET crm_customer?id=eq.` + contatti + attività.
- **Create/Update**: PostgREST (RLS+permesso) o Edge `upsert_customer` con
  validazione + `audit_log` + evento `customer.created/updated`.
- **Delete**: soft (`deleted_at`) via Edge (audit).
- **Add activity**: `POST crm_activity` (evento `customer.activity_added`).

## K. Migration plan (NON eseguito ora)
1. Scrivere `supabase/migrations/20260101000003_crm.sql` (tabelle+RLS+indici+trigram).
2. File **down** in `supabase/rollback/`.
3. Static review (estendere `tests/staging_sql.test.mjs`).
4. **In staging**: `supabase db push` (solo staging) → `db lint` → test RLS.
5. Nessun tocco a produzione; nessun dato reale importato (seed di test fittizio).

## L. Test plan
**Offline (subito):** DDL statico (RLS su tutte le crm_*, trigram presenti, FK,
soft-delete, no prod ref); UI CRM (lista/detail/create/edit/search/filtri render).
**Runtime staging (dopo apply):** anon non legge crm_*; authenticated legge solo
il proprio tenant; SALES può creare, VIEWER no; ricerca trigram; soft-delete;
audit scritto; evento emesso.

## Stato
Design completo. **Migrazione NON applicata.** Prossimo passo (su tua approvazione):
scrivere `20260101000003_crm.sql` + down + static test, poi (in staging) apply+test,
poi collegare la UI CRM V2 (già presente: lista/tab/toolbar) a Supabase.
