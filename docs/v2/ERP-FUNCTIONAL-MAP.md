# INGLY OS — ERP Functional Map (Fase 8)

> Mappa funzionale **estratta da `INGLY-OS-v96-STANDALONE.html`** (fonte di verità).
> Nessuna struttura inventata: i moduli e le categorie provengono dal registro
> sezioni di v96. V96 resta l'implementazione di riferimento e **non** viene toccato.
> Totale: **95 moduli** in **12 categorie**.

## 1. Navigazione principale (categorie)
1. **Home** — 1 moduli
2. **AI** — 8 moduli
3. **Preventivi** — 7 moduli
4. **Vendite** — 2 moduli
5. **Finanza** — 13 moduli
6. **Clienti** — 5 moduli
7. **Produzione** — 5 moduli
8. **Magazzino** — 11 moduli
9. **Analisi** — 5 moduli
10. **Marketing** — 19 moduli
11. **Sistema** — 10 moduli
12. **Strumenti** — 9 moduli

## 2. Tutti i moduli per categoria

### Home (1)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `dashboard` | 📊 Dashboard ROI | ✅ implementato (IA reale) |

### AI (8)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `ai` | 🤖 AI Decisioni | 🟡 nav+route ok · UI da connettere |
| `aicoach` | 🧠 AI Coach | 🟡 nav+route ok · UI da connettere |
| `bizai` | 🚀 Business AI Hub | 🟡 nav+route ok · UI da connettere |
| `forecasting` | 🔮 AI Previsioni | 🟡 nav+route ok · UI da connettere |
| `decision` | 🎯 Decision Engine | 🟡 nav+route ok · UI da connettere |
| `intel` | ⚡ Intelligence Hub | 🟡 nav+route ok · UI da connettere |
| `market_agent` | 🤖 Market AI Agent | 🟡 nav+route ok · UI da connettere |
| `studio_ai` | ✨ AI Studio | 🟡 nav+route ok · UI da connettere |

### Preventivi (7)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `quoter` | 📄 Smart Quoter | 🟡 nav+route ok · UI da connettere |
| `lasercalc` | ⚡ 🧮 Calc Laser | 🟡 nav+route ok · UI da connettere |
| `print3d` | 🖨️ Smart Quote 3D | 🟡 nav+route ok · UI da connettere |
| `apparel` | 👕 Smart Quote Apparel | 🟡 nav+route ok · UI da connettere |
| `listino` | 💼 Listino B2B | 🟡 nav+route ok · UI da connettere |
| `template_docs` | 🎨 Template Documenti | 🟡 nav+route ok · UI da connettere |
| `quoteintel` | 📈 Quote Intelligence | 🟡 nav+route ok · UI da connettere |

### Vendite (2)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `sales` | 💰 Vendite & Fatture | 🟡 nav+route ok · UI da connettere |
| `sales_archive` | 📋 Archivio Vendite | 🟡 nav+route ok · UI da connettere |

### Finanza (13)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `fiscal` | 📊 Radar Fiscale | 🟡 nav+route ok · UI da connettere |
| `xmlsdi` | 🧾 Fattura XML SDI | 🟡 nav+route ok · UI da connettere |
| `recurring` | 🔄 Fatture Ricorrenti | 🟡 nav+route ok · UI da connettere |
| `taxcalendar` | 📅 Calendario Fiscale | 🟡 nav+route ok · UI da connettere |
| `finance` | 📊 Finance Pro | 🟡 nav+route ok · UI da connettere |
| `cashflow` | 💧 Cashflow | 🟡 nav+route ok · UI da connettere |
| `fixed_costs` | 🧾 Costi Fissi | 🟡 nav+route ok · UI da connettere |
| `bank_funds` | 🏦 Bank & Funds | 🟡 nav+route ok · UI da connettere |
| `profitscope` | 💰 ProfitScope | 🟡 nav+route ok · UI da connettere |
| `dynamicprice` | 🔥 Prezzi Dinamici | 🟡 nav+route ok · UI da connettere |
| `revsim` | 📈 Revenue Simulator | 🟡 nav+route ok · UI da connettere |
| `goals` | 🎯 Obiettivi | 🟡 nav+route ok · UI da connettere |
| `profitleak` | 🔍 Profit Leak Detector | 🟡 nav+route ok · UI da connettere |

