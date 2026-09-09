# Decision Log — INGLY Enterprise

Registro append-only delle decisioni architetturali. Ogni scelta importante qui.

| Data | Decisione | Motivo | Esito atteso |
|---|---|---|---|
| 2026-07 | Adottato ecosistema `.claude/` (skills, rules, agents, commands, scripts) | Standardizzare e velocizzare lo sviluppo AI-assistito prima di scalare l'app | Sviluppo più rapido, coerente, verificabile |
| 2026-07 | `verify-syntax.mjs` come gate obbligatorio pre-commit | Il monolite non ha build: un errore JS rompe tutto silenziosamente | Zero commit rotti |
| 2026-07 | Versioning copia-in-avanti (vN→vN+1), stabile precedente intoccata | Rollback sempre possibile su un file da 100k righe | Sicurezza dei rilasci |
| 2026-07 | Feature che cambiano calcoli = toggle opt-in default-OFF (es. Express +25%) | Non alterare la logica business esistente senza approvazione | Nessuna regressione economica |
| 2026-07 | UI: layer CSS condiviso `#v49-ui-polish` invece di stili inline per sezione | Una modifica migliora tutte le sezioni; minor superficie di rischio | Grafica coerente app-wide |
| 2026-07 | Data layer resta IndexedDB (`IDB`); Dexie.js valutato ma rimandato | Migrazione tocca logica: da fare a step con approvazione | Stabilità dati |
| 2026-07 | Backend headless (Medusa/Payload) = solo scenario ecommerce reale | Grande pivot; oggi offline-first single-file è adeguato | Decisione differita, documentata |

## Come aggiungere una riga
Data · Decisione · Motivo · Esito atteso. Alla review (trimestrale) aggiorna
l'esito reale.
| 2026-07 | Gating moduli via codice licenza offline (non backend) | Scelta utente: funziona su qualsiasi PC senza infrastruttura | Copie clienti limitate al piano, master piena |
| 2026-07 | Default senza licenza = accesso completo (non Starter) | Non bloccare il proprietario fuori dal proprio tool (regola opt-in) | Nessuna regressione d'uso |

## Enterprise Upgrade (v60–v67) — decisioni chiave
- **Additività assoluta**: ogni fase è un modulo iniettato prima di `</html>`, mai
  edit invasivi al monolite. Nessuna funzione/DB/logica esistente rimossa.
- **SSOT macchine** (`equipment`): Catalogo (Fase 1), sync→quoter (Fase 2),
  Scheda (Fase 3), ROI/accantonamento (Fase 6) leggono/scrivono lo stesso store.
- **Design System** (Fase 4): componenti `.ds-*` + `window.DS` (Button/Input/
  Select/Modal/Toast/Badge/Table/virtualList) — accento ambra `--primary`.
- **Fase 8 — undo**: scartato l'undo per-scrittura (wrapping globale di IDB.put
  inaffidabile: il boot satura la history + race sullo snapshot before). Scelto
  **checkpoint/ripristino dataset** (IDB.exportAll → store `backups`), affidabile
  e sicuro. Trail audit armato solo +6s dopo il boot per non registrare rumore.
- **Regola anti-freeze confermata**: nessun modulo tocca `App.navigate`
  (resta `writable:false, configurable:false`). Nav test v67: 133–185ms/sezione.

## 2026-08-22 — CRM V2 a schede (ERP acceleration)
- **CRM come modulo unico a schede** (Clienti · Aziende · Attività) sulla route
  `clients`, non nuove voci di nav: evita duplicazione del CRM.
- **Attività = log immutabile**: confermata la scelta di Phase 14 (RLS solo
  SELECT+INSERT su `crm_activity`). Le "attività-task" (scadenza, assegnatario,
  priorità, completamento) NON sono state forzate sullo store immutabile: farebbe
  regredire la garanzia di immutabilità testata. Se serviranno task, andranno in
  una migration additiva dedicata (nuovo store o colonne nullable + policy update
  motivata), decisione separata da concordare — non un side-effect del "vai veloce".
