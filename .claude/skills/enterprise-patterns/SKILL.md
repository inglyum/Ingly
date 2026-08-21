---
name: enterprise-patterns
description: >
  Programma di trasformazione di INGLY OS in una piattaforma ERP/CRM/MES/Design
  Studio + AI enterprise, modulare e production-ready. Usa questa skill quando si
  pianifica o si esegue l'evoluzione architetturale del gestionale (audit dello
  stato attuale, database v2, ERP core, MES/produzione, motore materiali/macchine,
  smart quoter, automazioni, AI business, design studio, sicurezza/RBAC, testing,
  observability, DR, UX enterprise). Impone un approccio a fasi, non distruttivo,
  con backup e test prima di ogni cambiamento. NON installare skill duplicate,
  NON riscrivere alla cieca, NON modificare codice durante l'audit.
---

# INGLY OS V2 — Enterprise ERP / MES / Design Platform — Master Command

> Origine: pacchetto "enterprise-patterns" fornito dall'utente (MCP Market /
> inglydesign). Salvato come skill di progetto. È una guida operativa a fasi:
> ogni fase va eseguita solo su richiesta esplicita, rispettando le REGOLE
> CRITICHE in fondo (non distruttivo, backup+commit prima, test verdi, niente
> migrazioni distruttive automatiche, AI mai azioni irreversibili senza conferma).

You are acting as a Principal Software Architect, ERP Architect, MES Architect,
SaaS Architect, Database Architect, DevOps Engineer, Automation Architect,
AI Product Architect, UX Engineer, Design-System Engineer and Laser
Manufacturing Software Architect.

PROJECT: INGLY OS · CURRENT VERSION: v96 standalone

GOAL: Transform the current INGLY OS into a professional, modular,
production-ready ERP + CRM + MES + Design Studio + AI Business Operating System
for creative manufacturing, laser cutting, personalization, digital design and
custom production.

IMPORTANT: DO NOT destroy the current application. DO NOT rewrite everything
blindly. DO NOT remove existing functionality before mapping it. DO NOT install
random skills. DO NOT duplicate skills that solve the same problem.

## PHASE 0 — PROJECT DISCOVERY (read-only)
Inspect the whole repo; identify frontend/backend/db/storage/auth/API/state/
business logic/modules/services/utilities/tests/build/deploy/deps/integrations/
localStorage+IndexedDB/hardcoded business data/duplicated code/legacy patches/
inline JS/vendor libs. Build a dependency map; identify persistence, ERP modules,
design modules, production workflows, data entities+relations, automations, AI,
technical debt. DO NOT MODIFY CODE. Produce `/docs/architecture/current-state.md`.

## PHASE 1 — SKILL AUDIT
Evaluate candidate skills across DB, backend, ERP, MES/manufacturing, automation,
design (SVG/DXF/CAD/nesting/kerf), AI, testing, devops, security, UX.

## PHASE 2 — NO DUPLICATES
Score each candidate 0–5 (quality, stars, recency, docs, security, relevance,
compatibility, maintenance, duplication, implementation value). Produce
`/docs/skills/skill-evaluation.md` (table: Skill | Category | Score | Reason | Install).
Only install with strong justification.

## PHASE 3 — CORE SKILL STACK
P0: PostgreSQL arch/opt, migration safety, REST API arch, API security, workflow
automation, production scheduling+planning, inventory, quality, E2E+regression+
security testing, CI/CD, observability, backup/DR. P1: CRM automation, sales
pipeline, financial analytics, cashflow, purchasing, supplier mgmt, BOM, machine
maintenance, BI, forecasting. P2: SVG/DXF/CAD, parametric design, geometry,
laser workflows, AI BI/agents, design system, accessibility, visual regression.

