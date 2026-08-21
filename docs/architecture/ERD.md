# INGLY OS V2 — Entity Relationship Diagram (ERD)

> Fase 3 · solo documentazione. ERD testuale (Mermaid) delle entità principali e
> delle relazioni canoniche. Attributi ridotti alle chiavi per leggibilità; lo
> schema completo è in `database-v2.md`. Nessuna tabella creata.

## 1. Core commerciale + produzione + finanza

```mermaid
erDiagram
  TENANT ||--o{ TENANT_MEMBERSHIP : has
  TENANT ||--o{ CRM_CUSTOMER : owns
  TENANT ||--o{ CAT_PRODUCT : owns
  TENANT ||--o{ INV_MATERIAL : owns
  TENANT ||--o{ MAC_MACHINE : owns

  CRM_CUSTOMER ||--o{ SALES_QUOTE : requests
  SALES_QUOTE ||--o{ SALES_QUOTE_ITEM : contains
  SALES_QUOTE ||--o| SALES_ORDER : converts_to
  SALES_ORDER ||--o{ SALES_ORDER_ITEM : contains
  SALES_ORDER ||--o{ PROD_WORK_ORDER : triggers
  SALES_ORDER ||--o| FIN_INVOICE : billed_by
  SALES_ORDER ||--o{ SHP_SHIPMENT : ships_via

  PROD_WORK_ORDER ||--o{ PROD_WORK_ORDER_OPERATION : has
  PROD_WORK_ORDER ||--o{ PROD_WORK_ORDER_MATERIAL : consumes
  PROD_WORK_ORDER ||--o{ QC_QUALITY_CHECK : verified_by
  PROD_WORK_ORDER_OPERATION }o--o| MAC_MACHINE : runs_on
  PROD_WORK_ORDER_MATERIAL }o--|| INV_MATERIAL : uses

  INV_MATERIAL ||--o{ INV_MOVEMENT : moved_by
  INV_MATERIAL ||--o{ INV_RESERVATION : reserved_by
  INV_MATERIAL ||--o{ PUR_PURCHASE_ORDER_ITEM : purchased_as
  PUR_PURCHASE_ORDER ||--o{ PUR_PURCHASE_ORDER_ITEM : contains
  PUR_SUPPLIER ||--o{ PUR_PURCHASE_ORDER : supplies

  FIN_INVOICE ||--o{ FIN_INVOICE_ITEM : contains
  FIN_INVOICE ||--o{ FIN_PAYMENT : paid_by
  SALES_ORDER ||--o{ FIN_COST_ALLOCATION : allocates
  PROD_WORK_ORDER ||--o{ FIN_COST_ALLOCATION : allocates

  MAC_MACHINE ||--o{ MAC_MACHINE_JOB : performs
  MAC_MACHINE ||--o{ MAC_MACHINE_MAINTENANCE : maintained_by
  MAC_MACHINE ||--o{ MAC_MACHINE_DOWNTIME : has
```

## 2. Design → produzione

```mermaid
erDiagram
  PRJ_PROJECT ||--o{ DSN_DESIGN : contains
  DSN_DESIGN ||--o{ DSN_DESIGN_VERSION : versioned_as
  DSN_DESIGN_VERSION ||--o{ DSN_DESIGN_LAYER : has
  DSN_DESIGN_LAYER ||--o{ DSN_DESIGN_OBJECT : contains
  DSN_DESIGN_VERSION ||--o{ DSN_PREFLIGHT_RESULT : checked_by
  DSN_DESIGN_VERSION ||--o{ DSN_DESIGN_EXPORT : exported_as
  DSN_DESIGN_VERSION ||--o| PROD_BOM : produces
  PROD_BOM ||--o{ PROD_BOM_ITEM : contains
  PROD_BOM_ITEM }o--o| INV_MATERIAL : requires
  PROD_BOM ||--o| PROD_ROUTING : routed_by
  PROD_ROUTING ||--o{ PROD_ROUTING_OPERATION : has
  PROD_ROUTING_OPERATION }o--o| MAC_MACHINE_PROFILE : on
  DSN_DESIGN_VERSION ||--o{ PROD_WORK_ORDER : manufactured_by
```

## 3. Sicurezza, eventi, automazione, AI, audit

```mermaid
erDiagram
  TENANT ||--o{ TENANT_MEMBERSHIP : has
  TENANT_MEMBERSHIP }o--|| ROLE : granted
  ROLE ||--o{ ROLE_PERMISSION : maps
  ROLE_PERMISSION }o--|| PERMISSION : includes

  TENANT ||--o{ DOMAIN_EVENT : emits
  DOMAIN_EVENT ||--o| OUTBOX_EVENT : dispatched_by
  DOMAIN_EVENT ||--o{ AUTOMATION_EXECUTION : triggers
  AUTOMATION ||--o{ AUTOMATION_TRIGGER : listens
  AUTOMATION ||--o{ AUTOMATION_CONDITION : gated_by
  AUTOMATION ||--o{ AUTOMATION_ACTION : runs
  AUTOMATION ||--o{ AUTOMATION_EXECUTION : executed_as
  AUTOMATION_EXECUTION ||--o{ AUTOMATION_EXECUTION_LOG : logs

  AI_RUN ||--o{ AI_RECOMMENDATION : produces
  AI_RECOMMENDATION ||--o| AI_DECISION : decided_by
  AI_RECOMMENDATION ||--o| AI_APPROVAL : gated_by

  TENANT ||--o{ AUDIT_LOG : records
```

## 4. Note di lettura
- `||--o{` = uno-a-molti; `}o--o|` = molti-a-uno opzionale; `||--o|` = uno-a-uno
  opzionale.
- Tutte le entità business portano `tenant_id` (relazione con `TENANT` implicita
  anche dove non disegnata per non appesantire).
- Tabelle immutabili (movimenti, eventi, pagamenti, audit) non hanno relazioni di
  "update/delete": sono append-only.
