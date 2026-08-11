# INGLY OS — Stato sviluppo (roadmap viva)

> Aggiornato ad ogni avanzamento. Legenda: ✅ fatto · 🟡 in corso · ⏳ da fare.
> Branch di sviluppo: `claude/ingly-os-dev-system-ddgv1f`.

## Colpo d'occhio
| Fase | Titolo | Stato |
|---|---|---|
| 0 | Rete di sicurezza (test + CI) | ✅ **completa** |
| 1 | Modularizzazione (Vite+TS, file singolo) | 🟡 **in corso** — moduli enterprise estratti; dominio iniziato |
| 2 | Backend, sync local-first, auth/RBAC | 🟡 **schema + contratti pronti** (manca infra) |
| 3 | Fisco IT (SDI) + pagamenti | 🟡 **contratti + UI** (fattura & pagamento; invio SDI ⏳ infra) |
| 4 | Integrazioni & omnichannel | 🟡 **contratti pronti** (manca infra) |
| 5 | BI, SaaS multi-tenant, ops | 🟡 **BI agganciato**; SaaS ⏳ |

---

## Fase 0 — Rete di sicurezza ✅
- ✅ Suite test flussi critici (`tests/critical.test.mjs`): boot, moduli, nav no-freeze, integrità dati, checkpoint/restore.
- ✅ Test del bundle modulare (`tests/bundle.test.mjs`).
- ✅ CI GitHub Actions (`.github/workflows/ci.yml`): verify → typecheck → build → test.
- ✅ npm scripts (`verify`, `test`, `typecheck`, `build`, `check`).

## Fase 1 — Modularizzazione 🟡
**Fondamenta** ✅
- ✅ Vite + TypeScript strict → build a **file singolo** (`dist/ingly-modules.js`).
- ✅ Core contratti tipizzati (`src/core/globals.ts`) + utility (`src/core/format.ts`).

**Moduli estratti** ✅ (8)
- ✅ Design System · Icone · AuditLog · MachineInvest · ERPIntel · MarketHub · DataTools.

**Dominio** 🟡
- ✅ Motore di pricing KB (`src/core/pricing.ts`) — estratto e testato.
- ✅ Motore di preventivo (`src/domain/quote.ts`) — righe, sconti quantità,
  totale, minimo ordine, acconto 50% (personalizzati >€50), validità 7 giorni.
- ✅ UI Preventivatore collegata al motore (v75): pannello "⚡ Preventivo rapido
  (motore KB)" nel preventivatore, calcola con `window.InglyDomain.quote`
  (bundle iniettato, installer idempotenti → nessun override dei moduli esistenti).
- ✅ Motore Ordini (`src/domain/orders.ts`) — stati canonici + alias legacy,
  transizioni valide, KPI KB (ricavi settimana/conversione/ticket medio).
- ✅ UI Ordini collegata (v76): "📊 KPI Ordini (motore KB)" calcola con `InglyDomain.orders`.
- ✅ Motore Clienti/CRM (`src/domain/clients.ts`) — segmentazione RFM-lite
  (Champion/Fedele/A rischio/Nuovo/Inattivo) + stima CLV + ranking.
- ✅ UI Clienti collegata (v76): "🏆 Segmentazione (motore KB)" con CLV e ranking.

**Integrazione col monolite** ⏳
- ⏳ Sostituire i blocchi `<script>` inline con il bundle, un modulo alla volta,
  con `npm run check` a ogni passo (gli `install*` sono idempotenti → convivono).

## Fase 2 — Backend & local-first 🟡 (schema + contratti pronti)
- ✅ Schema **Postgres multi-tenant** (`db/schema.sql`) derivato dagli store, con RLS.
- ✅ Contratti **sync local-first** (`src/core/sync.ts`) — push/pull + LWW, testati.
- ✅ **Auth/RBAC** (`src/core/auth.ts`) — ruoli + `can()` puro, testato.
- 📄 Architettura documentata in `.claude/docs/FASE2-BACKEND.md`.
- ⏳ Far girare DB/sync/auth reali — richiede infrastruttura (Postgres, hosting, OIDC).