## PHASE 4 — DATABASE ARCHITECTURE
Design normalized enterprise DB in `/docs/architecture/database-v2.md`. Core
entities: TENANT/USER/ROLE/PERMISSION/AUDIT_LOG; CUSTOMER/CONTACT/LEAD/
OPPORTUNITY/ACTIVITY; PRODUCT/VARIANT/SERVICE/PRICE_LIST/PRICE_RULE; QUOTE/ITEM/
ORDER/ITEM/STATUS_HISTORY; BOM/ITEM/ROUTING/WORK_ORDER/OPERATION; MATERIAL/BATCH/
INVENTORY/MOVEMENT/PURCHASE_ORDER/ITEM/SUPPLIER; MACHINE/PROFILE/MAINTENANCE/JOB/
UTILIZATION; PROJECT/ASSET/DESIGN/VERSION/LAYER/OBJECT; QUALITY_CHECK/NON_CONF/
REWORK/SCRAP; SHIPMENT/ITEM; INVOICE/PAYMENT/EXPENSE/CASHFLOW_TX; AUTOMATION/
TRIGGER/ACTION/EXECUTION; NOTIFICATION/WEBHOOK/INTEGRATION; AI_RUN/RECOMMENDATION/
DECISION_LOG. Immutable IDs, timestamps, auditability, soft-delete only where justified.

## PHASE 5 — ERP CORE
Modules: CONTROL/SALES/CRM/CATALOG/PURCHASING/INVENTORY/PRODUCTION/MACHINES/
PROJECTS/FINANCE/MARKETING/TEAM/ANALYTICS/LEGAL/SYSTEM, communicating via shared
domain services (event-driven). Es: ORDER CONFIRMED → inventory reservation →
material requirement → work order → scheduling → machine assignment → ETA →
customer status → notification → financial projection → analytics.

## PHASE 6 — MES / PRODUCTION ENGINE
Planning, queue, work orders, operations, machine scheduling, material
reservation, capacity, est/actual/setup/downtime times, scrap, rework, QC, cost,
margin. Work order fields + statuses DRAFT/READY/MATERIAL_WAITING/SCHEDULED/
IN_PROGRESS/QUALITY_CHECK/REWORK/COMPLETED/CANCELLED.

## PHASE 7 — MATERIAL ENGINE
On-hand/reserved/available/min/safety/incoming/committed. AVAILABLE = ON_HAND −
RESERVED + INCOMING. Low/critical stock, forecast, purchase suggestions, supplier
lead time, cost history.

## PHASE 8 — MACHINE ENGINE
Profile (manufacturer/model/power/area/materials/hourly cost/energy), maintenance
schedule+history, utilization, downtime, jobs, ROI. Compute utilization/revenue/
cost/margin/ROI/payback.

## PHASE 9 — SMART QUOTER
Price from material + waste + machine time + hourly cost + labor + setup + design
+ finishing + packaging + shipping + platform/payment fees + overhead + target
margin + discount. Return cost/margin/margin%/recommended/minimum/customer price.
Scenario simulation (+10% material, +20% labor, +15% machine time).

## PHASE 10 — AUTOMATION ENGINE
Centralized rules engine EVENT → CONDITION → ACTION → EXECUTION → LOG. Triggers
(order.*/quote.*/stock.*/machine.maintenance_due/production.*/quality.failed/
invoice.overdue/customer.inactive/project.completed). Actions (create_task/
notification/email/webhook/purchase_suggestion/reserve_material/work_order/
schedule_machine/update_status/followup/document/ai_analysis). Everything logged.

## PHASE 11 — AI BUSINESS ENGINE
AI CEO/CFO/COO/CMO/Production Manager. AI must NOT silently execute destructive
financial/production actions; recommendations logged.

## PHASE 12 — DESIGN STUDIO
DESIGN → VERSION → LAYERS → OBJECTS → MANUFACTURING DATA. Formats SVG/DXF/PNG/JPG/
PDF. Objects path/text/shape/image/group. Ops boolean/offset/outline/simplify/
transform/align. Manufacturing kerf/cut/engrave/score/material+layer mapping/
nesting/sheet utilization/cutting time.

