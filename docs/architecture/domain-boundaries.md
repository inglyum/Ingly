# INGLY OS V2 — Domain Boundaries, Multi-Tenancy, RBAC, API

> Fase 2 · solo design. Nessuna modifica a codice/DB. Definisce i confini dei
> moduli di dominio, la multi-tenancy con RLS, RBAC e l'architettura API/eventi.

## 1. Moduli di dominio (bounded contexts)

Ogni modulo espone **servizi di dominio** e comunica con gli altri **solo via
eventi** o interfacce di servizio esplicite (niente accesso incrociato ai dati).

| Contesto | Entità principali | Responsabilità |
|--|--|--|
| **CONTROL** | dashboard, kpi_snapshot | Vista aggregata, health, "cosa fare oggi" |
| **AUTH/RBAC** | tenant, user, membership, role, permission, audit_log | Identità, autorizzazione, audit |
| **CRM** | lead, customer, contact, opportunity, activity | Relazioni e pipeline commerciale |
| **CATALOG** | product, product_variant, service, price_list, price_rule | Offerta e pricing |
| **SALES** | quote, quote_item, order, order_item, order_status_history | Preventivi → ordini |
| **PURCHASING** | supplier, purchase_order, purchase_order_item | Approvvigionamento |
| **INVENTORY** | material, material_batch, inventory, inventory_movement, reservation | Stock e movimenti |
| **PRODUCTION/MES** | bom, bom_item, routing, work_order, work_order_operation | Pianificazione e ordini di lavoro |
| **MACHINES** | machine, machine_profile, machine_job, machine_maintenance, machine_utilization | Capacità, ROI, manutenzione |
| **QUALITY** | quality_check, non_conformance, rework, scrap | Controllo qualità |
| **SHIPPING** | shipment, shipment_item | Spedizione e tracking |
| **FINANCE** | invoice, payment, expense, cashflow_transaction | Ricavi, costi, cassa, COGS, margini |
| **PROJECTS** | project, project_asset | Contenitore lavori/asset cliente |
| **DESIGN STUDIO** | design, design_version, design_layer, design_object | Vettoriale + metadati di produzione |
| **AUTOMATION** | automation, automation_trigger, automation_action, automation_execution | Rules engine |
| **AI** | ai_run, ai_recommendation, ai_decision_log | Servizi AI e tracciabilità |
| **ANALYTICS** | report, kpi, forecast (viste/MV) | Reporting non transazionale |

### Regole di confine
- Un contesto **possiede** le sue tabelle; gli altri accedono via servizio/evento.
- Le **FK cross-contesto** usano ID immutabili (es. `order.customer_id`), ma la
  logica resta nel contesto proprietario.
- La UI **non** implementa regole di pricing/inventario/produzione.

## 2. Multi-tenancy

**Modello:** tenant condiviso a livello DB, isolato via **`tenant_id` + RLS**.

Entità di tenancy:
- `tenant` (azienda cliente del SaaS; es. "Ingly Design")
- `user` (identità Supabase Auth)
- `membership` (user ↔ tenant, con `role`)
- `role`, `permission` (RBAC)
- Ogni tabella business: colonna **`tenant_id NOT NULL`**.

**Row Level Security (concetto):**
- Funzione `auth.uid()` (Supabase) → risolve le membership dell'utente.
- Policy standard per ogni tabella:
  - `SELECT/UPDATE/DELETE`: consentito se esiste membership dell'utente sul
    `tenant_id` della riga **e** il ruolo ha il permesso sull'azione/risorsa.
  - `INSERT`: `tenant_id` forzato a un tenant di cui l'utente è membro.
- Nessun accesso cross-tenant possibile anche se l'API venisse aggirata: il
  confine è **nel database** (difesa in profondità).

## 3. RBAC — ruoli, gerarchia, permessi

**Ruoli** (9): `OWNER > ADMIN > MANAGER > {SALES, DESIGNER, PRODUCTION, WAREHOUSE, FINANCE} > VIEWER`.

- **OWNER**: tutto sul tenant, gestione membership/fatturazione SaaS.
- **ADMIN**: config, utenti, tutti i moduli operativi.
- **MANAGER**: operatività cross-modulo, approvazioni, no gestione utenti.
- **SALES**: CRM, preventivi, ordini (no produzione/finance sensibile).
- **DESIGNER**: Design Studio, progetti, preflight (no finance).
- **PRODUCTION**: MES, work order, macchine, qualità.
- **WAREHOUSE**: inventario, movimenti, acquisti (ricezione).
- **FINANCE**: fatture, pagamenti, cassa, report finanziari.
- **VIEWER**: sola lettura.

