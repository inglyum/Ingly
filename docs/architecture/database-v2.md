# INGLY OS V2 — Database Design (PostgreSQL / Supabase)

> Fase 3 · **solo documentazione**. Nessun SQL eseguito, nessuna migrazione,
> nessun dato toccato, v96 intatta. Data: 2026-08-21.
> Complementari: `schema-map.md`, `rls-model.md`, `indexing-strategy.md`,
> `offline-sync-model.md`, `v96-to-v2-mapping.md`, `ERD.md`.

## 1. Principi di design (applicati ovunque)

- **PK**: `uuid` (`gen_random_uuid()`) per tutte le entità business.
- **Tenancy**: `tenant_id uuid NOT NULL` su ogni tabella tenant-scoped (tranne
  `tenant`, `role`, `permission` globali).
- **Timestamp**: `created_at timestamptz DEFAULT now()`, `updated_at timestamptz`
  (trigger di aggiornamento), `created_by`/`updated_by uuid` dove utile.
- **Stati**: enum Postgres dedicati (es. `order_status`) — non stringhe libere.
- **Vincoli**: FK espliciti, `UNIQUE` (es. numeri documento per tenant),
  `CHECK` (quantità ≥ 0, importi ≥ 0, percentuali 0–100).
- **Soft delete**: solo dove giustificato (`deleted_at`) — clienti, prodotti,
  progetti. **Movimenti, eventi, audit, pagamenti = mai cancellabili** (immutabili).
- **JSONB**: solo per dati **realmente semi-strutturati/variabili** (payload
  eventi, snapshot preventivo, geometria oggetti design, settings). **No JSONB**
  dove servono relazioni/aggregazioni (righe ordine, movimenti stock, ecc.).
- **Denormalizzazione controllata**: totali "congelati" sui documenti (quote/
  order/invoice) come snapshot storico, ma le **righe** restano normalizzate.

## 2. Strategia degli schemi (physical vs logical)

**Decisione:** approccio **misto**.

- **`public`** (esposto via PostgREST): tabelle CRUD dei domini business, con
  **prefisso di dominio nel nome** (`crm_customer`, `sales_order`,
  `inv_movement`…) per grouping logico senza frammentare l'API.
- **Schemi fisici separati NON esposti via API** (accesso solo service-role/Edge):
  - **`audit`** — log immutabili (`audit.audit_log`).
  - **`automation`** — code/esecuzioni (`automation.job_queue`, `.execution`).
  - **`events`** — `events.domain_event`, `events.outbox`, `events.dlq`.
  - **`ai`** — run/raccomandazioni/decisioni AI.
  - **`analytics`** — viste materializzate e snapshot KPI.
  - **`integ`** — credenziali integrazioni (cifrate, mai in `public`).

**Perché:** Supabase espone di default lo schema `public`. Tenere in `public`
solo ciò che il client deve leggere/scrivere (protetto da RLS), e isolare in
schemi separati ciò che è **interno** (eventi, code, credenziali, audit, AI) →
riduce superficie d'attacco e mantiene l'API pulita.

## 3. Domini e tabelle (≈ 95 tabelle)

Colonne indicate in forma sintetica; tipi/vincoli completi nelle fasi di
implementazione (non ora).

### 3.1 identity / tenants / security
- **tenant** (id, name, slug UNIQUE, plan, status, created_at)
- **tenant_settings** (tenant_id PK/FK, brand JSONB, fiscal JSONB, locale, currency)
- **profile** (id = auth.users.id, full_name, avatar, locale) — 1:1 con auth
- **tenant_membership** (id, tenant_id, user_id, status, invited_by, created_at) UNIQUE(tenant_id,user_id)
- **role** (id, key UNIQUE, name, level int) — globale (OWNER…VIEWER)
- **permission** (id, resource, action) UNIQUE(resource,action)
- **role_permission** (role_id, permission_id) PK composta
- **user_role** (tenant_id, user_id, role_id) — ruolo per tenant
- **audit.audit_log** (id, tenant_id, actor_id, action, resource, resource_id, before JSONB, after JSONB, occurred_at) — **INSERT-only**

### 3.2 crm
- **crm_company** (id, tenant_id, name, vat, address JSONB, tags text[], deleted_at)
- **crm_customer** (id, tenant_id, company_id?, type[B2C/B2B], name, email, phone, segment, value_cached numeric, deleted_at)
- **crm_contact** (id, tenant_id, customer_id, name, role, email, phone)
- **crm_lead** (id, tenant_id, source, name, contact JSONB, status, score int, owner_id)
- **crm_opportunity** (id, tenant_id, customer_id, title, stage, amount, probability, expected_close, owner_id)
- **crm_activity** (id, tenant_id, customer_id?, opportunity_id?, type, note, occurred_at, actor_id)
- **crm_task** (id, tenant_id, title, due_at, assignee_id, status, related_type, related_id)

