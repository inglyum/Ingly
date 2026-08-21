# INGLY OS — Skill Inventory (Fase 1 · sola analisi)

> Nessun codice/DB/migrazione toccati. Inventario delle skill **realmente
> presenti** nel repo (`.claude/skills/`), più agenti e comandi. Data: 2026-08-21.

## 0. Come sono "installate" le skill qui
Le skill di Claude Code sono **pacchetti di istruzioni in Markdown** (`SKILL.md`),
non librerie runtime. "Installare una skill" = aggiungere una cartella in
`.claude/skills/`. Sono tutte **locali al repo** (nessun download da registry).
⚠️ Il dominio `app.mcpmarket.com` è **bloccato dall'egress proxy** di questo
ambiente: non è possibile scaricare/installare skill esterne da qui.

## 1. Skill installate (26)

Fonte di TUTTE: cartelle locali in `.claude/skills/` (versionate nel repo).
Provenienza logica indicata nella colonna "Progetto".

| # | Skill | Progetto target | Scopo (sintesi) | Rilevanza INGLY OS (ERP) |
|--|--|--|--|--|
| 1 | admin-panel-architect | Sito INGLY DESIGN (admin.html) | Admin panel: CRUD, login, ruoli, log, backup | Bassa (altro progetto) |
| 2 | ai-artwork-director | Sito | Direzione creativa immagini AI (Midjourney/GPT/FLUX) | Bassa |
| 3 | ai-automation-engine | Sito | Workflow multi-step generazione contenuti/SEO | Bassa |
| 4 | ai-image-generation | Generico (inference.sh CLI) | Generazione immagini via **CLI esterna** | Bassa + **rischio egress** |
| 5 | analytics-engine | Sito | Metriche traffico/vendite sito (CTR, bounce) | Bassa |
| 6 | brand-guardian | Sito/brand | QA identità di brand | Media (brand condiviso) |
| 7 | campaign-manager | Sito | Campagne marketing/landing | Bassa |
| 8 | category-manager | Sito | Categorie/sottocategorie catalogo sito | Bassa |
| 9 | component-library-manager | Sito | Libreria componenti UI sito | Bassa (overlap UI) |
| 10 | data-architect | Sito | Schema **JSON** sito, import/export | Bassa (non è DB backend) |
| 11 | design-system-manager | Sito | Design system UI sito | Bassa (overlap UI) |
| 12 | ecommerce-architect | Sito | Logica ecommerce sito (carrello/checkout) | Bassa |
| 13 | **enterprise-patterns** | **INGLY OS** | Programma V2 ERP/MES/Design/AI a fasi | **Critica** (guida il percorso) |
| 14 | ingly-core-architect | Sito | Architettura repo sito-ingly | Bassa |
| 15 | **kb-audit** | **INGLY OS** | Allinea valori business (prezzi/KPI) alla KB | **Alta** |
| 16 | localization-manager | Sito | i18n IT/EN sito, valute, SEO | Media (concetti riusabili) |
| 17 | performance-optimizer | Sito | Performance tecniche sito | Media (principi riusabili) |
| 18 | personalization-expert | Brand/dominio | Materiali/tecniche laser reali | Media (dominio utile) |
| 19 | product-manager | Sito | Catalogo prodotti sito | Bassa |
| 20 | prompt-generator | Sito | Prompt AI immagini brand | Bassa |
| 21 | security-manager | Sito (admin) | Sicurezza admin sito (token GitHub) | Bassa (non RBAC ERP) |
| 22 | **single-file-editing** | **INGLY OS** | Modifica sicura del monolite | **Critica** |
| 23 | theme-management-engine | Sito | Temi stagionali sito | Bassa |
| 24 | **ui-design** | **INGLY OS** | Elevare UI/UX del gestionale, no-break | **Alta** |
| 25 | ux-reviewer | Sito | Usabilità/accessibilità sito | Media (principi riusabili) |
| 26 | **verify-html-build** | **INGLY OS** | Verifica integrità monolite pre-commit | **Alta** |

### Agenti (`.claude/agents/`)
- `code-reviewer` — review diff monolite (bug/sicurezza/logica). **Utile ERP.**
- `kb-auditor` — audit sezione vs Knowledge Base. **Utile ERP.**
- `ui-polisher` — grafica sezione-per-sezione. **Utile ERP.**

