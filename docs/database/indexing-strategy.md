# INGLY OS V2 — Indexing, Search & Analytics Strategy

> Fase 3 · solo documentazione. Nessun indice creato, nessun SQL eseguito.

## 1. Regole generali
- Ogni tabella tenant-scoped: **indice su `(tenant_id)`** e, per le liste tipiche,
  indice composito **`(tenant_id, <colonna d'uso>)`** (status, data, FK).
- Indice su **ogni FK** usata in join frequenti.
- Indici parziali dove utile (es. record `status='active'`).
- **Non over-indicizzare**: niente indici su colonne a bassa selettività o su
  tabelle piccole/di lookup; ogni indice ha costo in scrittura.

## 2. Indici per tabelle ad alto volume

| Tabella | Indici raccomandati |
|--|--|
| `inv_movement` | `(tenant_id, material_id, occurred_at)`, `(tenant_id, ref_type, ref_id)` |
| `inv_reservation` | `(tenant_id, material_id) WHERE status='active'` |
| `sales_order` | `(tenant_id, status, created_at)`, `(tenant_id, customer_id)`, UNIQUE `(tenant_id, number)` |
| `sales_order_item` | `(tenant_id, order_id)`, `(tenant_id, product_id)` |
| `prod_work_order` | `(tenant_id, status, planned_start)`, `(tenant_id, order_id)` |
| `prod_work_order_operation` | `(tenant_id, work_order_id, seq)`, `(tenant_id, machine_id, status)` |
| `mac_machine_job` | `(tenant_id, machine_id, start_at)` |
| `fin_invoice` | `(tenant_id, status, due_date)`, UNIQUE `(tenant_id, number)` |
| `fin_payment` | `(tenant_id, invoice_id)`, `(tenant_id, received_at)` |
| `fin_cashflow_transaction` | `(tenant_id, occurred_at)`, `(tenant_id, bucket)` |
| `crm_customer` | `(tenant_id, segment)`, GIN trigram su `name`/`email` |
| `crm_activity` | `(tenant_id, customer_id, occurred_at)` |
| `events.domain_event` | `(tenant_id, status, occurred_at)`, UNIQUE `(idempotency_key)`, `(aggregate_type, aggregate_id)` |
| `automation.job_queue` | `(status, run_after)`, `(tenant_id, type)` |
| `audit.audit_log` | `(tenant_id, occurred_at)`, `(resource, resource_id)` |
| `dsn_design_object` | `(tenant_id, design_version_id, layer_id)` |

## 3. Ricerca (search)

| Entità | Strategia |
|--|--|
| customers | **pg_trgm GIN** su `name`,`email`,`phone` (fuzzy) + filtri strutturati |
| orders/quotes | filtro strutturato (`number`,`status`,`customer_id`,`date range`) + trgm su `number` |
| products/materials | trgm su `name`/`sku`/`code` + filtro categoria/tecnica |
| designs/projects | trgm su `name` + filtro stato; full-text (`tsvector`) se descrizioni lunghe |
| machines | filtro strutturato (piccolo volume) |

Regola: **full-text (`tsvector`)** per testi lunghi/descrizioni; **trigram** per
match parziale su nomi/codici; **filtri strutturati** (indici btree) per tutto il
resto. Evitare `ILIKE '%x%'` senza indice trgm su tabelle grandi.

## 4. Analytics

- **Query analitiche separate** dalle tabelle calde: usare **materialized views**.
- MV proposte: `mv_revenue`, `mv_margin` (da `fin_cost_allocation` + ordini),
  `mv_machine_utilization` (da job/downtime), `mv_inventory_status`
  (on_hand/reserved/available), `mv_customer_value`, `mv_cashflow`.
- **Refresh**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` su schedule (pg_cron) o
  triggerato da eventi rilevanti; le KPI live leggono dalle MV, non dalle OLTP.
- KPI settimanali/mensili (ricavi, margine, ticket medio, conversione, ROI
  macchina) allineati alla **Knowledge Base** (skill `kb-audit`).

## 5. Candidati a partitioning (futuro, non ora)
Tabelle append-only ad altissimo volume nel tempo → partizione per range temporale
quando cresceranno: `inv_movement`, `events.domain_event`, `audit.audit_log`,
`mac_machine_job`, `automation.execution_log`. **Non** partizionare prematuramente.

## 6. Anti-pattern da evitare
- Indici ridondanti (prefissi già coperti da un indice composito).
- Analytics pesanti su path transazionali (usare MV).
- JSONB non indicizzato usato per filtri frequenti (se serve, GIN mirato su
  chiavi specifiche, o normalizzare).

---

## 7. Addendum Fase 3.6 — correzioni indici (VINCOLANTE)

### 7.1 Indici aggiunti (mancanti)
- `fin_cost_allocation (tenant_id, ref_type, ref_id)`
- `dsn_design_version` UNIQUE `(tenant_id, design_id, version)`
- `sync.mutation_log` UNIQUE `(client_mutation_id)`, UNIQUE `(idempotency_key)`
- `events.domain_event` UNIQUE `(tenant_id, aggregate_type, aggregate_id, aggregate_version)`
- `events.outbox (status)`; `events.dlq (event_id)`
- `prod_work_order_material (tenant_id, work_order_id)`, `(tenant_id, work_order_operation_id)`

### 7.2 Indici rimossi (ridondanti)
- Rimuovere gli indici su `(tenant_id)` **da soli** dove esiste già un composito
  con `tenant_id` come **prefisso** (es. `sales_order`, `prod_work_order`,
  `fin_invoice`, `inv_movement`): il prefisso del composito copre le query per tenant.

### 7.3 Analytics
- `machine_utilization` non è più OLTP: nessun indice su tabella OLTP; l'MV
  `analytics.mv_machine_utilization` ha indice `(tenant_id, machine_id, period)`.

### 7.4 Write cost
- Su append-only ad alto volume (`inv_movement`, `events.domain_event`,
  `audit.audit_log`, `sync.mutation_log`) tenere il **minimo** indispensabile di
  indici per non penalizzare le scritture.