### Clienti (5)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `clients` | 👥 CRM Clienti | ✅ implementato (IA reale) |
| `clientintel` | 🧠 Client Intelligence | 🟡 nav+route ok · UI da connettere |
| `clv` | 👑 CLV Clienti | 🟡 nav+route ok · UI da connettere |
| `leadscorer` | ⭐ Lead Scorer | 🟡 nav+route ok · UI da connettere |
| `b2bpitch` | 🤝 B2B Pitch Builder | 🟡 nav+route ok · UI da connettere |

### Produzione (5)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `gestione_ordini` | 📦 Ordini & Workflow | ✅ implementato (IA reale) |
| `workflow_dashboard` | ⚡ Workflow Overview | 🟡 nav+route ok · UI da connettere |
| `timetracker` | ⏱️ Time Tracker | 🟡 nav+route ok · UI da connettere |
| `booking` | 📅 Booking | 🟡 nav+route ok · UI da connettere |
| `scanner` | 📷 Scanner Spese | 🟡 nav+route ok · UI da connettere |

### Magazzino (11)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `items` | 🗄️ Magazzino | 🟡 nav+route ok · UI da connettere |
| `catalog` | 📚 Catalogo | ✅ implementato (IA reale) |
| `gadgets` | 🧩 Gadget & Accessori | 🟡 nav+route ok · UI da connettere |
| `materials` | 🪵 Materiali | 🟡 nav+route ok · UI da connettere |
| `equipment` | 🔧 Attrezzature | 🟡 nav+route ok · UI da connettere |
| `paints` | 🎨 Vernici & Bombolette | 🟡 nav+route ok · UI da connettere |
| `components` | ⚙️ Componenti & Accessori | 🟡 nav+route ok · UI da connettere |
| `inventory` | 📋 Inventario | 🟡 nav+route ok · UI da connettere |
| `suppliers` | 🚚 Fornitori | 🟡 nav+route ok · UI da connettere |
| `barcode` | 📊 Barcode Scanner | 🟡 nav+route ok · UI da connettere |
| `supplierintel` | 🚚 Supplier Intelligence | 🟡 nav+route ok · UI da connettere |

### Analisi (5)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `analytics` | 📊 Analytics | 🟡 nav+route ok · UI da connettere |
| `kpi` | ⚡ KPI Live | 🟡 nav+route ok · UI da connettere |
| `forecaster` | 📈 Financial Forecaster | 🟡 nav+route ok · UI da connettere |
| `opportunity` | 🔭 Opportunity Scanner | 🟡 nav+route ok · UI da connettere |
| `growthengine` | 🚀 Growth Engine | 🟡 nav+route ok · UI da connettere |

### Marketing (19)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `marketing` | 📣 Marketing Pro | 🟡 nav+route ok · UI da connettere |
| `social` | 📱 Social Media | 🟡 nav+route ok · UI da connettere |
| `socialstudio` | 🎬 Social Studio | 🟡 nav+route ok · UI da connettere |
| `etsy` | 🛍️ Etsy Suite | 🟡 nav+route ok · UI da connettere |
| `etsy_pulse` | 🔥 Etsy Pulse Live | 🟡 nav+route ok · UI da connettere |
| `etsy_seo_wizard` | ✨ Etsy SEO Wizard | 🟡 nav+route ok · UI da connettere |
| `trendscanner` | 🔍 Trend Hunter | 🟡 nav+route ok · UI da connettere |
| `demand_map` | 🗺️ Demand Map | 🟡 nav+route ok · UI da connettere |
| `product_hunter` | 🎯 Product Hunter AI | 🟡 nav+route ok · UI da connettere |
| `live_intel` | 📡 Live Intel Feed | 🟡 nav+route ok · UI da connettere |
| `price_radar` | 📡 Price Radar | 🟡 nav+route ok · UI da connettere |
| `etsyai` | 🤖 Etsy AI Suite | 🟡 nav+route ok · UI da connettere |
| `photostudio` | 📸 Photo Studio AI | 🟡 nav+route ok · UI da connettere |
| `imagelib` | 🖼️ Libreria Immagini | 🟡 nav+route ok · UI da connettere |
| `contentperf` | 📊 Content Performance | 🟡 nav+route ok · UI da connettere |
| `replyai` | 💬 Reply Assistant | 🟡 nav+route ok · UI da connettere |
| `socialproof` | ⭐ Social Proof AI | 🟡 nav+route ok · UI da connettere |
| `marketintel` | 🌐 Market Intel | 🟡 nav+route ok · UI da connettere |
| `competitors` | 🔍 Competitor Monitor | 🟡 nav+route ok · UI da connettere |

