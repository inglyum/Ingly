# INGLY OS V2 — Skill Source Verification (Fase 1.5 · sola verifica)

> Nessuna installazione, nessuna skill creata, nessun codice/DB toccato.
> Data: 2026-08-21.

## Premessa di onestà (fondamentale)

Le skill elencate come P0/P1/P2 in `skill-recommendations.md` erano **proposte
interne mie** (nel documento le avevo marcate "interna, scritta su misura").
**Non sono skill pubblicate** con quei nomi. Quindi, verificate una per una:

- **Nessuna** di quelle voci esiste come "SKILL.md pubblicata e installabile" con
  quel nome esatto.
- Alcune **capacità** sono però supportate da **tool/servizi/MCP reali** (es.
  Playwright, Docker, Supabase, GitHub Actions), che sono cosa diversa da una skill.
- I **registry esterni sono irraggiungibili** da questo ambiente
  (`app.mcpmarket.com` → egress bloccato). Perciò **non posso verificare
  versione/URL/licenza** di eventuali skill/MCP di terze parti: dove non ho prova
  diretta, scrivo `n/d (registry non raggiungibile)` e **non invento**.

### Verifiche dirette effettuate in questo ambiente
| Elemento | Esito |
|--|--|
| `playwright` (npm) | **PRESENTE** (risolto) e usato in `tests/harness.mjs` |
| `docker` | **PRESENTE** (`/usr/bin/docker`) |
| Supabase | **Reale**, già referenziato dall'app (auth) |
| GitHub Actions | Disponibile (repo su GitHub) |
| `app.mcpmarket.com` | **BLOCCATO** (egress) → registry non verificabile |

---

## Tabella di verifica

