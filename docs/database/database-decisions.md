# INGLY OS V2 — Database Final Decisions (post-review)

> Fase 3.5 · decisioni raccomandate a valle della review. Nessun SQL, nessuna
> migrazione. Da approvare prima dell'implementazione.

## 1. Decisioni consolidate (ADR-DB)

| ID | Decisione |
|--|--|
| DB-1 | PK `uuid`; `tenant_id` esplicito su ogni tabella business (no ereditarietà via join) |
| DB-2 | Schemi misti: `public` (RLS) per CRUD; `events/automation/ai/integ/audit/analytics` interni |
| DB-3 | Stock = **movimenti append-only** (verità) + `inv_balance` derivata (cache riconciliata) |
| DB-4 | Prenotazioni stock **solo transazionali con lock**; mai calcolo/decisione client |
| DB-5 | RLS via **claim JWT** (tenant_ids + ruoli nel token), non funzioni costose per riga |
| DB-6 | Eventi con **outbox nella stessa TX** + **`aggregate_version`** per ordering |
| DB-7 | `prod_work_order.design_version_id` **immutabile** dopo IN_PROGRESS |
| DB-8 | Snapshot storici (prezzo/sconto/IVA/costo) come **colonne** sugli item, non solo JSONB |
| DB-9 | Storage con **policy per-tenant** (path `tenant_id/...`) + URL firmati |
| DB-10 | `machine_utilization` e aggregati pesanti → **materialized views** per-tenant |
| DB-11 | Sync offline: inventory/order/production/finance = **richieste** validate dal server (mai client-wins) |
| DB-12 | Finanza = **ERP operativo** (non contabilità certificata); aggiungere `currency`/periodo |

## 2. HIGH RISK — schede di risoluzione

### HR-1 · Race su prenotazioni concorrenti
- **Problema**: due prenotazioni simultanee superano lo stock disponibile.
- **Impatto**: overselling, produzione senza materiale, promesse non mantenute.
- **Soluzione**: funzione/Edge `reserve_material()` in TX con `SELECT … FOR UPDATE`
  sul saldo del materiale (o advisory lock per `material_id`), ricalcolo `available`
  e insert reservation solo se sufficiente.
- **Tabelle**: `inv_material`, `inv_movement`, `inv_reservation`, `inv_balance`.
- **Conseguenza migrazione**: nessuna (nuova logica).
- **Test**: test di concorrenza (N prenotazioni parallele → mai oltre disponibilità).

### HR-2 · Coerenza cache `inv_balance`
- **Problema**: deriva tra cache e movimenti se un percorso bypassa il trigger.
- **Impatto**: stock errato → decisioni sbagliate.
- **Soluzione**: unico trigger su `inv_movement`; job di **riconciliazione**
  periodico (ricalcolo da movimenti, confronto, alert su delta). In alternativa,
  vista indicizzata on-the-fly finché il volume lo consente.
- **Tabelle**: `inv_movement`, `inv_balance`.
- **Migrazione**: saldo iniziale come movimento `adjust`.
- **Test**: riconciliazione = 0 delta su dataset di prova; test bypass.

### HR-3 · Costo/ricorsione RLS
- **Problema**: `has_permission()` per riga costosa/ricorsiva → lentezza/timeouts.
- **Impatto**: performance e possibili errori "infinite recursion".
- **Soluzione**: ruoli/tenant nel **JWT claim**; policy leggono il claim; helper
  `SECURITY DEFINER` con `search_path=''`; `tenant_membership` con policy non ricorsiva.
- **Tabelle**: tutte le `public` (policy) + funzioni helper.
- **Migrazione**: nessuna.
- **Test**: benchmark su liste 10k righe; test anti-ricorsione; anti-leakage.

### HR-4 · Immutabilità work_order ↔ design_version
- **Problema**: se il work order segue il "current version", i record storici si
  corrompono quando il design evolve.
- **Impatto**: tracciabilità di produzione falsata.
- **Soluzione**: FK alla **version** (non al design); trigger che vieta il cambio di
  `design_version_id` dopo `status>=IN_PROGRESS`; `design_version` immutabile.
- **Tabelle**: `prod_work_order`, `dsn_design_version`.
- **Migrazione**: nessuna.
- **Test**: tentativo di modifica post-avvio → rifiutato.

### HR-5 · Ordering eventi
- **Problema**: nessun ordine garantito tra eventi dello stesso aggregato.
- **Impatto**: automazioni/AI reagiscono in ordine errato.
- **Soluzione**: `aggregate_version` incrementale per aggregato; dispatch ordinato
  per `(aggregate_type, aggregate_id)`.
- **Tabelle**: `events.domain_event`, `events.outbox`.
- **Migrazione**: nessuna.
- **Test**: sequenze fuori ordine → consumatori vedono ordine corretto.