## PHASE 13 — DESIGN → PRODUCTION
DESIGN → PRE-FLIGHT → MANUFACTURING CHECK → MATERIAL → MACHINE → JOB → PRODUCTION
→ QUALITY → SHIPMENT. Preflight detects open/duplicate/zero-length paths, invalid
SVG, unsupported objects, too-small/overlapping geometry, missing units/material/
machine params.

## PHASE 14 — CRM
Lead/Contact/Company/Opportunity/Pipeline/Activities/Tasks/Follow-up/Customer
value/history/repeat/profitability/segmentation. Automations (quote unanswered,
inactive customer, high-value, repeat opportunity, event, B2B follow-up).

## PHASE 15 — FINANCE
Revenue/COGS/Gross Margin/OpEx/Net Margin/Cashflow/AR/AP/Forecast. Every order
exposes revenue/direct cost/gross margin/margin%. Do not claim certified
accounting unless actually implemented.

## PHASE 16 — SECURITY
RBAC + permission matrix, session security, rate limiting, input validation,
output encoding, CSRF where applicable, CSP, secure headers, secret management,
audit log, data access controls. Roles OWNER/ADMIN/MANAGER/SALES/DESIGNER/
PRODUCTION/WAREHOUSE/FINANCE/VIEWER. Sensitive ops auditable.

## PHASE 17 — TESTING
unit/integration/db/api/E2E/visual regression/security/migration tests. Critical
flows quote→order→production→inventory→quality→shipment→invoice→payment,
customer→CRM, material→purchasing, machine→production, design→manufacturing.

## PHASE 18 — OBSERVABILITY
structured logging, error tracking, perf monitoring, automation+AI+API logs, db
monitoring, production event logs. Doc `/docs/operations/observability.md`.

## PHASE 19 — BACKUP / DR
db/file/design/config backup, restore procedure, verification, retention. Doc
`/docs/operations/disaster-recovery.md`.

## PHASE 20 — UX
command palette, global search, keyboard shortcuts, contextual+bulk actions,
saved filters, responsive tables, Kanban/timeline/calendar/production board,
financial dashboards. Dashboard answers: what's happening / needs attention /
makes money / loses money / is blocked / do next.

## PHASE 21 — DOCUMENTATION
`/docs/{architecture,database,api,erp,mes,design-studio,automation,ai,security,
testing,operations,integrations}`. Every major module documented.

## PHASE 22 — IMPLEMENTATION ORDER
Audit → Architecture → Database → API → Auth/RBAC → ERP Core → Inventory →
Production/MES → Machines → Automation → Finance → CRM → Design Studio →
Design→Production → AI Business → Testing → Security → Observability → Deployment.

## CRITICAL RULES
1. Never destroy working functionality without a replacement.
2. Before refactoring, create a backup / git commit.
3. Never modify production data directly.
4. Never execute destructive DB migrations automatically.
5. Every migration must have a rollback strategy.
6. Every new module must have tests.
7. Every new business entity must have documentation.
8. Do not duplicate functionality already present.
9. Prefer modular architecture over monolithic patches.
10. Do not keep adding JS patches to the old standalone file if the architecture
    should move to modular components.
11. Preserve current visual identity unless explicitly redesigning it.
12. Do not remove offline functionality until the replacement is verified.
13. Do not invent integrations that are not actually connected.
14. AI cannot perform irreversible actions without confirmation.
15. Before installing any MCP skill, verify source/author/maintenance/security/
    compatibility/duplication/license.

## FINAL DELIVERABLE
`/docs/INGLY-OS-V2-ROADMAP.md` with: current+target architecture, installed/
rejected skills, DB/ERP/MES/Design/Automation/AI/Security/Testing architecture,
migration plan, implementation phases, risks, complexity per module, technical
debt, next 10 highest-priority tasks. DO NOT claim completion until tests pass.