| Skill (proposta) | Status | Real Source | Type | Version | Risk | Install Method | Recommendation |
|--|--|--|--|--|--|--|--|
| supabase-postgres-architect | INTERNAL ONLY | Nessuna skill pubblicata con questo nome. Supabase/Postgres = servizi reali; esiste (in ecosistema) un *Supabase MCP server* **non verificabile da qui** | INTERNAL SKILL | n/d | Basso (design) | Scrivere `SKILL.md` interna | Creare interna in Fase 2 (previa approvazione) |
| db-migration-safety | INTERNAL ONLY | Concetto reale (Supabase CLI migrations = documentazione ufficiale) ma **nessuna skill** con questo nome | INTERNAL SKILL / DOCUMENTATION | n/d | Basso | `SKILL.md` interna | Creare interna |
| api-security-rls | INTERNAL ONLY | RLS = feature reale Postgres/Supabase (documentazione), non una skill | INTERNAL SKILL / DOCUMENTATION | n/d | Basso | `SKILL.md` interna | Creare interna |
| rbac-authorization | INTERNAL ONLY | Pattern reale, nessuna skill pubblicata con questo nome | INTERNAL SKILL | n/d | Basso | `SKILL.md` interna | Creare interna |
| e2e-playwright | PARTIAL | **Playwright = TOOL reale, già presente** in `tests/`. Esiste anche un *Playwright MCP server* (ecosistema, **non verificato da qui**). La "skill" con questo nome non esiste | TOOL (+ MCP SERVER) | Playwright: presente (versione da `package`/sistema) | Basso | Nessuna skill da installare: **estendere `tests/harness.mjs`**; MCP opzionale | Usare il tool esistente, non creare skill |
| backup-dr | INTERNAL ONLY | Supabase offre backup reali (documentazione). Nessuna skill con questo nome | INTERNAL SKILL / DOCUMENTATION | n/d | Basso | `SKILL.md` interna | Creare interna |
| erp-domain-services | INTERNAL ONLY | Dominio specifico INGLY, nessuna skill pubblicata | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fase 5) |
| mes-production-engine | INTERNAL ONLY | Dominio specifico, nessuna skill pubblicata | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fasi 6–8) |
| inventory-material-engine | INTERNAL ONLY | Dominio specifico, nessuna skill pubblicata | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fase 7) |
| machine-engine | INTERNAL ONLY | Dominio specifico, nessuna skill pubblicata | INTERNAL SKILL | n/d | Basso | `SKILL.md` interna | Creare interna (Fase 8) |
| automation-rules-engine | INTERNAL ONLY | Pattern reale (rules engine), nessuna skill pubblicata con questo nome | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fase 10) |
| finance-cogs-forecast | INTERNAL ONLY | Dominio specifico, nessuna skill pubblicata | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fase 15) |
| crm-automation | INTERNAL ONLY | Dominio specifico, nessuna skill pubblicata | INTERNAL SKILL | n/d | Basso | `SKILL.md` interna | Creare interna (Fase 14) |
| observability | INTERNAL ONLY | Tool reali esistono (Sentry/Grafana/OTel) ma sono servizi, **non** questa skill; **non verificabili da qui** | INTERNAL SKILL / TOOL | n/d | Basso | `SKILL.md` interna + eventuale tool | Creare interna (Fase 18) |
| ci-cd | PARTIAL | **GitHub Actions = servizio reale** (repo su GitHub). La "skill" con questo nome non esiste | TOOL / DOCUMENTATION | n/d | Basso | Workflow `.github/workflows/*.yml` (non una skill) | Usare GitHub Actions, non creare skill |
| svg-dxf-manufacturing | INTERNAL ONLY | Librerie SVG/DXF reali esistono; nessuna skill pubblicata con questo nome | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fasi 12–13) |
| ai-business-agents | INTERNAL ONLY | Anthropic API = reale (già usata dall'app). Nessuna skill pubblicata con questo nome | INTERNAL SKILL | n/d | Medio | `SKILL.md` interna | Creare interna (Fase 11) |
| forecasting | INTERNAL ONLY | Capacità generica, nessuna skill pubblicata con questo nome | INTERNAL SKILL | n/d | Basso | `SKILL.md` interna | Creare interna (serve storico dati) |
| visual-regression | PARTIAL | **Playwright** ha snapshot visivi reali (tool presente). La "skill" non esiste | TOOL | Playwright: presente | Basso | Funzione del tool Playwright | Usare il tool, non creare skill |
| docker | REAL (tool) | **Docker = TOOL reale, presente** (`/usr/bin/docker`). **Non è una skill** | TOOL | presente (da `docker --version`) | Basso | Già installato nel sistema | Non è una skill: usare solo se si self-hosta |

---

## Classificazione richiesta

### REAL EXISTING SKILL (SKILL.md pubblicata, installabile con quel nome)
**NESSUNA.** Nessuna delle voci raccomandate esiste come skill pubblicata.

### REAL MCP SERVER
- Nell'ecosistema esistono MCP server per **Supabase**, **Postgres** e
  **Playwright**, ma **NON sono verificabili da questo ambiente** (registry/egress
  bloccato) → trattare come **da verificare altrove**, non confermati qui. Nessuno
  è "una delle skill raccomandate".

### REAL TOOL (presenti/reali, non skill)
- **Playwright** (presente, in uso) → copre `e2e-playwright` e `visual-regression`.
- **Docker** (presente) → copre `docker`.
- **GitHub Actions** (repo su GitHub) → copre `ci-cd`.

### INTERNAL SKILLS REQUIRED (capacità reali senza skill esistente → da creare)
`supabase-postgres-architect`, `db-migration-safety`, `api-security-rls`,
`rbac-authorization`, `backup-dr`, `erp-domain-services`, `mes-production-engine`,
`inventory-material-engine`, `machine-engine`, `automation-rules-engine`,
`finance-cogs-forecast`, `crm-automation`, `observability`, `svg-dxf-manufacturing`,
`ai-business-agents`, `forecasting`.

### NOT FOUND (nome che non corrisponde a nulla di reale)
Nessuno "inventato da altri": tutte le voci sono capacità reali; semplicemente
**non esistono come skill pubblicate** → ricadono in INTERNAL ONLY.

### REJECTED
- `ai-image-generation` (già installata) — dipendenze esterne/egress, off-scope ERP.
- Qualsiasi skill/installer via `curl | bash` o registry non verificabile
  (Regola 15).

---

## Conclusione operativa
- **Non installare nulla ora.** Nessuna di queste è una skill pronta da scaricare.
- Le capacità "backend/test/ci" migliori sono già coperte da **tool reali**
  (Playwright, Docker, GitHub Actions) → si usano, non si "installano come skill".
- Le capacità di **dominio** (ERP/MES/DB/RBAC) non hanno skill pubblicate: se
  vorrai, le scriverò come **skill interne su misura**, una alla volta, dopo tua
  approvazione — con revisione, senza download esterni.

---

# SKILL SOURCE VERIFICATION COMPLETE

**REAL SKILLS:** nessuna.
**REAL MCP SERVERS:** Supabase / Postgres / Playwright esistono nell'ecosistema ma
**non verificabili da questo ambiente** (egress bloccato) → da confermare altrove.
**REAL TOOLS (presenti):** Playwright, Docker, GitHub Actions.
**INTERNAL SKILLS REQUIRED:** 16 (elenco sopra).
**NOT FOUND:** nessuna voce corrisponde a una skill pubblicata esistente.
**REJECTED:** ai-image-generation; qualsiasi installer opaco/non verificabile.

In attesa di approvazione. Nessuna installazione, nessuna skill creata, nessuna
modifica a codice o database.