### Sistema (10)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `settings` | ⚙️ Impostazioni | 🟡 nav+route ok · UI da connettere |
| `backup` | 💾 Backup Locale | 🟡 nav+route ok · UI da connettere |
| `portabile` | ☁️ Esporta Portatile | 🟡 nav+route ok · UI da connettere |
| `history` | 📋 Storico | 🟡 nav+route ok · UI da connettere |
| `reports` | 📄 Report PDF | 🟡 nav+route ok · UI da connettere |
| `team` | 👥 Team & HR | 🟡 nav+route ok · UI da connettere |
| `brand_identity` | 🎨 Brand Identity | 🟡 nav+route ok · UI da connettere |
| `inglydesign` | ✏️ Ingly Design | 🟡 nav+route ok · UI da connettere |
| `legal` | ⚖️ Legale | 🟡 nav+route ok · UI da connettere |
| `smartnotif` | 🔔 Notifiche Smart | 🟡 nav+route ok · UI da connettere |

### Strumenti (9)

| Sezione (route) | Modulo | Stato V2 |
|--|--|--|
| `laserresources` | 🔧 Risorse Laser | 🟡 nav+route ok · UI da connettere |
| `lab_setup` | 🧪 Lab & Lista Acquisti | 🟡 nav+route ok · UI da connettere |
| `laser_b2b` | 💼 Laser B2B | 🟡 nav+route ok · UI da connettere |
| `calendar` | 📅 Calendario | 🟡 nav+route ok · UI da connettere |
| `ideas` | 💡 Idee & Ispirazione | 🟡 nav+route ok · UI da connettere |
| `innovation` | 🔬 Innovazione | 🟡 nav+route ok · UI da connettere |
| `projects` | 📁 Progetti | 🟡 nav+route ok · UI da connettere |
| `strategy` | ♟️ Strategia | 🟡 nav+route ok · UI da connettere |
| `fiera` | 🎪 Fiera Assistant | 🟡 nav+route ok · UI da connettere |


## 3. Architettura informativa dei moduli prioritari (da v96)
### 📊 Dashboard ROI (`dashboard`)
KPI (Ricavi MTD, Ordini attivi, Preventivi, Margine) · liste "Ultime Vendite" e
"Preventivi Recenti" · azioni: Aggiorna, Nuovo Preventivo. *Dipende da: Vendite,
Preventivi, Finanza.*
### 👥 CRM Clienti (`clients`)
Tab: Lista · Pipeline · Attività. Toolbar: ricerca cliente, filtro segmento,
+ Nuovo cliente. Tabella: Nome, Email, Telefono, Segmento, Valore. Tag cliente,
follow-up. *Dipende da: Vendite (valore), Ordini.*
### 📚 Catalogo (`catalog`)
Griglia prodotti · ricerca per nome/SKU · toggle "Solo Ingly" · Importa catalogo ·
+ Prodotto · export PDF. *Dipende da: Magazzino/Materiali, Preventivi.*
### 📦 Ordini & Workflow (`gestione_ordini`)
Kanban per stato (Bozza · In produzione · Pronto · Consegnato) · Nuovo ordine ·
Preventivo rapido · avanzamento stato. *Dipende da: Clienti, Catalogo, Produzione.*

## 4. Workflow trasversali (da v96)
- **Preventivo → Ordine → Produzione → Vendita/Fattura → Cassa** (order-to-cash).
- **Catalogo/Materiali → Smart Quoter → Preventivo** (pricing).
- **Marketing/Etsy/Trend → Idee prodotto → Catalogo**.
- **Backup/Storico/Export** (sistema) trasversale a tutti i dati.

## 5. Entità dati locali (IndexedDB v96) — sintesi
Store principali osservati: clienti, prodotti/catalogo, materiali, preventivi,
ordini, vendite/fatture, movimenti cassa, progetti, immagini, impostazioni,
sessione SaaS. Dettaglio e mappatura → `ERP-DATA-MAPPING.md`.

## 6. Cosa funziona già in V96 vs cosa richiede backend V2
- **Funziona in V96 (offline, IndexedDB)**: praticamente tutti i 95
  moduli operano localmente sul browser del singolo utente.
- **Richiede backend V2 (Supabase)**: multi-utente/multi-dispositivo, RBAC/tenant,
  audit, automazioni, sync — ovvero rendere i moduli condivisi e sicuri. In V2
  oggi: navigazione+routing di tutti i moduli ✅; UI reale per Dashboard/CRM/
  Catalogo/Ordini (stati vuoti finché il backend dati non è connesso) ✅; gli
  altri moduli hanno pagina "non ancora connessa" (nessun controllo finto).