**Modello permessi:** matrice `permission(resource, action)` con azioni
`create/read/update/delete/approve/export`. La membership porta un `role`; il
ruolo mappa a un set di permessi. Autorizzazione applicata **due volte**:
Application layer (UX/azioni) **e** RLS (dati) — la seconda è quella vincolante.

**Audit:** ogni operazione sensibile (create/update/delete/approve su ordini,
prezzi, pagamenti, produzione, permessi) scrive su `audit_log` (immutabile:
solo INSERT), con `who/when/what/before/after/tenant`.

## 4. API architecture

- **CRUD standard** → PostgREST (auto-API su tabelle, filtrata da RLS).
- **Operazioni transazionali/complesse** → **Edge Functions** (una funzione =
  un caso d'uso), es. `confirmOrder`, `scheduleWorkOrder`, `receiveStock`,
  `issueInvoice`. Eseguono in **transazione** DB.
- **Convenzioni**:
  - **Validazione**: schema server-side (mai fidarsi del client).
  - **Errori**: formato uniforme `{code, message, details}` + HTTP status.
  - **Idempotenza**: header `Idempotency-Key` per POST che creano risorse/pagamenti.
  - **Paginazione**: cursor-based (`created_at`,`id`); `limit` default e max.
  - **Filtering/sorting**: whitelist di campi per tabella.
  - **Autorizzazione**: RLS + check ruolo in Edge Function.
  - **Rate limiting**: per utente/tenant su endpoint pubblici e Edge.
  - **Webhooks**: in ingresso (Stripe) verificati con firma; in uscita per
    automazioni verso sistemi esterni del tenant.
  - **Background jobs**: coda `job_queue` + worker (Edge scheduled / pg_cron).

**Operazioni transazionali (obbligatorio):** conferma ordine, prenotazione
materiale, creazione work order, ricezione/scarico stock, emissione fattura,
registrazione pagamento, avanzamento produzione, spedizione. Ognuna atomica con
eventi emessi nella **stessa transazione** (outbox) per non perdere eventi.

## 5. Event architecture (domain events)

Tabella `domain_events` (append-only) + pattern **transactional outbox**: l'evento
è scritto nella stessa transazione dell'operazione; un dispatcher lo consegna ai
consumatori (automazioni, notifiche, AI, analytics) con **at-least-once** + idempotenza.

| Event | Producer | Payload (chiave) | Consumers | Retry | Idempotenza | Audit |
|--|--|--|--|--|--|--|
| order.created | SALES | order_id, customer_id, totals | AUTOMATION, ANALYTICS | sì (backoff) | event_id | sì |
| order.confirmed | SALES | order_id | INVENTORY, PRODUCTION, FINANCE, AUTOMATION | sì | event_id | sì |
| payment.received | FINANCE | invoice_id, amount | SALES, ANALYTICS, AUTOMATION | sì | payment_id | sì |
| stock.reserved | INVENTORY | material_id, qty, order_id | PRODUCTION | sì | reservation_id | sì |
| stock.low / stock.critical | INVENTORY | material_id, level | PURCHASING, AUTOMATION, AI | sì | material_id+day | sì |
| work_order.created | PRODUCTION | work_order_id, order_id | MACHINES, AUTOMATION | sì | wo_id | sì |
| production.started/completed | PRODUCTION | work_order_id | QUALITY, ANALYTICS, SALES | sì | wo_id+state | sì |
| quality.failed | QUALITY | work_order_id, reason | PRODUCTION(rework), AUTOMATION | sì | check_id | sì |
| shipment.created | SHIPPING | shipment_id, order_id | SALES, FINANCE | sì | shipment_id | sì |
| invoice.overdue | FINANCE | invoice_id | CRM, AUTOMATION, AI | sì | invoice_id+day | sì |
| customer.inactive | CRM | customer_id | AUTOMATION, AI | sì | customer_id+period | sì |

**Dead-letter**: eventi falliti oltre N tentativi → `event_dlq` con motivo, per
ispezione/replay manuale.

## 6. Relazioni canoniche (riassunto; dettaglio in data-flow)

- CUSTOMER → QUOTE → ORDER → WORK_ORDER → (MATERIAL, MACHINE) → PRODUCTION →
  QUALITY → SHIPMENT → INVOICE → PAYMENT.
- DESIGN → DESIGN_VERSION → PREFLIGHT → BOM → (MATERIAL, MACHINE) → WORK_ORDER.
- INVENTORY → PROCUREMENT → SUPPLIER → PURCHASE_ORDER.
- EVENTS → AUTOMATION → NOTIFICATIONS → AI.