### 3.3 catalog
- **cat_product** (id, tenant_id, sku UNIQUE per tenant, name, category, technique, base_cost, active, deleted_at)
- **cat_product_variant** (id, tenant_id, product_id, sku, attributes JSONB, extra_cost)
- **cat_service** (id, tenant_id, name, unit, rate)
- **cat_price_list** (id, tenant_id, name, channel[B2C/B2B/Etsy], currency, active)
- **cat_price_rule** (id, tenant_id, price_list_id, scope JSONB, markup, min_margin, rounding) — pricing centralizzato

### 3.4 sales
- **sales_quote** (id, tenant_id, number UNIQUE/tenant, customer_id, status, valid_until, totals JSONB snapshot, created_by)
- **sales_quote_item** (id, tenant_id, quote_id, product_id?, description, qty, unit_price, cost_breakdown JSONB, discount, line_total)
- **sales_quote_status_history** (id, tenant_id, quote_id, status, changed_at, actor_id)
- **sales_order** (id, tenant_id, number UNIQUE/tenant, customer_id, quote_id?, status, totals JSONB, deposit_pct, created_by)
- **sales_order_item** (id, tenant_id, order_id, product_id?, description, qty, unit_price, cost, line_total)
- **sales_order_status_history** (id, tenant_id, order_id, status, changed_at, actor_id)

### 3.5 purchasing
- **pur_supplier** (id, tenant_id, name, vat, lead_time_days, contact JSONB, rating, deleted_at)
- **pur_purchase_order** (id, tenant_id, number, supplier_id, status, expected_at, totals JSONB)
- **pur_purchase_order_item** (id, tenant_id, purchase_order_id, material_id, qty, unit_cost)

### 3.6 inventory
- **inv_material** (id, tenant_id, code UNIQUE/tenant, name, category, unit, waste_factor, min_stock, safety_stock, deleted_at)
- **inv_material_variant** (id, tenant_id, material_id, attributes JSONB, unit_cost)
- **inv_material_batch** (id, tenant_id, material_id, lot, qty, unit_cost, received_at, expiry?)
- **inv_location** (id, tenant_id, name, type)
- **inv_balance** (id, tenant_id, material_id, location_id, on_hand numeric) UNIQUE(material_id,location_id) — **cache** ricalcolabile dai movimenti
- **inv_reservation** (id, tenant_id, material_id, qty, order_id?, work_order_id?, status, created_at)
- **inv_movement** (id, tenant_id, material_id, location_id, qty_delta, reason[receipt/consume/adjust/return], ref_type, ref_id, occurred_at, actor_id) — **INSERT-only, sorgente di verità dello stock**

### 3.7 production (MES)
- **prod_bom** (id, tenant_id, product_id?, design_version_id?, name, version)
- **prod_bom_item** (id, tenant_id, bom_id, material_id?, component_product_id?, qty, unit, waste_factor, optional bool, alternative_group?)
- **prod_routing** (id, tenant_id, bom_id?, name)
- **prod_routing_operation** (id, tenant_id, routing_id, seq, machine_profile_id?, setup_min, run_min_per_unit, labor_min, depends_on?, est_cost)
- **prod_work_order** (id, tenant_id, number, order_id?, product_id?, design_version_id?, qty, priority, status, planned_start, planned_end, actual_start, actual_end, estimated_cost, actual_cost, operator_id?)
- **prod_work_order_operation** (id, tenant_id, work_order_id, seq, machine_id?, status, setup_min, run_min, actual_min, operator_id)
- **prod_work_order_material** (id, tenant_id, work_order_id, material_id, planned_qty, consumed_qty)
- **prod_work_order_status_history** (id, tenant_id, work_order_id, status, changed_at, actor_id)