## Fase 3 — Fisco IT & pagamenti 🟡 (contratti pronti)
- ✅ Logica IVA + numerazione + fattura da preventivo (`src/domain/fiscal.ts`) — testata.
- ✅ Contratti pagamenti + piano acconto/saldo (`src/domain/payments.ts`) — testati.
- ✅ Piano pagamento UI collegato (v84): acconto 50%/saldo dentro l'anteprima fattura.
- 📄 Approccio d'integrazione documentato in `.claude/docs/FASE3-FISCO.md`.
- ✅ Anteprima Fattura UI collegata (v82): "🧾 Anteprima Fattura (fisco)" nel
  preventivatore — genera la fattura normalizzata dal preventivo (IVA, imponibile/imposta, numerazione).
- ⏳ Fattura Elettronica SDI via intermediario (Fatture in Cloud / ACube / Aruba) — richiede backend.
- ⏳ Stripe (delega PCI) + riconciliazione bancaria (PSD2) — richiede backend.

## Fase 4 — Integrazioni & omnichannel 🟡 (contratti pronti)
- ✅ E-commerce (`src/integrations/ecommerce.ts`) — `SalesChannel` + normalizzatori
  Etsy/Shopify (stato→canonico, righe, totale), testati.
- ✅ Spedizioni (`src/integrations/shipping.ts`) — `ShippingProvider` + peso
  volumetrico/tassabile, testati.
- ✅ Marketing (`src/integrations/marketing.ts`) — `MarketingSource` + ROAS/CPA/CTR
  + aggregazione (compat connettori Windsor), testati.
- ⏳ Fetch reale (OAuth/rete) + vetrina pubblica collegata — richiede backend.

## Fase 5 — BI, SaaS, ops 🟡 (BI iniziata)
- ✅ Motore BI/reporting (`src/domain/reporting.ts`) — ricavi per canale/mese,
  margine, ripartizione cassa profit-first (KB), forecast media mobile. Testato.
- ✅ Cruscotto BI UI collegato (v80): "📊 Report direzionale (BI)" in dashboard/analytics.
- ✅ Bundle iniettato nel monolite AGGIORNATO (v80): tutti i motori in `window.InglyDomain`.
- ⏳ Multi-tenant + licenze · Sentry · PWA — richiedono infra/lavoro dedicato.

---

## Metriche correnti
- Monolite: **v84** · ~141 blocchi `<script>` · 0 errori sintassi.
- Bundle modulare: ~49 kB — 13 motori in `window.InglyDomain`.
- Motori/contratti puri e testati: pricing · preventivo · ordini · clienti · fisco ·
  pagamenti · auth/RBAC · sync · e-commerce · spedizioni · marketing · reporting.
- UI agganciate ai motori: preventivatore · ordini · clienti · BI · fattura & pagamento.
- Fix grafici sidebar: preferiti in cima · icone SVG allineate · no flicker · **icone SVG uniformi su tutte le voci (v85)**.
- Test: **7/7 verdi** con assert sui valori KB (36.90, IVA 122, RBAC, LWW, CLV 600, cassa 150/600).

## UX
- ✅ Consolidatore Strumenti (v86): i pulsanti-strumento delle sezioni raggruppati in un menu "🧰 Strumenti" (meno clutter).
- ✅ Consolidamento sezioni (v87-v88): una sola voce per funzione (Ordini, Fornitori, CLV, Report, Competitors, Magazzino→Items) con barra "Viste" che combina le funzioni; 12 sezioni ridondanti rimosse dal menu + fix doppioni nav.

## Prossimo passo consigliato
Restano lavori fattibili offline: (a) uniformare le **icone SVG** a tutta la sidebar;
(c) continuare a **integrare il bundle** sostituendo altri script inline. Le fasi 2-3-4
e SaaS restano al livello "contratti/UI locale" finché non c'è **infrastruttura**
(Postgres/hosting/OIDC/SDI/Stripe).
