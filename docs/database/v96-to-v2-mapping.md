# INGLY OS V2 — V96 → V2 Mapping Plan (solo piano)

> Fase 3 · solo documentazione. **Nessun dato migrato.** Piano di mappatura dalle
> entità IndexedDB/localStorage di v96 alle entità PostgreSQL V2. La migrazione
> reale (export→mapping→staging→validazione) avverrà solo su approvazione.

## 1. Premessa sulla qualità dati v96
In v96 i dati sono **client-side**, con schema **non centralizzato** (store
IndexedDB definiti nei moduli + molte chiavi `localStorage`) e **molti valori di
business hardcoded** nei template (prezzi, KPI, soglie). Quindi la mappatura è in
parte **1:1** (entità già presenti) e in parte **derivazione** (entità nuove che
in v96 non esistono come dati, ma come logica/testo).

## 2. Tabella di mappatura (sintesi)

| v96 (sorgente) | V2 (destinazione) | Tipo | Note/trasformazioni |
|--|--|--|--|
| Clienti (IDB/AppStore) | `crm_customer` (+`crm_company` se B2B) | Diretto/Split | separa azienda da contatto; deriva `segment` |
| Contatti dentro cliente | `crm_contact` | Split | normalizza |
| Lead/pipeline | `crm_lead`, `crm_opportunity` | Diretto | mappa stadi pipeline |
| Catalogo prodotti | `cat_product` (+`cat_product_variant`) | Diretto/Split | `sku` per tenant; tecnica/materiale |
| Prezzi/markup hardcoded | `cat_price_list`,`cat_price_rule` | **Derivazione** | estrarre formule dai template → regole dati |
| Preventivi | `sales_quote`(+`_item`,`_status_history`) | Diretto | totals come snapshot JSONB |
| Ordini/Order Tracker | `sales_order`(+`_item`,`_status_history`) | Diretto | mappa stati → enum |
| Vendite & Fatture | `fin_invoice`(+`_item`),`fin_payment` | Split | separa fattura da pagamento |
| Cashflow | `fin_cashflow_transaction` | Diretto | bucket profit-first |
| Costi fissi/spese | `fin_expense` | Diretto | categoria |
| Magazzino (stock numero) | `inv_material`+`inv_movement`+`inv_balance` | **Split** | stock diventa somma movimenti; saldo iniziale = movimento `adjust` |
| Kit/Lista acquisti | `prod_bom`/`prod_bom_item` + suggerimenti | Derivazione | kit → BOM informale |
| Materiali & Macchine | `inv_material`, `mac_machine`(+`_profile`) | Split | costi macchina → profilo + cost_allocation |
| Smart Quoter (laser/3D) | usa `cat_price_rule`+`prod_routing` | **Derivazione** | logica pricing → dati (regole/tempi) |
| Progetti | `prj_project`(+`prj_project_asset`) | Diretto | |
| Image Library/design | `dsn_design`(+`_version`,`_object`) + Storage | Split | binari→Storage, metadati→DB |
| Brand white-label (localStorage) | `tenant_settings.brand` | Diretto | logo/nome/colore |
| Config Supabase/Stripe (localStorage) | `integ.integration`(+cred in Vault) | Split | secret→Vault |
| Utenti SaaS (`ingly_saas_db`/Supabase) | `tenant`,`tenant_membership`,`user_role` | Diretto/Estensione | piani→ruoli+entitlement |
| KPI/soglie hardcoded | `analytics.kpi_definition` | **Derivazione** | definizioni→tabella |

## 3. Entità NUOVE (nessuna sorgente in v96 → si creano vuote/derivate)
Work order/operazioni, routing, prenotazioni/movimenti inventario strutturati,
qualità (check/non conformità/rework/scrap), spedizioni strutturate, eventi di
dominio, automazioni, audit log, run/raccomandazioni AI, ruoli/permessi espliciti.
→ Non richiedono migrazione dati: partono dall'uso in V2.

## 4. Campi deprecati / ignoti
- **Deprecati**: flag UI e toggle in `localStorage` (non business) → non migrati.
- **Ignoti/ambigui**: eventuali store legacy non documentati → in fase di export
  vanno **ispezionati** e mappati o scartati con log (nessuna perdita silenziosa).
- **Hardcoded business data**: prezzi/markup/KPI nei template → **estratti** in
  tabelle dati (price_rule, kpi_definition), con verifica `kb-audit`.

## 5. Rischi di qualità dati
| Rischio | Mitigazione |
|--|--|
| Stock come "numero magico" senza storico | Saldo iniziale come movimento `adjust`; storico riparte da lì |
| Clienti duplicati/non normalizzati | Deduplica su email/nome in staging prima dell'import |
| Prezzi incoerenti vs KB | Audit `kb-audit` sulle regole estratte |
| Preventivi/ordini con totali calcolati al volo | Congelare snapshot totals all'import |
| Chiavi localStorage miste (dati+UI) | Whitelist esplicita di ciò che è business |
| Encoding/valute/date | Normalizzazione in staging (EUR, ISO date) |

## 6. Processo di migrazione (quando approvato — NON ora)
```
1. EXPORT controllato dei dati IndexedDB/localStorage (tool read-only)
2. MAPPING secondo questa tabella → dataset intermedio
3. IMPORT in ambiente STAGING (mai produzione)
4. VALIDAZIONE (conteggi, integrità FK, audit kb) + report
5. Solo dopo OK: promozione, con backup e rollback (Regole 4–5)
```
Nessuna migrazione automatica/distruttiva; dry-run obbligatorio; v96 resta la
produzione finché la validazione non è approvata.

---

## 7. Addendum Fase 3.6 (coerenza con correzioni)
- **Valuta/periodo**: all'import impostare `currency='EUR'`; date normalizzate ISO;
  competenza ricavi su `issue_date`, cassa su `received_at`.
- **Snapshot**: preventivi/ordini/fatture importati **congelano** unit_price/discount/
  vat_rate/cost/line_total come colonne (non solo JSONB totals).
- **Stock**: confermato — saldo iniziale come singolo `inv_movement` tipo `adjust`;
  nessun `inv_balance` scritto a mano (deriva dai movimenti).
- **Utilization/qualità/automazione**: nessuna sorgente v96 → partono da V2 con la
  struttura corretta (MV utilization; qc unificata; conditions JSONB).
- **Design→work order**: eventuali produzioni storiche importate puntano a una
  `design_version` snapshot immutabile (se il dato manca, si crea una versione
  "as-built" congelata).
