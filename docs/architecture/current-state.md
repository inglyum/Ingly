# INGLY OS — Current State Architecture (Fase 0 · Audit)

> Audit in **sola lettura** dello stato attuale. Nessun codice applicativo è
> stato modificato durante questa fase (Regola: "DO NOT MODIFY CODE").
> Riferimento: `INGLY-OS-v96-STANDALONE.html`. Data: 2026-08-21.

## 1. Sintesi esecutiva

INGLY OS oggi è un'**applicazione single-file** (`INGLY-OS-vN-STANDALONE.html`)
di **~107.900 righe / ~9,0 MB**, scritta in **vanilla JavaScript** con **164
blocchi `<script>`**, senza build system e senza backend applicativo. Tutta la
logica gira **client-side** nel browser; la persistenza è **locale**
(IndexedDB + localStorage), con un layer SaaS **opzionale** su Supabase per il
solo login/gestione utenti.

È un prodotto **ricco e funzionante** (102 sezioni di navigazione), ma
architetturalmente è un **monolite a patch incrementali**: nuove feature vengono
aggiunte come blocchi `<script>` appesi in coda che agiscono sul DOM già
renderizzato. Questo massimizza la reversibilità ma genera **debito tecnico**
(override multipli, race di inizializzazione, duplicazioni).

**Verdetto:** ottima base funzionale e di dominio; per diventare una piattaforma
"enterprise/MES" servono un **modello dati normalizzato**, **servizi di dominio
condivisi** e (per il multi-utente reale) un **backend**. Il percorso deve essere
**non distruttivo e a fasi** (vedi roadmap).

## 2. Stack tecnologico