### 3.8 machines
- **mac_machine** (id, tenant_id, profile_id, name, serial, purchase_cost, purchase_date, status, deleted_at)
- **mac_machine_profile** (id, tenant_id, manufacturer, model, tech[CO2/fiber/UV/DTF/FDM], work_area JSONB, power_w, hourly_cost, energy_kwh, supported_materials text[])
- **mac_machine_maintenance** (id, tenant_id, machine_id, type[planned/repair], scheduled_at, done_at?, cost, notes)
- **mac_machine_job** (id, tenant_id, machine_id, work_order_operation_id?, start_at, end_at, status)
- **mac_machine_downtime** (id, tenant_id, machine_id, reason, start_at, end_at)
- **mac_machine_utilization** (id, tenant_id, machine_id, period date, busy_min, available_min) — o MV in analytics

### 3.9 quality
- **qc_quality_check** (id, tenant_id, work_order_id, result[pass/fail], checked_by, checked_at, notes)
- **qc_non_conformance** (id, tenant_id, work_order_id, type, severity, description, status)
- **qc_rework** (id, tenant_id, work_order_id, reason, cost, status)
- **qc_scrap** (id, tenant_id, work_order_id?, material_id?, qty, cost, reason, occurred_at)

### 3.10 projects / design
- **prj_project** (id, tenant_id, customer_id?, name, status, deleted_at)
- **prj_project_asset** (id, tenant_id, project_id, kind, storage_path, meta JSONB)
- **dsn_design** (id, tenant_id, project_id?, name, current_version_id?, deleted_at)
- **dsn_design_version** (id, tenant_id, design_id, version int, author_id, manufacturing_status, production_status, storage_path_source, checksum, created_at) — **immutabile**
- **dsn_design_layer** (id, tenant_id, design_version_id, name, seq, purpose[cut/engrave/score], material_id?)
- **dsn_design_object** (id, tenant_id, design_version_id, layer_id, type[path/text/shape/image/group], geometry JSONB, params JSONB) — JSONB **appropriato** (geometria variabile)
- **dsn_design_export** (id, tenant_id, design_version_id, format[SVG/DXF/PNG/JPG/PDF], storage_path, created_at)
- **dsn_preflight_result** (id, tenant_id, design_version_id, passed bool, issues JSONB, checked_at)

### 3.11 shipping
- **shp_shipment** (id, tenant_id, order_id, carrier, tracking, status, shipped_at?)
- **shp_shipment_item** (id, tenant_id, shipment_id, order_item_id, qty)
- **shp_shipment_event** (id, tenant_id, shipment_id, status, occurred_at, note)

### 3.12 finance (ERP operativo, NON contabilità certificata)
- **fin_invoice** (id, tenant_id, number UNIQUE/tenant, customer_id, order_id?, status, issue_date, due_date, totals JSONB, sdi_status?)
- **fin_invoice_item** (id, tenant_id, invoice_id, description, qty, unit_price, vat_rate, line_total)
- **fin_payment** (id, tenant_id, invoice_id?, amount, method, received_at, provider_ref?) — **INSERT-only**
- **fin_expense** (id, tenant_id, category, amount, incurred_at, supplier_id?, note)
- **fin_cashflow_transaction** (id, tenant_id, direction[in/out], amount, bucket[tasse/riserva/obiettivi/operativo], occurred_at, ref_type, ref_id) — **INSERT-only**
- **fin_cost_allocation** (id, tenant_id, ref_type[order/work_order], ref_id, cost_type[material/machine/labor/design/overhead], amount) — per COGS/margine

### 3.13 automation / events / integrations
- **automation.automation** (id, tenant_id, name, enabled)
- **automation.trigger** (id, automation_id, event_type, schedule?)
- **automation.condition** (id, automation_id, expr JSONB)
- **automation.action** (id, automation_id, type, params JSONB, seq)
- **automation.execution** (id, tenant_id, automation_id, event_id?, status, started_at, finished_at)
- **automation.execution_log** (id, execution_id, level, message, at)
- **automation.job_queue** (id, tenant_id, type, payload JSONB, run_after, status, attempts, locked_at)
- **events.domain_event** (vedi §5) — **INSERT-only**
- **events.outbox** (id, event_id, dispatched_at?, status)
- **events.dlq** (id, event_id, reason, failed_at)
- **integ.integration** (id, tenant_id, kind[stripe/whatsapp/sdi], config JSONB)
- **integ.integration_credential** (id, tenant_id, integration_id, secret_ref) — **secret in Vault, mai in chiaro**
- **integ.webhook** (id, tenant_id, url, events text[], secret_ref, active)

### 3.14 ai
- **ai.ai_run** (id, tenant_id, service[CEO/CFO/COO/CMO/PM], input_ref JSONB, model, started_at, finished_at, status)
- **ai.ai_recommendation** (id, tenant_id, ai_run_id, kind, content JSONB, priority)
- **ai.ai_decision** (id, tenant_id, recommendation_id, decision[accepted/rejected], decided_by, decided_at)
- **ai.ai_approval** (id, tenant_id, action_ref, required_role, approved_by?, approved_at?) — gate per azioni irreversibili

