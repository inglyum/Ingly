# INGLY OS — ERP Data Mapping V96 → V2 (Fase 8C)

> Mappa le entità dell'ERP attuale (v96, IndexedDB/localStorage) alle tabelle
> Supabase V2, con tenant ownership, requisiti RBAC e CRUD. **Nessuna migrazione
> creata**: solo mappatura + identificazione delle slice backend mancanti.
> V96 e produzione intatti. Coerente con `docs/architecture/database-v2.md`.

## Legenda
- **Tenant**: la riga porta `tenant_id` (isolamento RLS).
- **RBAC**: ruoli che possono operare (lettura/scrittura).
- **CRUD**: operazioni previste in V2 (C/R/U/D + comandi transazionali).

## Mappatura entità

| Entità V96 (dominio) | IndexedDB/local (v96) | Tabella V2 (Supabase) | Tenant | RBAC (scrittura) | CRUD / Comandi |
|--|--|--|--|--|--|
| Cliente | store clienti / AppStore | `crm_customer` (+`crm_company`) | sì | SALES/MANAGER/ADMIN/OWNER | CRUD |
| Contatto | dentro cliente | `crm_contact` | sì | SALES/MANAGER | CRUD |
| Lead / Opportunità | pipeline | `crm_lead`,`crm_opportunity` | sì | SALES/MANAGER | CRUD |
| Prodotto / Catalogo | store catalog | `cat_product`(+`cat_product_variant`) | sì | ADMIN/MANAGER | CRUD |
| Materiale | store materiali | `inv_material`(+batch) | sì | WAREHOUSE/ADMIN | CRUD |
| Prezzi/Listino | hardcoded/localStorage | `cat_price_list`,`cat_price_rule` | sì | ADMIN/MANAGER(approve) | CRUD |
| Preventivo | store preventivi | `sales_quote`(+`_item`,`_status_history`) | sì | SALES/MANAGER | CRUD + `create_quote`/`accept_quote` |
| Ordine | order tracker | `sales_order`(+`_item`,`_status_history`) | sì | SALES/PRODUCTION/MANAGER | CRUD + `confirm_order` |
| Vendita/Fattura | vendite & fatture | `fin_invoice`(+`_item`) | sì | FINANCE/OWNER | `issue_invoice` |
| Pagamento | dentro vendite | `fin_payment` | sì | FINANCE | `record_payment` (idempotente) |
| Cassa (profit-first) | cashflow | `fin_cashflow_transaction` | sì | FINANCE | C/R (append-only) |
| Costi fissi/spese | costi fissi | `fin_expense` | sì | FINANCE | CRUD |
| Magazzino/stock | store items | `inv_movement`(+`inv_balance` cache) | sì | WAREHOUSE/PRODUCTION | comandi `reserve/consume/adjust` |
| Fornitori | suppliers | `pur_supplier`(+PO) | sì | WAREHOUSE/ADMIN | CRUD + `receive_purchase_order` |
| Produzione/Workflow | gestione ordini | `prod_work_order`(+op,+material) | sì | PRODUCTION | comandi `create/schedule/start/complete` |
| Macchine/Attrezzature | equipment/materials | `mac_machine`(+profile,maint) | sì | PRODUCTION/ADMIN | CRUD |
| Progetti | progetti | `prj_project`(+asset) | sì | DESIGNER/MANAGER | CRUD |
| Immagini/Design | image lib | `dsn_design`(+version) + Storage | sì | DESIGNER | CRUD + `create/publish_version` |
| Impostazioni/Brand | localStorage brand | `tenant_settings` | sì | ADMIN/OWNER | R/U |
| Utenti/SaaS | `ingly_saas_db`/Supabase | `tenant`,`tenant_membership`,`user_role` | sì | OWNER/ADMIN | comandi invito/ruoli |
| KPI/Analytics | calcolati a runtime | `analytics.mv_*` (per-tenant) | sì | (lettura) tutti | R |
| Marketing/Etsy/Trend | vari store | (fase successiva) | sì | SALES/MANAGER | da definire |
| Backup/Storico | export JSON/ZIP | export server + `audit.audit_log` | sì | OWNER/ADMIN | R + export |

## Slice backend mancanti (da costruire, in ordine)
1. **CRM slice**: `crm_*` + policy + comandi base (già foundation tenancy/RBAC pronta).
2. **Catalog slice**: `cat_*` + pricing rules.
3. **Sales slice**: `sales_quote/order` + `confirm_order` (dipende da inventory per reservation).
4. **Inventory slice**: `inv_material/movement/reservation` + `reserve_material` (HR-1 lock).
5. **Finance slice**: `fin_invoice/payment/cashflow` + `issue_invoice`/`record_payment`.
6. Poi Production/MES, Machines, Design→Produzione, Marketing.

## Note
- La foundation (tenancy, RBAC, audit, eventi/outbox, sync) è **già applicata in
  staging** (mig. `20260101000001`/`20260101000002`) → le slice sopra sono
  migrazioni **incrementali** successive (non create qui).
- Nessun dato reale migrato; l'app V2 mostra stati vuoti finché le slice non sono
  connesse. Migrazione dati v96→V2: vedi `docs/database/v96-to-v2-mapping.md`.
