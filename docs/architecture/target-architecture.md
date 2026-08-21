# INGLY OS V2 — Target Architecture

> Fase 2 · **solo design**. Nessuna modifica a codice/DB/frontend, nessuna
> migrazione, nessuna skill creata. v96 resta intatta. Data: 2026-08-21.
> Direzione approvata: piattaforma **modulare, multi-utente, multi-dispositivo**
> ERP + MES + Design, backend **Supabase + PostgreSQL**, migrazione **incrementale
> e reversibile**.

## 1. Vista d'insieme

INGLY OS V2 diventa un sistema a **layer** con un **backend condiviso**
(Supabase/Postgres) come **unica sorgente di verità**, mentre il client resta
**offline-capable** (IndexedDB come cache/coda, non più come DB primario).

```
┌───────────────────────────────────────────────────────────────┐
│ PRESENTATION  (UI moduli, dashboard, design studio)            │
├───────────────────────────────────────────────────────────────┤
│ APPLICATION   (use-case/orchestrazione, sync engine, offline)  │
├───────────────────────────────────────────────────────────────┤
│ DOMAIN        (servizi di dominio, regole business, eventi)    │
├───────────────────────────────────────────────────────────────┤
│ DATA          (repository, Postgres, RLS, Storage, cache IDB)  │
├───────────────────────────────────────────────────────────────┤
│ INTEGRATION   (Stripe, WhatsApp, e-invoicing SDI, import/export)│
├───────────────────────────────────────────────────────────────┤
│ AUTOMATION    (rules engine: event→condition→action→log)       │
├───────────────────────────────────────────────────────────────┤
│ AI            (CEO/CFO/COO/CMO/Prod. Manager, structured I/O)   │
├───────────────────────────────────────────────────────────────┤
│ OBSERVABILITY (log app/api/db/automazioni/AI/audit)            │
└───────────────────────────────────────────────────────────────┘
```

## 2. Responsabilità dei layer

1. **PRESENTATION** — Rendering, interazione, stato UI locale. **Nessuna regola
   di business critica** (Principio 6): la UI chiama use-case dell'Application
   layer. Componenti moduli, dashboard, Design Studio (canvas SVG/DXF).
2. **APPLICATION** — Orchestra i casi d'uso ("conferma ordine", "genera work
   order"), gestisce **offline/sync** (coda mutazioni, riconciliazione), mapping
   DTO↔dominio, autorizzazione a livello di azione. Non conosce il DB direttamente.
3. **DOMAIN** — Cuore: entità, invarianti, **servizi di dominio** condivisi
   (Pricing, Inventory, Production, Finance…), **emissione di eventi di dominio**.
   Indipendente da UI e da Supabase (Principio 3–4).
4. **DATA** — Accesso centralizzato (Principio 5): repository su **PostgreSQL**
   via Supabase (PostgREST/Edge Functions), **RLS** per tenancy, **Supabase
   Storage** per binari, **IndexedDB** come cache/coda offline. Transazioni.
5. **INTEGRATION** — Adapter verso servizi esterni **realmente connessi**
   (Stripe, WhatsApp link, e-fattura SDI, import/export CSV/JSON/ZIP). Nessuna
   integrazione inventata (Regola 13).
6. **AUTOMATION** — Rules engine centralizzato che consuma eventi di dominio →
   condizioni → azioni → esecuzioni loggate. Scheduler, code, retry, DLQ.
7. **AI** — Servizi AI che consumano **dati strutturati** (mai testo grezzo di UI)
   e producono **raccomandazioni** loggate; **mai azioni irreversibili** senza
   conferma umana (Principio 10, Fase 11).
8. **OBSERVABILITY** — Log strutturati per app/API/DB/automazioni/AI + **audit
   log** di sicurezza + eventi di produzione.

## 3. Principi vincolanti (mappati)

