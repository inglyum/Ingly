# INGLY OS V2 — Schema Map

> Fase 3 · solo documentazione. Mappa dei domini→schemi→tabelle e delle relazioni
> canoniche. Nessun SQL, nessuna migrazione.

## 1. Schemi fisici

| Schema | Esposto via PostgREST | Contenuto | Accesso |
|--|--|--|--|
| `public` | Sì (protetto da RLS) | Tabelle business CRUD (prefisso dominio) | Utente autenticato via RLS |
| `audit` | No | Log immutabili | Service-role / trigger |
| `events` | No | domain_event, outbox, dlq | Service-role / Edge |
| `automation` | No | automazioni, code, esecuzioni | Service-role / Edge |
| `ai` | No | run/raccomandazioni/decisioni AI | Service-role / Edge |
| `integ` | No | integrazioni + credenziali (Vault) | Service-role |
| `analytics` | Sì (sola lettura, viste) | KPI, snapshot, MV | Utente (SELECT) |

## 2. Domini → tabelle (prefissi in `public`)

| # | Dominio | Prefisso | Tabelle principali |
|--|--|--|--|
| 1 | identity | `profile`,`tenant*` | tenant, tenant_settings, profile, tenant_membership |
| 2 | security | `role/permission` | role, permission, role_permission, user_role |
| 3 | crm | `crm_` | company, customer, contact, lead, opportunity, activity, task |
| 4 | catalog | `cat_` | product, product_variant, service, price_list, price_rule |
| 5 | sales | `sales_` | quote, quote_item, quote_status_history, order, order_item, order_status_history |
| 6 | purchasing | `pur_` | supplier, purchase_order, purchase_order_item |
| 7 | inventory | `inv_` | material, material_variant, material_batch, location, balance, reservation, movement |
| 8 | production | `prod_` | bom, bom_item, routing, routing_operation, work_order, work_order_operation, work_order_material, work_order_status_history |
| 9 | machines | `mac_` | machine, machine_profile, machine_maintenance, machine_job, machine_downtime, machine_utilization |
| 10 | quality | `qc_` | quality_check, non_conformance, rework, scrap |
| 11 | projects | `prj_` | project, project_asset |
| 12 | design | `dsn_` | design, design_version, design_layer, design_object, design_export, preflight_result |
| 13 | shipping | `shp_` | shipment, shipment_item, shipment_event |
| 14 | finance | `fin_` | invoice, invoice_item, payment, expense, cashflow_transaction, cost_allocation |
| 15 | automation | schema `automation` | automation, trigger, condition, action, execution, execution_log, job_queue |
| 16 | events | schema `events` | domain_event, outbox, dlq |
| 17 | integrations | schema `integ` | integration, integration_credential, webhook |
| 18 | ai | schema `ai` | ai_run, ai_recommendation, ai_decision, ai_approval |
| 19 | analytics | schema `analytics` | kpi_definition, kpi_value, snapshot, mv_* |
| 20 | audit | schema `audit` | audit_log |

## 3. Relazioni canoniche (FK principali)

### Ciclo commerciale/produttivo
```
crm_customer 1─* sales_quote 1─* sales_quote_item
sales_quote 1─0..1 sales_order 1─* sales_order_item
sales_order 1─* prod_work_order 1─* prod_work_order_operation
prod_work_order 1─* prod_work_order_material *─1 inv_material
prod_work_order_operation *─0..1 mac_machine
prod_work_order 1─* qc_quality_check
sales_order 1─* shp_shipment 1─* shp_shipment_item
sales_order 1─0..1 fin_invoice 1─* fin_invoice_item
fin_invoice 1─* fin_payment
```

### Design → produzione
```
dsn_design 1─* dsn_design_version 1─* dsn_design_layer 1─* dsn_design_object
dsn_design_version 1─* dsn_preflight_result
dsn_design_version 1─0..1 prod_bom 1─* prod_bom_item *─1 inv_material
prod_bom 1─0..1 prod_routing 1─* prod_routing_operation *─0..1 mac_machine_profile
dsn_design_version 1─* prod_work_order
```

### Inventario → approvvigionamento
```
inv_material 1─* inv_movement        (sorgente di verità stock)
inv_material 1─* inv_reservation
inv_material 1─* pur_purchase_order_item *─1 pur_purchase_order *─1 pur_supplier
```

### Macchina → costo
```
mac_machine 1─* mac_machine_job *─0..1 prod_work_order_operation
mac_machine 1─* mac_machine_maintenance
mac_machine 1─* mac_machine_downtime
mac_machine 1─* mac_machine_utilization
(→ fin_cost_allocation per contributo costo/ROI)
```

### Trasversali
```
tenant 1─* (ogni tabella business).tenant_id
tenant_membership *─1 role ; role *─* permission (role_permission)
(ogni operazione sensibile) → audit.audit_log
(ogni operazione transazionale) → events.domain_event → events.outbox
```

## 4. Split / merge rispetto a v96
- **Split**: lo "stock" unico del monolite → `inv_balance` (cache) + `inv_movement`
  (verità) + `inv_reservation`.
- **Split**: "macchina" con costi inline → `mac_machine` + `mac_machine_profile` +
  costi via `fin_cost_allocation`.
- **Merge**: dati cliente sparsi → `crm_customer` (+ `crm_company` per B2B).
- **Nuove**: work order/operazioni, qualità, eventi, automazioni, audit, AI —
  non esistono come entità in v96.