### HR-6 · Sync offline non sicura (inventory/order/finance)
- **Problema**: client-wins su dati critici causa incoerenze/overselling.
- **Impatto**: dati finanziari/stock errati.
- **Soluzione**: per queste entità la mutazione offline è una **richiesta**; il
  server la applica in TX con ricontrollo; conflitti → stato `conflict` per revisione.
- **Tabelle**: inv_*, sales_order*, prod_*, fin_*; `sync.mutation_log`.
- **Migrazione**: nessuna.
- **Test**: scenari offline→online con conflitto; nessun overwrite su critici.

### HR-7 · `machine_utilization` in OLTP
- **Problema**: aggregati pesanti su tabella transazionale.
- **Impatto**: contesa/lentezza su percorsi ERP.
- **Soluzione**: convertire in **MV** (`mv_machine_utilization`) per-tenant,
  refresh schedulato.
- **Tabelle**: rimuove `mac_machine_utilization` OLTP → MV in `analytics`.
- **Migrazione**: nessuna.
- **Test**: query utilizzo non tocca tabelle calde.

### HR-8 · Tenant boundary sui file Storage
- **Problema**: gli oggetti Storage non ereditano la RLS.
- **Impatto**: possibile accesso cross-tenant ai file di design.
- **Soluzione**: path `tenant_id/...`; Storage policy basata su membership; URL
  firmati a scadenza; nessun bucket pubblico per asset cliente.
- **Tabelle/Storage**: bucket design/asset + `dsn_design_export`, `prj_project_asset`.
- **Migrazione**: definire convenzione path prima di caricare file.
- **Test**: utente tenant B non scarica file tenant A (diretto e via URL).

### HR-9 · MV analytics non filtrate per tenant
- **Problema**: una MV globale leggibile espone dati aggregati cross-tenant.
- **Impatto**: leakage.
- **Soluzione**: MV con colonna `tenant_id` + RLS sulla MV (o funzioni che filtrano),
  oppure MV per-tenant.
- **Tabelle**: tutte le `mv_*`, `analytics.*`.
- **Migrazione**: nessuna.
- **Test**: query MV di un utente restituisce solo il suo tenant.

## 3. APPROVED WITH CHANGES (minori, da recepire nel DDL)
- Colonne snapshot su `sales_order_item`/`fin_invoice_item`
  (`unit_price,discount,vat_rate,cost,line_total`).
- `prod_work_order_material.work_order_operation_id` opzionale (costo per operazione).
- `currency` (+ `fx_rate` se multi-valuta) su documenti/pagamenti; definizione periodo.
- Indici: aggiungere quelli mancanti (§13 review), rimuovere `tenant_id` singolo se
  coperto da composito.
- Merge `qc_rework`/`qc_scrap` in `qc_non_conformance.type` (rinviare la separazione).
- `automation.condition` → `JSONB` in `automation` (semplificazione).

## 4. Definizione di "pronto per implementazione"
Il DB è pronto quando:
1. Recepiti DB-1…DB-12 e chiusi HR-1…HR-9 nel documento di schema.
2. Definiti: claim JWT, funzioni lock prenotazione, trigger immutabilità, outbox
   con aggregate_version, Storage policy, MV per-tenant.
3. Predisposta la **suite di test** (RLS anti-leakage, concorrenza stock, immutabilità,
   ordering eventi, sync conflitti, Storage boundary) — da eseguire in **staging**.
4. Tutto in **staging**, mai in produzione; v96 resta la produzione.

---

# DATABASE REVIEW STATUS: REQUIRES CHANGES
Recepite queste decisioni, lo stato passerà a READY FOR IMPLEMENTATION (in staging).
Nessun SQL, nessuna migrazione, nessuna modifica a v96 in questa fase.

---

## 5. Stato post Fase 3.6
Tutte le decisioni DB-1…DB-12 e le risoluzioni HR-1…HR-9 sono **recepite** negli
addendum dei documenti di design (database-v2 §9, rls §9, indexing §7, offline-sync §10,
schema-map §5, v96-mapping §7, ERD §5). Vedi `consistency-review.md` per la prova di
coerenza e `DATABASE-REVIEW.md` (FINAL VALIDATION) per lo stato per singolo HR.
**Stato: READY FOR IMPLEMENTATION (in staging)**, subordinato alla suite di test.

---

## 6. Stato post Fase 4 (foundation SQL corretto)
Recepite tutte le correzioni della review V1 nello scaffolding SQL (non eseguito):
RLS su tutte le tabelle public (B-1), `auth.jwt()` (W-1), `role_perm_cache` in
0002 (W-2/W-3 doc ref), integration_credential protetta (W-3), CHECK
aggregate_version>0 (W-4/W-6), audit immutabile (W-5), FK verso auth.users (W-6/W-8),
indici foundation (W-7/W-9), down migration (W-8/W-10), schema `security` spostato
in 0002 (W-11). Dettaglio in `STAGING-FOUNDATION-SQL-REVIEW-V2.md`.
