# INGLY OS V2 — Data Flow, Storage, AI, Automation, Observability

> Fase 2 · solo design. Nessuna modifica a codice/DB. Descrive i flussi dati
> canonici, la separazione di storage, l'architettura AI/automazione/reporting e
> l'observability.

## 1. Flussi di dominio canonici

### 1.1 Order-to-cash (con produzione)
```
CUSTOMER
  └─ QUOTE (validità 7gg) ── accept ──▶ ORDER
        ORDER.confirmed ─▶ [transazione]
           ├─ INVENTORY: reserve materials  (stock.reserved)
           ├─ PRODUCTION: create WORK_ORDER  (work_order.created)
           │      └─ ROUTING → OPERATIONS → schedule on MACHINE
           ├─ FINANCE: projection + (acconto 50% se >€50)
           └─ CRM: update customer status  +  NOTIFICATION
        PRODUCTION.started → … → PRODUCTION.completed
           └─ QUALITY.check → (pass) SHIPMENT.created
                                 └─ INVOICE (+SDI) → PAYMENT.received
```
Ogni freccia con evento è **idempotente** e **loggata** (audit + domain_events).

### 1.2 Design-to-production
```
DESIGN ─▶ DESIGN_VERSION ─▶ PREFLIGHT (SVG/DXF validation)
   └─ (pass) ─▶ BOM (materiali+quantità) ─▶ reserve MATERIAL
                         └─ assign MACHINE (area/materiale/kerf) ─▶ WORK_ORDER
```
Preflight rileva: path aperti, geometrie duplicate, path a lunghezza zero, SVG
non valido, oggetti non supportati, geometrie troppo piccole, path sovrapposti,
unità mancanti, materiale/parametri macchina mancanti.

### 1.3 Procurement
```
INVENTORY.stock.low ─▶ PURCHASING: purchase suggestion
   └─ SUPPLIER (lead time) ─▶ PURCHASE_ORDER ─▶ (receive) ─▶ INVENTORY.movement(+)
```

### 1.4 Automation & AI
```
DOMAIN EVENT ─▶ AUTOMATION (condition→action) ─▶ NOTIFICATION / job
                                   └─▶ AI (structured input) ─▶ RECOMMENDATION (log)
```

## 2. Separazione dello storage

| Store | Cosa contiene | Autorità |
|--|--|--|
| **PostgreSQL** | Tutte le entità business, audit, eventi, automazioni, finanza, produzione, inventario, metadati design | **Sorgente di verità** |
| **Supabase Storage** | Binari: SVG/DXF/PNG/JPG/PDF, anteprime, export | Autorità per i **file** |
| **IndexedDB (client)** | Cache di lettura, **coda mutazioni offline (outbox)**, bozze | Effimero/riconciliabile |
| **local cache / state** | Preferenze UI, brand white-label, sessione, toggle | Locale al dispositivo |

### Cosa DEVE stare server-side
Ordini, preventivi, clienti, materiali/stock, work order, macchine, qualità,
spedizioni, fatture/pagamenti/cassa, cataloghi ufficiali, permessi/audit,
automazioni, log AI, metadati design/versioni.

### Cosa PUÒ restare locale/offline
Cache di lettura, coda scritture offline (sync al ritorno online), preferenze e
personalizzazioni UI (tema, brand), bozze non inviate. **IndexedDB non si rimuove**
(Regola 12): diventa cache+coda, non più DB primario.

### Sync engine (client)
- Lettura: server → cache IDB (con `updated_at`/versione).
- Scrittura offline: mutazione → **outbox IDB** → invio all'API alla riconnessione
  → conferma/riconciliazione. Conflitti: policy per entità (es. ordini = server
  vince + merge campi non critici; bozze = client vince).

## 3. Design asset storage (dettaglio)

- **Metadati in Postgres**: `design`, `design_version` (numero, autore, timestamp,
  `manufacturing_status`, `production_status`), `design_layer`, `design_object`
  (tipo path/text/shape/image/group, parametri, mapping materiale/livello).
