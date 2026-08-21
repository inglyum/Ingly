# INGLY OS V2 — Skill Recommendations (Fase 1 · sola analisi)

> Direzione approvata: evoluzione a **backend Supabase/PostgreSQL, multi-utente,
> multi-dispositivo**, in modo **incrementale e reversibile**, preservando v96.
> Policy: **UNA skill primaria per capacità**; niente duplicati; specialista
> secondario solo con motivo tecnico chiaro.
> ⚠️ Le skill si creano come `SKILL.md` locali (istruzioni). L'egress verso
> `app.mcpmarket.com` è **bloccato**: le skill esterne non sono installabili da
> qui; vanno aggiunte come file previa revisione, oppure sostituite da skill
> interne scritte su misura.
> **NIENTE è stato installato in questa fase.** Solo raccomandazioni.

## Legenda punteggio
`0` inutile · `1` bassa · `2` moderata · `3` utile · `4` molto utile · `5` critica

---

## CURRENT SKILLS (già presenti — verdetto per l'ERP)

| Skill | Score ERP | Verdetto |
|--|--|--|
| enterprise-patterns | 5 | **Tieni** — guida il programma V2 |
| single-file-editing | 5 | **Tieni** — sicurezza modifiche monolite |
| verify-html-build | 4 | **Tieni** — gate pre-commit |
| ui-design | 4 | **Tieni** — UI premium no-break |
| kb-audit | 4 | **Tieni** — coerenza valori business |
| personalization-expert | 3 | **Tieni** — dominio laser/materiali |
| performance-optimizer | 2 | Riusa principi (nato per il sito) |
| localization-manager | 2 | Riusa principi i18n (nato per il sito) |
| ux-reviewer | 2 | Riusa principi UX (nato per il sito) |
| brand-guardian | 2 | Utile a livello brand |
| Altre 16 (admin/ecommerce/category/product/theme/artwork/…) | 0–1 | **Progetto SITO**: lasciare, non usare per l'ERP |

**Nessuna rimozione raccomandata** (le skill del sito appartengono al progetto
gemello). Semplicemente **non attivarle** nel contesto INGLY OS.

---

## DUPLICATES (da NON replicare per l'ERP)
- UI: `ui-design` è la primaria. `design-system-manager`,
  `component-library-manager`, `brand-guardian` = sito → non duplicare per l'ERP.
- Immagini AI: `ai-artwork-director`, `prompt-generator`, `ai-image-generation`
  = stessa capacità → per l'ERP **nessuna** necessaria.

---

## MISSING CAPABILITIES (nessuna skill le copre oggi)
DB backend · Migrazioni sicure · REST/PostgREST + RLS · RBAC · MES (BOM/routing/
work order/scheduling/QC/manutenzione/tracciabilità) · Automazioni/rules engine ·
Design→Produzione (SVG/DXF/nesting/kerf/preflight) · AI agents/forecasting ·
Testing formale/E2E/security · CI/CD · Observability · Backup/DR.

---

## P0 — INSTALL NOW (fondamenta backend, allineate alla direzione)

> Obiettivo: abilitare il primo strato backend Supabase **senza** toccare v96.

| Skill (proposta, interna) | Score | Perché a INGLY serve | Metodo |
|--|--|--|--|
| **supabase-postgres-architect** | 5 | Direzione approvata: schema, RLS, ruoli, tipi, indici su Supabase/Postgres | `SKILL.md` interna su misura |
| **db-migration-safety** | 5 | Migrazioni versionate + rollback obbligatorio (Regole 4–5) | `SKILL.md` interna |
| **api-security-rls** | 5 | PostgREST/Edge Functions + Row Level Security + validazione | `SKILL.md` interna |
| **rbac-authorization** | 5 | Ruoli OWNER/ADMIN/…/VIEWER, matrice permessi, audit | `SKILL.md` interna |
| **e2e-playwright** | 4 | Rete di sicurezza sui flussi critici prima del refactor (estende `tests/harness.mjs`) | Estendi harness esistente |
| **backup-dr** | 4 | Backup DB/asset + restore verificato + retention | `SKILL.md` interna |

- name/source/purpose/compatibility/risk indicati per ciascuna sotto "Dettaglio P0".