### 3.15 analytics
- **analytics.kpi_definition** (id, key UNIQUE, name, formula_doc, unit)
- **analytics.kpi_value** (id, tenant_id, kpi_id, period, value) — da MV
- **analytics.snapshot** (id, tenant_id, kind, period, data JSONB)
- **Materialized views**: `mv_revenue`, `mv_margin`, `mv_machine_utilization`,
  `mv_inventory_status`, `mv_customer_value`, `mv_cashflow` (vedi indexing/analytics).

## 4. Modello autorevole dello stock (no "numero magico")

`available = on_hand − reserved + incoming`, dove:
- **on_hand** = `SUM(inv_movement.qty_delta)` per material+location (materializzato
  in `inv_balance` come cache, **ricostruibile** dai movimenti).
- **reserved** = `SUM(inv_reservation.qty WHERE status='active')`.
- **incoming** = `SUM(pur_purchase_order_item.qty)` degli ordini di acquisto aperti.

Lo stock **non è mai modificato a mano**: ogni variazione è un **movimento**
(`receipt/consume/adjust/return`) con causale e riferimento. Rettifiche = movimento
di tipo `adjust` con motivo (auditabile).

## 5. Domain events (convenzione payload)

`events.domain_event`:
`event_id uuid PK · tenant_id · event_type text · aggregate_type text ·
aggregate_id uuid · payload jsonb · occurred_at timestamptz · correlation_id ·
causation_id · idempotency_key text UNIQUE · processed_at · status`.

Scritto in **transazione** con l'operazione (outbox). Dispatcher: at-least-once +
idempotenza (`idempotency_key`), retry con backoff, fallimenti → `events.dlq`.

## 6. Audit (immutabile)

`audit.audit_log` INSERT-only (nessun UPDATE/DELETE, enforced da policy + assenza
di grant). Traccia: cambi permessi, prezzi, ordini, inventario, produzione,
finanza, approvazioni AI, azioni automazione. Campi `before/after` JSONB.

## 7. Finance: ERP operativo vs contabilità

Questo schema copre **finanza operativa ERP** (ricavi, costi diretti, COGS via
`fin_cost_allocation`, margine, cassa profit-first, AR/AP). **Non** è contabilità
certificata (partita doppia, libri fiscali): non lo dichiariamo tale (Fase 15).
L'e-fattura SDI è tracciata come **stato** (`sdi_status`), non come motore fiscale.

## 8. Sicurezza (sintesi; dettaglio in rls-model)

RLS su tutte le tabelle `public`; schemi interni non esposti (solo service-role/
Edge); credenziali in **Vault** (`secret_ref`), mai in colonne chiare; campi
sensibili minimizzati; audit immutabile; operazioni privilegiate solo in Edge
Functions con service role a scope ridotto.

---

## 9. Addendum Fase 3.6 — correzioni recepite (VINCOLANTI)

> Questa sezione **supera** il testo precedente dove diverge. Riflette tutte le
> decisioni DB-1…DB-12 e le risoluzioni HR-1…HR-9 (vedi `database-decisions.md`).

### 9.1 Inventario (HR-1, HR-2)
- **Stock autorevole = `inv_movement`** (append-only). Tipi movimento estesi:
  `receipt, consume, production_output, return, scrap, adjust`.
- **`inv_balance`** è **solo cache derivata**: aggiornata da **un unico trigger** su
  `inv_movement` + **job di riconciliazione** periodico (`reconcile_inventory()`)
  che ricalcola da movimenti, confronta e allerta sui delta. Processo di **rebuild**:
  `TRUNCATE`+ricalcolo da `inv_movement` in staging, poi swap.
- **Prenotazioni transazionali (HR-1)**: la reservation avviene **solo** via funzione
  server `reserve_material(material_id, qty, ref)` in **transazione** con
  `SELECT … FOR UPDATE` sul saldo materiale (o `pg_advisory_xact_lock(hashtext(material_id))`),
  ricalcolo `available = on_hand − reserved + incoming` e insert **solo se sufficiente**;
  altrimenti errore `INSUFFICIENT_STOCK`. **Idempotenza** via `idempotency_key` sulla
  reservation. **Mai** locking/decisione lato client.