| # | Principio | Come è rispettato in V2 |
|--|--|--|
| 1 | Preserva v96 | Backend affiancato; il monolite continua a funzionare offline |
| 2 | Migrazione incrementale | Fasi read-sync → write-sync → estrazione servizi |
| 3 | No dipendenza da global legacy | Nuovi moduli usano Application/Domain, non `window.*` |
| 4 | Business logic nei servizi | Regole in Domain services, non nei template |
| 5 | Accesso DB centralizzato | Repository unico; niente `createObjectStore` sparso |
| 6 | UI senza regole critiche | Pricing/inventory/produzione nel Domain |
| 7 | Tutto auditabile | `audit_log` + trigger su operazioni sensibili |
| 8 | Workflow transazionali | Funzioni Postgres/Edge in transazione |
| 9 | Eventi per automazione | `domain_events` + outbox |
| 10 | AI su dati strutturati | Viste/materialized views come input AI |
| 11 | Design ↔ Produzione | `design_version` → BOM → work order |
| 12 | Produzione ↔ Inventory/Machine | Reservations + machine jobs collegati |

## 4. Backend target (Supabase/Postgres)

- **PostgreSQL** come sorgente di verità transazionale; **RLS** per multi-tenant.
- **Auth**: Supabase Auth (già in uso per il gate) → esteso a membership+ruoli.
- **API**: PostgREST per CRUD standard + **Edge Functions** per operazioni
  transazionali/complesse (conferma ordine, scheduling, generazione documenti).
- **Realtime**: Supabase Realtime dove utile (coda produzione, stato ordini,
  notifiche) — non ovunque, per costo/complessità.
- **Storage**: Supabase Storage per asset di design (SVG/DXF/PNG/PDF) e anteprime;
  **metadati in Postgres**, **binari in Storage** (separazione netta).
- **Background jobs**: scheduler (pg_cron / Edge scheduled) + coda (tabella
  `job_queue` con lock `FOR UPDATE SKIP LOCKED`) + DLQ.

## 5. Multi-utente / multi-dispositivo

- Ogni record business ha `tenant_id`; l'accesso passa da **RLS** basata su
  membership dell'utente autenticato (vedi `domain-boundaries.md`).
- Il client è **thin**: legge/scrive via API; IndexedDB fa da **cache + coda
  offline**; alla riconnessione il **sync engine** riconcilia (last-write con
  versione/`updated_at`, conflict policy per entità).

## 6. Sicurezza (sintesi; dettaglio in domain-boundaries)

RBAC a 9 ruoli, permessi risorsa+azione, RLS server-side, validazione
server-side, secrets in env/vault (mai nel repo/HTML), rate limiting, audit log
immutabile. AI senza poteri distruttivi diretti.

## 7. Cosa resta locale vs server (anticipazione)

- **Server (Postgres)**: tutte le entità business condivise, audit, automazioni,
  finanza, produzione, inventario, CRM, cataloghi ufficiali.
- **Locale (IndexedDB/local)**: cache di lettura, **coda mutazioni offline**,
  preferenze UI, brand white-label, bozze non ancora inviate. **IndexedDB non
  viene rimosso** (Principio/Regola 12).

## 8. Decisioni architetturali chiave (ADR sintetici)

- **ADR-1**: Backend = Supabase/Postgres (già presente per auth) → minimo attrito.
- **ADR-2**: **Strangler pattern** — il backend affianca il monolite; i moduli
  migrano uno alla volta; niente big-bang rewrite.
- **ADR-3**: **Offline-first mantenuto** via cache+outbox su IndexedDB.
- **ADR-4**: **RLS come confine di sicurezza primario** (difesa vicino ai dati).
- **ADR-5**: **Domain events + outbox** come spina dorsale di automazioni e AI.
- **ADR-6**: **Binari in Storage, metadati in DB** per il Design Studio.
- **ADR-7**: **Edge Functions per transazioni**; PostgREST per CRUD semplice.

---
Vedi anche: `domain-boundaries.md`, `data-flow.md`, `migration-strategy.md`.