### Comandi/slash (`.claude/commands/`)
`new-version`, `verify`, `audit-kb`, `design`, ecc. — utility di progetto, ok.

### Regole (`.claude/rules/`)
`ai-coding-standards`, `ecommerce-rules`, `performance-accessibility`,
`security-rules`, `ui-ux-rules` — standard di progetto attivi.

## 2. Skill realmente pertinenti a INGLY OS (ERP)

Solo **6** su 26 riguardano il gestionale:
`enterprise-patterns`, `kb-audit`, `single-file-editing`, `ui-design`,
`verify-html-build` (+ `personalization-expert` per il dominio).
Le altre 20 servono il **sito INGLY DESIGN** (progetto gemello, stesso brand):
restano utili al brand ma **non** al percorso ERP V2.

## 3. Duplicati / sovrapposizioni

| Gruppo | Skill sovrapposte | Nota |
|--|--|--|
| UI/Design | `ui-design` ↔ `design-system-manager` ↔ `component-library-manager` ↔ `brand-guardian` | Per l'ERP tenere **solo `ui-design`**; le altre sono per il sito |
| Dati | `data-architect` (JSON sito) ↔ (mancante) DB backend | Nomi simili, **domini diversi**: non è un duplicato reale |
| Sicurezza | `security-manager` (admin sito) ↔ (mancante) RBAC/audit ERP | Non copre il backend ERP |
| AI immagini | `ai-artwork-director` ↔ `prompt-generator` ↔ `ai-image-generation` | 3 skill sullo stesso scopo (immagini) → per l'ERP **nessuna necessaria** |
| Automazione | `ai-automation-engine` (contenuti sito) ↔ (mancante) workflow/rules engine ERP | Non è il motore automazioni ERP |

**Principio da applicare (policy):** UNA skill primaria per capacità. Per l'ERP
non attivare la ridondanza del sito.

## 4. Capacità MANCANTI per INGLY OS V2 (nessuna skill le copre)

Direzione approvata: **backend Supabase/PostgreSQL, multi-utente**. Oggi **zero**
skill coprono:

- **DB backend**: PostgreSQL architecture, Supabase, database migrations,
  migration safety.
- **API**: REST/PostgREST, API security, authentication, **RBAC/authorization**
  (Supabase RLS).
- **MES**: BOM, routing, production planning/scheduling, work orders, machine
  capacity/utilization, quality/non-conformance, maintenance, traceability.
- **Automazione**: workflow/rules engine, event-driven, background jobs/queues,
  webhooks, scheduled jobs, notifications.
- **Design→Produzione**: SVG/DXF/CAD, vector geometry, parametric, nesting,
  kerf compensation, manufacturing preflight.
- **AI**: agents, structured outputs, BI, forecasting, recommendation, AI testing.
- **Testing**: unit/integration formalizzati, E2E/Playwright (⚠️ **parzialmente
  già presente** in `tests/harness.mjs` — 14 test), regression, visual regression,
  security testing.
- **DevOps**: CI/CD, Docker, monitoring, logging/observability, backup/DR.

## 5. Preoccupazioni di sicurezza / qualità

1. **`ai-image-generation`** dipende da una **CLI esterna (`inference.sh`)** e da
   host esterni → contrasta con il principio CSP-safe/offline del progetto e con
   l'egress bloccato. **Non usare nel contesto ERP.**
2. **`security-manager`** cita **token GitHub** e sicurezza dell'admin sito: da
   non confondere con la sicurezza ERP (RBAC/audit server-side, ancora mancante).
3. **Provenienza `enterprise-patterns`**: fornita dall'utente (MCP Market
   inglydesign). Salvata come testo leggibile e verificato — **nessun installer
   eseguito**. Contiene solo istruzioni (nessun codice eseguibile).
4. **Nessuna skill esterna installabile da qui** (egress `app.mcpmarket.com`
   bloccato): le nuove skill andranno aggiunte come file, previa revisione.

## 6. Riepilogo numerico
- Skill totali: **26** · pertinenti ERP: **6** · per il sito gemello: **20**
- Agenti: 3 (tutti utili ERP) · Comandi: presenti · Regole: 5 attive
- Capacità V2 coperte: **~1/9 categorie** (solo testing, parziale)