- **Binari in Storage**: file sorgente (SVG/DXF/PDF/PNG/JPG) + **anteprime**
  generate; path referenziato dai metadati (`storage_path`, `checksum`, `size`).
- **Versioni**: ogni salvataggio = nuova `design_version` (immutabile) → storico e
  rollback. I dati di manifattura (kerf, cut/engrave/score, nesting) vivono nei
  metadati, collegati a BOM/work order.

## 4. Reporting / analytics

- **Separazione OLTP/analytics**: le query analitiche **non** girano sulle tabelle
  transazionali calde. Si usano **viste** e, dove costoso, **materialized views**
  aggiornate su schedule/evento.
- **Query operative** (liste, dettagli) → indicizzate, cursor pagination.
- **KPI** (settimana/mese, margine, ticket medio, conversione, ROI macchina)
  calcolati da MV; le definizioni restano allineate alla **Knowledge Base**
  (skill `kb-audit`).
- **Forecast** (domanda/cassa) come job periodico che scrive in `forecast`.

## 5. AI architecture

Servizi AI **concettuali**, tutti su **input strutturati** (viste/MV) e con
**output loggato** (`ai_run`, `ai_recommendation`, `ai_decision_log`):

| Servizio | Input | Output | Permessi | Sicurezza |
|--|--|--|--|--|
| **AI CEO** | KPI aggregati, alert | "cosa fare oggi" (lista priorità) | MANAGER+ | Solo raccomandazioni |
| **AI CFO** | cashflow, AR/AP, margini, forecast | rischi cassa, azioni finanziarie proposte | FINANCE/OWNER | **Nessuna azione irreversibile** |
| **AI COO** | produzione, capacità, materiali | colli di bottiglia, rischio consegne | PRODUCTION/MANAGER | Propone, non esegue |
| **AI CMO** | clienti, conversione, riacquisto | campagne, clienti inattivi | SALES/MANAGER | Propone |
| **AI Production Manager** | schedule, macchine, materiali | allocazione, rischio scadenze | PRODUCTION | Propone scheduling, conferma umana |

**Regole AI**: mai eseguire azioni finanziarie o di produzione irreversibili senza
**conferma umana**; ogni run e raccomandazione **loggati**; input limitati dai
permessi del ruolo che invoca.

## 6. Automation (centralizzata)

Modello `EVENT → CONDITION → ACTION → EXECUTION → LOG`:
- **Scheduler**: pg_cron / Edge scheduled per trigger temporali (es. preventivo in
  scadenza, cliente inattivo, fattura overdue).
- **Queue**: `job_queue` con `FOR UPDATE SKIP LOCKED`; worker idempotenti.
- **Retry**: backoff esponenziale; **dead-letter** in `event_dlq`/`job_dlq`.
- **Idempotenza**: chiave per evento/azione (no doppie esecuzioni).
- **Permessi**: un'automazione esegue con un **ruolo di servizio** limitato;
  azioni sensibili richiedono policy esplicita.
- **Azioni**: create_task, notification, email, webhook, purchase_suggestion,
  reserve_material, create_work_order, schedule_machine, update_status,
  create_followup, generate_document, run_ai_analysis. **Tutte loggate.**

## 7. Observability

| Log | Contenuto | Uso |
|--|--|--|
| application logs | azioni use-case, errori client | debug UX |
| API logs | richieste Edge/PostgREST, latenza, esiti | performance/abuso |
| database logs | query lente, errori, migrazioni | tuning |
| automation logs | esecuzioni regole, retry, DLQ | affidabilità |
| AI logs | run, input ridotti, raccomandazioni, approvazioni | tracciabilità/safety |
| security/audit logs | operazioni sensibili (immutabili) | compliance |
| production events | avanzamenti work order, scarti, downtime | MES analytics |

Documenti operativi previsti (fasi successive, non ora):
`/docs/operations/observability.md`, `/docs/operations/disaster-recovery.md`.