### Dettaglio P0
- **supabase-postgres-architect** — *source*: interna (scritta su misura).
  *purpose*: progettare `database-v2` normalizzato su Postgres/Supabase.
  *why*: è la direzione approvata. *compat*: alta (Supabase già usato per auth).
  *risk*: basso in fase design (nessuna migrazione). *priority*: P0.
- **db-migration-safety** — interna. Migrazioni forward + rollback, dry-run,
  backup pre-migrazione. *risk*: mitiga il rischio più alto del progetto. P0.
- **api-security-rls** — interna. RLS per tenant/utente, validazione server-side,
  secrets in env. *why*: multi-utente sicuro. P0.
- **rbac-authorization** — interna. Matrice ruoli↔permessi, sensitive ops
  auditabili. P0.
- **e2e-playwright** — estende `tests/harness.mjs` (già Playwright). *why*:
  Regola 6 (ogni modulo con test) + rete di sicurezza. P0.
- **backup-dr** — interna. *why*: Fase 19. P0.

---

## P1 — INSTALL LATER (dominio ERP/MES, dopo lo strato backend)

| Skill (interna) | Score | Perché |
|--|--|--|
| erp-domain-services | 4 | Servizi di dominio condivisi + eventi (Fase 5) |
| mes-production-engine | 4 | Work order/routing/scheduling/QC (Fasi 6–8) |
| inventory-material-engine | 4 | on-hand/reserved/available/incoming + acquisti (Fase 7) |
| machine-engine | 3 | Utilizzo/ROI/manutenzione (Fase 8) |
| automation-rules-engine | 4 | EVENT→CONDITION→ACTION→LOG (Fase 10) |
| finance-cogs-forecast | 3 | COGS/margine per ordine + cashflow (Fase 15) |
| crm-automation | 3 | Pipeline + follow-up automatici (Fase 14) |
| observability | 3 | Logging strutturato + log automazioni/AI (Fase 18) |
| ci-cd | 3 | Pipeline test+deploy (Fase 19) |

---

## P2 — OPTIONAL (specialistiche, quando servono davvero)

| Skill | Score | Nota |
|--|--|--|
| svg-dxf-manufacturing | 3 | Design→Produzione, kerf, nesting (Fasi 12–13) — solo quando si affronta il Design Studio |
| ai-business-agents | 3 | AI CEO/CFO/COO/CMO (Fase 11) — dopo che i dati sono strutturati |
| forecasting | 2 | Previsioni domanda/cassa — serve storico dati reale |
| visual-regression | 2 | Utile ma dopo E2E funzionale |
| docker | 2 | Solo se si self-hosta oltre Supabase |

---

## REJECTED — DO NOT INSTALL

| Skill / categoria | Motivo |
|--|--|
| `ai-image-generation` (inference.sh) | Dipende da **CLI/host esterni** → viola CSP-safe/offline + egress bloccato. Non pertinente all'ERP |
| Duplicati UI per l'ERP (`design-system-manager`, `component-library-manager`) | Ridondanti con `ui-design` nel contesto ERP |
| Duplicati immagini AI (`ai-artwork-director`, `prompt-generator`) | Stessa capacità, non serve all'ERP |
| Qualsiasi skill scaricata via `curl \| bash` / installer opaco | Regola 15: verifica sorgente/sicurezza prima; installer ciechi vietati |
| Skill "certified accounting" | Non implementiamo contabilità certificata (Fase 15 lo vieta esplicitamente) |

---

## SECURITY CONCERNS (riassunto)
1. Evitare skill con dipendenze esterne runtime (egress bloccato, principio offline).
2. RBAC/audit ERP **non esistono ancora** → priorità P0 prima di esporre dati
   multi-utente.
3. Secrets Supabase/Stripe: mai nel repo/HTML, solo env/vault (Regola security).
4. Le skill P0/P1/P2 qui proposte sono **da scrivere internamente** come `SKILL.md`
   (niente download esterni), previa tua approvazione — coerente con la policy.

---

## Nota su "installazione"
Le skill P0–P2 proposte **non esistono ancora** come file: sono **raccomandazioni**.
Non ne ho creata nessuna (oltre a `enterprise-patterns`, già installata su tua
richiesta). Alla tua approvazione le scriverò **una alla volta**, come istruzioni
interne su misura per lo stack Supabase/Postgres di INGLY OS.

---

# PHASE 1 STATUS: READY FOR REVIEW
Nessun codice, DB, migrazione, frontend o architettura modificati. In attesa di
approvazione prima di procedere.