### 9.2 Snapshot finanziari storici (APPROVED WITH CHANGES §5)
- `sales_quote_item` e `sales_order_item` e `fin_invoice_item` congelano **come
  colonne**: `unit_price numeric`, `discount numeric`, `vat_rate numeric`,
  `cost numeric`, `line_total numeric`. `cost_breakdown JSONB` resta solo come
  dettaglio informativo. Cambi a `cat_price_rule`/`cat_price_list` **non** toccano
  documenti storici (i documenti copiano, non referenziano il prezzo live).

### 9.3 Valuta e periodo (finance §8)
- Documenti e pagamenti: `currency char(3) DEFAULT 'EUR'` e (multi-valuta futura)
  `fx_rate numeric`. `fin_invoice.issue_date`/`due_date`, `fin_payment.received_at`
  definiscono la competenza; report mensili aggregano su `issue_date` (ricavi) e
  `received_at` (cassa). Chiarito: **ERP operativo, non contabilità certificata.**

### 9.4 Produzione ↔ design immutabile (HR-4)
- `prod_work_order.design_version_id` → **FK a `dsn_design_version`** (versione
  esatta), **mai** a `dsn_design`. Trigger `wo_design_lock` vieta la modifica di
  `design_version_id` quando `status >= IN_PROGRESS`. `dsn_design_version` è
  **immutabile** (nessun UPDATE ai layer/oggetti di una versione pubblicata; una
  modifica = nuova versione). `dsn_design.current_version_id` è solo puntatore UI.
- `prod_work_order_material` acquisisce `work_order_operation_id uuid NULL` per costo
  per operazione (APPROVED WITH CHANGES §6).

### 9.5 Eventi: ordering e outbox (HR-5)
- `events.domain_event` acquisisce **`aggregate_version bigint NOT NULL`**
  (progressivo per `(aggregate_type, aggregate_id)`), con
  UNIQUE `(tenant_id, aggregate_type, aggregate_id, aggregate_version)`.
- Dispatch **ordinato per aggregato** secondo `aggregate_version`; evento scritto
  nella **stessa transazione** dell'operazione (outbox). Replay = rilettura
  append-only con consumer idempotenti; poison → `events.dlq`.

### 9.6 Machine utilization → analytics (HR-7)
- **Rimossa** `mac_machine_utilization` come tabella OLTP. Restano autorevoli
  `mac_machine_job` e `mac_machine_downtime`. L'utilizzo è **derivato** in
  `analytics.mv_machine_utilization` (per-tenant), refresh schedulato.

### 9.7 Qualità (APPROVED WITH CHANGES §1)
- `qc_rework` e `qc_scrap` **fusi** in `qc_non_conformance` con
  `type non_conformance_type` (`defect|rework|scrap`) + `qty`, `cost`. Tabelle
  separate rinviate finché non serve dettaglio dedicato. (`qc_quality_check` resta.)

### 9.8 Automazione (APPROVED WITH CHANGES §5)
- `automation.condition` diventa **`conditions JSONB`** dentro `automation`
  (regole non relazionali). Restano relazionali `trigger`, `action`, `execution`,
  `execution_log`, `job_queue` (fatti di business/tracciabilità).

### 9.9 RLS via claim JWT (HR-3) — sintesi (dettaglio in `rls-model.md`)
- Tenant e ruoli nel **JWT claim**; policy leggono il claim (nessuna funzione
  costosa per riga). Helper `SECURITY DEFINER` con `SET search_path=''`. Nessuna
  policy ricorsiva. Isolamento tenant preservato.

### 9.10 Storage per-tenant (HR-8) — sintesi (dettaglio in `rls-model.md`)
- Bucket privati; path `tenant_id/design_id/version/…`; Storage policy basata su
  membership; **URL firmati** a scadenza; nessun bucket pubblico per asset cliente.

### 9.11 Analytics tenant-safe (HR-9)
- Tutte le `mv_*`/`analytics.*` includono `tenant_id` e sono filtrate (RLS o
  funzioni per-tenant). **Nessun** aggregato globale cross-tenant.

### 9.12 Indici (APPROVED WITH CHANGES §13)
- Vedi `indexing-strategy.md` §7: aggiunti indici mancanti, rimossi `tenant_id`
  singoli ridondanti coperti da compositi.

---
**Totale tabelle proposte (post-review):** ~92 (−1 `machine_utilization` OLTP,
−1 `qc_rework`, −1 `qc_scrap`, −1 `automation.condition`; +1 `sync.mutation_log`).
Nessuna creata: è **design**.