| Livello | Tecnologia attuale |
|---|---|
| Frontend | HTML + CSS inline/`<style>` + Vanilla JS (nessun framework) |
| UI/Icone | FontAwesome → SVG swap (`InglyIcons`); CSS variables per temi |
| State | Oggetti globali per-modulo + `AppStore` (cache) — **370 riferimenti** |
| Persistenza locale | **IndexedDB** (DB principale `InglyDB` v3 + altri DB dinamici) |
| Persistenza chiave-valore | `localStorage` (config, sessione, toggle, brand, ecc.) |
| Auth/SaaS (opzionale) | `SaaSGate` (localStorage `ingly_saas_db` + Supabase `ingly_users`) |
| AI (opzionale) | Chiamate a `api.anthropic.com` (feature AI) |
| Build | **Nessuno** (file distribuibile così com'è) |
| Test | Node + Playwright headless (`tests/`), `verify-syntax.mjs` |
| Deploy | Distribuzione del file `.html` (offline-first, CSP-safe) |

## 3. Persistenza dati (stato attuale)

- **IndexedDB**: molteplici aperture (`InglyDB` v3 e database creati da moduli
  con nomi variabili). Gli store non sono definiti in un unico schema centrale ma
  **sparsi nei moduli** (`createObjectStore` dinamico) → **niente schema unico né
  migrazioni versionate coerenti**.
- **AppStore**: layer di cache in memoria/localStorage con invalidazione manuale
  (370 usi). È il punto più vicino a un "repository" ma non è un ORM.
- **localStorage**: sessione SaaS, config Supabase/Stripe, preferenze UI, brand
  white-label, toggle vari. Contiene **dati di business e configurazione**.
- **Nessun backend transazionale**: i dati vivono nel browser del singolo utente.
  Il multi-dispositivo/multi-utente reale **non esiste ancora** (solo utenti SaaS
  per il gate).

**Rischi persistenza:** nessuna sorgente di verità condivisa; niente vincoli di
integrità referenziale; backup manuale via export JSON/ZIP; possibile divergenza
tra AppStore e IndexedDB se l'invalidazione non è chirurgica.

## 4. Moduli / domini presenti (102 sezioni)

Raggruppati (NavGroups). Copertura di dominio molto ampia:

- **Controllo/Analytics**: Dashboard ROI, KPI Live, AI Decisioni, Opportunity
  Scanner, Quote Intelligence, Analytics, Health Score, briefing giornaliero.
- **Vendite/Preventivi**: Smart Quoter (laser + stampa 3D), Workflow preventivi,
  Vendite & Fatture (incl. XML SDI), Cashflow.
- **CRM & Marketing**: CRM Clienti, Pipeline, Lead scorer, Marketing Pro, Social
  Studio/Planner, Trend & Product Hunter, Idee & Ispirazione.
- **Produzione/Stock**: Ordini/Order Tracker, Magazzino, Materiali & Macchine,
  Coda produzione, Kit Manager, Lab & Lista Acquisti AI.
- **Progetti/Design**: Progetti, Image Library, Catalogo, Design Studio (parziale).
- **Finanza/Fiscale**: Finance Pro, Costi Fissi, Break-even, IVA/config fiscale.
- **Business/Sistema**: Brand Identity, Team & HR, Legale, Backup/ZIP, Storico,
  Impostazioni, Admin (tool separato), Cloud Updater.
- **Risorse**: Risorse Laser, Risorse Stampa 3D (link curati a fornitori/tool).

**Osservazione:** molte capability "enterprise" esistono già in forma
**client-side e per-modulo**, ma **non comunicano tra loro** tramite eventi/servizi
di dominio (es. "ordine confermato" non innesca automaticamente prenotazione
materiale + work order + scheduling). È il gap principale verso ERP/MES.

## 5. Entità di dominio (implicite oggi)

Presenti in forma sparsa: Cliente, Preventivo, Ordine, Prodotto/Catalogo,
Materiale, Macchina, Progetto, Vendita/Fattura, Movimento cassa, Fornitore,
Kit/BOM informale, Suggerimento AI. **Mancano** come entità di prima classe con
relazioni esplicite: Work Order/Operazione, Routing, Lotto materiale, Movimento
inventario, Manutenzione macchina, Controllo qualità/Non conformità, Spedizione,
Ruolo/Permesso, Automazione/Trigger/Azione, Audit log.

## 6. Integrazioni esterne

- **Supabase** (auth/utenti SaaS) — opzionale, configurato dall'utente.
- **api.anthropic.com** — feature AI (24 riferimenti).
- **Stripe** (Payment Links) — codice presente, richiede attivazione manuale.
- **WhatsApp** (`wa.me`) — link diretti.
- **Link risorse** (Etsy, Amazon, xTool, fornitori vari) — **riferimenti/URL**
  informativi, non integrazioni API attive.

**Nota (Regola 13):** non esistono integrazioni "vere" oltre a Supabase/Anthropic/
Stripe; il resto sono link. Da non presentare come integrazioni attive.

## 7. Testing & qualità

- Suite `tests/` (Playwright headless via `harness.mjs`): auth gate, catalog,
  critical flows, bundle — **14 test, attualmente verdi**.
- `verify-syntax.mjs`: valida i 164 blocchi `<script>` prima di ogni commit.
- **Gap**: nessun test su E2E dei flussi ERP inter-modulo, nessuna regressione
  visiva, nessun test di sicurezza automatizzato, nessun test di migrazione dati.

## 8. Debito tecnico (principali)

1. **Monolite a patch**: feature aggiunte come `<script>` in coda che
   ri-renderizzano il DOM; più moduli fanno override di `App.navigate`
   (protetto intenzionalmente per evitare freeze — vedi commento nel codice).
2. **Race di init**: pannelli costruiti su `setTimeout`/interval (es. Accesso
   Rapido) → possibili stati incoerenti; già emerso un bug reale (una regola
   `#core-nav{display:none!important}` "hide legacy" nascondeva il pannello,
   ora corretto in v96).
3. **Schema dati non centralizzato**: store IndexedDB definiti nei moduli, nessun
   versioning/migrazione unificati.
4. **Business data hardcoded** in template (prezzi, KPI, testi) → i18n e
   manutenzione difficili (l'inglese è retrofit a runtime, non a chiavi).
5. **Duplicazioni**: più iniettori simili (es. core-nav v27 legacy vs corrente).
6. **File da 9 MB**: tempo di parsing e footprint elevati; contain:layout mitiga
   il rendering ma non il costo di boot.

## 9. Sicurezza (stato attuale)

- **Client-side puro**: dati nel browser dell'utente; nessun segreto server.
- Regole di progetto già presenti (no `eval` su input dinamico, sanitizzazione
  prima di `innerHTML`, CSP-safe, tutto vendored).
- SaaS gate presente ma **l'autorizzazione è client-side** (gate + moduli per
  piano) → adeguato per un tool locale, **non** per multi-tenant reale.
- **Mancano** (necessari per enterprise): RBAC server-side, audit log,
  rate limiting, sessioni httpOnly, validazione server-side.

## 10. Performance

- Sezioni renderizzate on-demand (`.section-view.active`, `contain:layout`).
- Rischi: boot di 9 MB, interval/MutationObserver multipli sempre attivi,
  possibili full-scan IndexedDB dove mancano indici.

## 11. Capability enterprise mancanti (gap vs obiettivo)

- Modello dati normalizzato + migrazioni versionate.
- Servizi di dominio condivisi / architettura event-driven (motore automazioni).
- MES: work order, routing, scheduling macchine, capacità, QC/non conformità.
- Motore materiali (on-hand/reserved/available/incoming) e acquisti automatici.
- Motore macchine (utilizzo/ROI/manutenzione).
- Finance con COGS/margine per ordine e forecast affidabile.
- RBAC + audit + observability + backup/DR formalizzati.
- Design→Produzione (preflight SVG/DXF, kerf, nesting).
- Backend multi-utente/multi-dispositivo (se si vuole SaaS reale condiviso).

## 12. Rischi principali del percorso V2

- **Regressioni** su un monolite senza test inter-modulo → mitigare con test E2E
  prima di rifattorizzare (Regola 6).
- **Migrazione dati** dagli store attuali sparsi a uno schema unico → serve
  strategia di export/mapping/rollback (Regole 4–5).
- **Scope creep**: il programma è a 22 fasi (mesi di lavoro). Procedere a
  incrementi verificabili, non "tutto insieme" (Regola 9).
- **Doppio binario**: mantenere il monolite offline funzionante mentre si
  costruisce il modello modulare, finché il sostituto non è verificato (Regola 12).

## 13. Prossimi passi consigliati (dopo Fase 0)

1. **Fase 1–2 (Skill audit)**: valutare quali skill/tecnologie servono davvero
   → `docs/skills/skill-evaluation.md` (senza installare duplicati).
2. **Fase 4 (DB v2, solo design)**: `docs/architecture/database-v2.md` con lo
   schema normalizzato — **senza migrare** ancora nulla.
3. **Test E2E dei flussi critici** sul monolite attuale, come rete di sicurezza
   prima di qualsiasi refactor.
4. Decidere il **modello di deployment target** (resta offline-first single-file?
   oppure si introduce un backend per multi-utente reale?) — è il bivio che
   determina tutte le fasi successive.

---

### Nota di metodo
Questo documento è la **Fase 0**. Non modifica il codice dell'app. Le fasi
successive (DB v2, ERP core, MES, ecc.) vanno affrontate **una alla volta**, con
backup/commit e test verdi prima e dopo, come da REGOLE CRITICHE della skill
`enterprise-patterns`.