- **Contatti**: CRUD completo con le colonne esistenti (name/role/email/phone/
  deleted_at). `notes`/`company_id` sul contatto NON esistono a schema: non
  inventati; eventuale aggiunta = migration additiva quando richiesto.
- **RLS insert** ("new row violates row-level security"): risolto lato Supabase
  in 0005/0006 (current_tenant_ids con fallback membership + has_permission).
  Il frontend forza `tenant_id = ctx.activeTenant` risolto da context.js. Nessun
  bypass RLS lato client.

## 2026-08-22 — Modulo Preventivi (sales_quote) — base flusso vendite
- **Nuove tabelle** `sales_quote` + `sales_quote_line` (migration 0008 additiva):
  nessuna tabella preventivi preesistente (audit su quote/quotation/estimate/
  sales/order/invoice → 0 risultati). Non è un secondo CRM.
- **RBAC riusato**: resource unico `sales.quote` (read/create/update/delete) con
  la stessa matrice del CRM; policy = tenant + has_permission; soft-delete via il
  trigger condiviso `crm_enforce_delete_perm`. Nessun secondo sistema autorizzativo.
- **Numerazione** per-tenant race-safe: `sales_quote_counter` + funzione
  SECURITY DEFINER `next_quote_number` (UPSERT atomico), assegnata da trigger
  BEFORE INSERT (mai dal frontend). Formato `PREV-000001`.
- **Totali deterministici lato DB**: `line_total` colonna generata; trigger
  `sales_quote_recalc` aggiorna subtotal/discount/tax/total dalle righe. Il client
  calcola solo per display (computeTotals), il DB è la fonte di verità.
- **Snapshot storico**: `sales_quote_line.description`/`unit_price` copiati dal
  prodotto; `product_id` FK ON DELETE SET NULL → un preventivo emesso non cambia
  se il prodotto cambia/viene rimosso. Base pronta per Order→Invoice→Payment.
- **Dashboard**: aggiunti solo KPI realmente calcolabili (totali/bozze/inviati/
  accettati + valore accettati). Ricavi/margine reali restano per Ordini/Fatture.

## 2026-08-22 — Modulo Ordini (sales_order) — Quote→Order
- **Nuove tabelle** `sales_order` + `sales_order_line` (migration 0009 additiva).
  Riuso completo del pattern 0008: RLS `sales.order` (matrice CRM, resource unico),
  numerazione per-tenant race-safe `next_order_number` (`ORD-000001`), totali DB
  (line_total generato + `sales_order_recalc`), soft-delete via trigger condiviso.
- **Quote→Order**: `convertQuoteToOrder` crea l'ordine da un preventivo, copia le
  righe come snapshot e collega `quote_id` (FK ON DELETE SET NULL). Il preventivo
  originale non viene modificato. UI: bottone "Converti in ordine" solo su stato
  ACCEPTED. Nessuna logica duplicata (stesso approccio di duplicateQuote).
- **UI Ordini** montata sulla route esistente `gestione_ordini` (kanban per stato
  + lista), niente route duplicate. Stati CONFIRMED/IN_PRODUCTION/READY/DELIVERED/
  CANCELLED (allineati al kanban v96).
- **Dashboard**: sbloccato il **ricavo reale** (somma ordini non annullati) +
  ordini totali/aperti — ora semanticamente corretto perché esistono gli Ordini.

## Materiali / Vernici / Componenti = master-data unica (no duplicazione)
- Un materiale, una vernice, un componente sono lo STESSO `catalog_product`
  con `kind='material'` (migr. 0030) distinti da `material_type`. Le "sotto-
  anagrafiche" Vernici/Componenti sono VISTE TIPIZZATE (filtro `materialTypeGroup`),
  NON tabelle separate → una sola source of truth che alimenta Magazzino/Acquisti/
  Quoter/Produzione. Motivazione: rispetto del principio "non duplicare".
- Version bump app-v2 → 0.2.0: milestone ERP (Smart Quoter Studio + Configura
  Lavorazione a parità V96, Attrezzature €/min, Materiali master-data). Schema
  fino a migr. 0030, suite 422+ verde.
