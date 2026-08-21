# INGLY OS V2 — Database Architecture Review (critica)

> Fase 3.5 · solo review. Nessun SQL, nessuna migrazione, nessuna modifica.
> Review critica dei 7 documenti di design. Data: 2026-08-21.

## Esito sintetico
**DATABASE REVIEW STATUS: REQUIRES CHANGES** — impianto solido e approvabile
nel complesso, ma con **9 issue HIGH RISK** da chiudere *prima* dell'implementazione
(soprattutto: prenotazioni concorrenti, coerenza cache stock, costo/ricorsione RLS,
snapshot finanziari, immutabilità del legame design↔work order, ordering/replay
eventi, zone non sicure per la sync offline).

---

## 1 — Table complexity review

Classificazione (≈95 tabelle):

- **CORE**: tenant, tenant_membership, crm_customer, crm_company, cat_product,
  cat_price_list, cat_price_rule, sales_quote(+item), sales_order(+item),
  inv_material, inv_movement, inv_reservation, prod_bom(+item), prod_routing(+op),
  prod_work_order(+op,+material), mac_machine(+profile), fin_invoice(+item),
  fin_payment, dsn_design(+version).
- **SUPPORTING**: contact, lead, opportunity, activity, task, product_variant,
  service, material_variant, material_batch, location, supplier, purchase_order(+item),
  shipment(+item,+event), design_layer, design_object, design_export, project(+asset),
  machine_job, machine_maintenance, machine_downtime.
- **DERIVED (cache/ricalcolabili)**: inv_balance, mac_machine_utilization,
  analytics.kpi_value, analytics.snapshot, crm_customer.value_cached, MV analytics.
- **AUDIT**: audit.audit_log.
- **EVENT**: events.domain_event, events.outbox, events.dlq, sync.mutation_log.
- **ANALYTICS**: analytics.* + tutte le mv_*.
- **OPTIONAL (rinviabili)**: cat_product_variant, inv_material_variant,
  qc_rework/qc_scrap separate, ai_approval (può iniziare come colonna), shipment_event.

Osservazioni:
- **Merge consigliato**: `qc_rework` e `qc_scrap` possono partire come righe di
  `qc_non_conformance` con `type` (rework/scrap) finché non serve dettaglio → **–1/–2 tabelle**.
- **Merge possibile**: `mac_machine_utilization` **non deve essere OLTP** → spostare
  in analytics come MV (`mv_machine_utilization`). **HIGH RISK #7** se resta OLTP scritta.
- **Split corretto**: stock (balance/movement/reservation) — mantenere.
- **Under-normalized da sorvegliare**: `totals JSONB` su quote/order/invoice va bene
  come **snapshot** ma serve anche breakdown minimo per reporting (vedi §5).
- **Over-normalization**: `automation.condition` come tabella separata è probabilmente
  eccessivo → può essere `JSONB` dentro `automation` (regole raramente relazionali).

---

## 2 — Tenant isolation review

Ogni tabella business ha `tenant_id` esplicito (bene: **non** ereditato via join →
evita policy ricorsive costose). Percorsi a rischio cross-tenant individuati:

| Vettore | Rischio | Nota |
|--|--|--|
| **Storage objects** | ALTO | I file (SVG/DXF) in Supabase Storage **non** sono coperti da RLS delle tabelle: serve policy Storage per-bucket/percorso con `tenant_id` nel path + policy. **HIGH RISK #8** |
| Viste/MV analytics | Medio | Le MV aggregano più righe: **devono** filtrare per `tenant_id` e avere RLS o essere per-tenant. Se una MV globale è leggibile → leakage |
| Edge Functions (service-role) | Medio | Bypassano RLS: **devono** re-filtrare per tenant nel codice |
| domain_event/outbox | Medio | Payload può contenere dati di un tenant: schema interno non esposto (ok), ma i consumer devono rispettare il tenant |
| RPC/SECURITY DEFINER | Alto | Se una funzione DEFINER dimentica il filtro tenant → bypass. Vedi §3 |

**Conclusione**: isolamento tabellare OK; **i buchi sono ai bordi** (Storage, MV,
Edge, RPC). Vanno chiusi esplicitamente.

---

## 3 — RLS review (criticità principali)

- **Costo per-riga di `has_permission()`**: se valutata come funzione su ogni riga
  in SELECT di liste grandi → **performance killer** e possibile timeout.
  → **Soluzione**: cache dei permessi in una **claim JWT** (ruolo per tenant nel
  token) e policy che leggono il claim, non tabelle. `current_tenant_ids()` da
  claim, non da subquery. **HIGH RISK #3**.
- **Ricorsione**: policy che interrogano `tenant_membership` che a sua volta ha RLS
  → rischio ricorsione/`infinite recursion`. → funzioni `SECURITY DEFINER` con
  `search_path` fisso e `tenant_membership` con policy semplice non ricorsiva.
- **SECURITY DEFINER**: rischio escalation se `search_path` non bloccato o input
  non validati. → `SET search_path = ''`, schema-qualify, `REVOKE` da public.
- **Override OWNER/ADMIN**: non deve mai bypassare il **confine tenant** (solo i
  check di dettaglio). Da testare esplicitamente.
- **Service-role bypass**: la chiave service-role salta la RLS → **mai** sul client;
  solo Edge; ogni Edge re-valida tenant+ruolo.

**Strategia RLS raccomandata (pulita):**
1. JWT contiene `tenant_ids` e `roles` per tenant (rigenerato al cambio membership).
2. Policy per tabella: `tenant_id = ANY(current_tenant_ids())` (da claim) +
   controllo azione via mappa ruolo→permessi **materializzata** (claim o tabella
   cache indicizzata), non funzione costosa per riga.
3. Funzioni helper `SECURITY DEFINER`, `search_path=''`, testate.
4. Test anti-leakage automatici (cross-tenant, ruoli, override).

---

## 4 — Inventory accounting review

- Formula **`available = on_hand − reserved + incoming`**: confermata corretta.
- Derivazione stock da movimenti/prenotazioni/PO/consumi/output/resi/scarti/rettifiche:
  **coerente** se **ogni** variazione è un `inv_movement` (incluso output produzione
  come movimento positivo e consumo come negativo). Da esplicitare che
  produzione **output** e **resi** sono movimenti tipizzati.
- **HIGH RISK #1 — race su prenotazioni concorrenti**: due ordini che prenotano lo
  stesso materiale possono entrambi vedere `available>0` e riservare oltre lo stock.
  → **Soluzione**: la prenotazione avviene in **Edge/transazione** con lock
  (`SELECT … FOR UPDATE` sul saldo materiale o advisory lock per material_id), oppure
  un **CHECK** applicativo in una funzione atomica che ricalcola available e inserisce
  la reservation solo se sufficiente. Mai calcolo lato client.
- **HIGH RISK #2 — coerenza `inv_balance` (cache)**: se aggiornata da trigger su
  movimenti ma un import/adjust bypassa il trigger → deriva. → `inv_balance`
  **sempre** derivata dai movimenti (trigger unico + job di riconciliazione
  periodico che ricalcola e confronta). Considerare di **non** materializzare e
  calcolare on-the-fly con vista indicizzata finché il volume lo permette.

---

## 5 — Order/Quote financial snapshots

- **Necessari snapshot immutabili** al momento della conferma per: prezzi unitari,
  sconti, aliquote IVA, costi (breakdown), spedizione, fee, margine.
- Attuale design congela `totals JSONB`: **insufficiente** per reporting → serve
  che **`sales_order_item`/`fin_invoice_item` congelino** `unit_price`, `discount`,
  `vat_rate`, `cost` **come colonne** (non solo nel JSONB del documento).
- **cost_breakdown JSONB** sul quote item va bene come dettaglio; ma il **costo
  totale di riga** deve essere colonna per aggregazioni margine.
- **Regola**: cambiare `cat_price_rule` **non deve** alterare documenti storici →
  i documenti non referenziano il prezzo "live", lo copiano. **APPROVED WITH CHANGES**.

---

## 6 — Manufacturing / MES review

Il modello supporta correttamente:
- order 1─* work_order ✔ · work_order 1─* operation ✔ · operation → material
  consumption (via `prod_work_order_material` + movimenti) ✔ · operation →
  machine ✔ · operation → actual data (`actual_min`, tempi) ✔ · product 1─* BOM
  versions (via `prod_bom.version`) ✔ · BOM → alternative materials
  (`prod_bom_item.alternative_group`, `optional`) ✔.
- **Gap**: manca legame esplicito **operation → consumi effettivi per operazione**
  (ora i materiali sono a livello work_order). Se serve costo per operazione →
  aggiungere `work_order_operation_id` opzionale su `prod_work_order_material`.
  **APPROVED WITH CHANGES** (basso rischio).
- **Capacity/scheduling**: modellati come dati (job/utilization) ma l'algoritmo di
  scheduling è logica di dominio (non DB) — corretto.

---

## 7 — Design → production review

- Catena design→version→preflight→BOM→material/machine→work_order: **corretta**.
- **HIGH RISK #4 — immutabilità del legame**: `prod_work_order.design_version_id`
  deve puntare alla **versione esatta** usata all'avvio produzione e **non** al
  "current_version" del design. Se il design evolve, la produzione storica non deve
  cambiare. → `design_version` immutabile (già previsto) + FK del work order alla
  **version**, mai al `design`. Aggiungere `CHECK`/trigger che vieta il cambio di
  `design_version_id` dopo `status >= IN_PROGRESS`. **REQUIRED CHANGE**.
- `dsn_design.current_version_id` è solo un puntatore "comodità" e non va usato per
  la produzione.

---

## 8 — Finance review

- Copertura ricavi/COGS/margine/spese/AR/AP/cashflow: adeguata a **finanza
  operativa ERP**.
- **Confusione ERP vs contabilità**: correttamente evitata (dichiarato non
  certificato). Bene.
- **Mancanze per management reporting affidabile**:
  - **Valuta e cambio**: aggiungere `currency` e (se multi-valuta) `fx_rate` su
    documenti/pagamenti. Oggi implicito EUR.
  - **Periodo/competenza**: per report mensili serve `accounting_period` o almeno
    date coerenti (issue_date vs received_at) → definire su cosa si aggrega.
  - **AR/AP come stato**: derivare da invoice/payment (invoice non pagata = AR) →
    ok, ma serve vista dedicata.
  - **COGS**: dipende da `fin_cost_allocation` completo (material+machine+labor+
    design+overhead). Se un costo manca, il margine è falsato → **validazione** che
    ogni ordine chiuso abbia allocazioni minime. **APPROVED WITH CHANGES**.

---

## 9 — Event / outbox review

- Struttura `domain_event` + `outbox` + `dlq` con `correlation_id`/`causation_id`/
  `idempotency_key`: **solida**.
- **Duplicati**: gestiti da `idempotency_key UNIQUE` + consumer idempotenti ✔.
- **Retry/DLQ**: previsti ✔. **Poison events**: dopo N retry → DLQ con motivo ✔.
- **HIGH RISK #5 — ordering**: nessuna garanzia d'ordine tra eventi dello stesso
  aggregato. Per alcuni flussi (es. order.created prima di order.confirmed) l'ordine
  conta. → aggiungere **`sequence` per aggregato** (`aggregate_type,aggregate_id,
  aggregate_version`) e dispatch ordinato per aggregato. **REQUIRED CHANGE**.
- **Transaction boundaries**: l'evento **deve** essere scritto nella **stessa TX**
  dell'operazione (outbox pattern) — da rendere vincolante nelle Edge Functions.
- **Replay**: `domain_event` append-only consente replay → ok; i consumer devono
  essere idempotenti anche in replay.

---

## 10 — Offline sync review (zone non sicure)

Policy per entità — valutazione:

| Entità | Strategia proposta | Verdetto |
|--|--|--|
| settings/brand | client-wins | ✔ sicuro |
| designs/projects (bozze) | client-wins | ✔ sicuro (finché non in produzione) |
| customers | merge/last-write | ⚠️ ok con merge campo-a-campo; attenzione a dedup |
| quotes | server-authoritative dopo invio | ✔ |
| **orders** | server-wins | ✔ **obbligatorio** (mai client-wins) |
| **inventory (movements)** | — | ❌ **HIGH RISK #6**: i movimenti **non** vanno mai risolti con "wins": sono **append-only**; offline si accumulano come **intenzioni** e il server li applica in transazione con ricontrollo disponibilità. Nessun overwrite |
| **production (work order state)** | server-wins | ✔ obbligatorio |
| **finance (payments/invoice)** | — | ❌ mai offline-authoritative: pagamenti/fatture solo server, no client-wins |

**Regola**: per **inventario, ordini, produzione, finanza** la scrittura offline è
una **richiesta** che il server valida/applica, **non** un dato autorevole. Il
client-wins è ammesso **solo** per bozze/preferenze/design non ancora in produzione.

---

## 11 — Storage / files review

- Separazione metadati(DB)/binari(Storage): corretta.
- **HIGH RISK #8 — tenant boundary sui file**: gli oggetti Storage non ereditano la
  RLS delle tabelle. → path convenzionale `tenant_id/design_id/version/...` +
  **Storage policy** che consente accesso solo se l'utente è membro del tenant nel
  path; URL firmati a scadenza per download; nessun bucket pubblico per asset cliente.

---

## 12 — Analytics review

- Regola OLTP↔analytics rispettata **tranne** `mac_machine_utilization` (spostare in
  MV). Snapshot/KPI da MV: ok.
- MV **per-tenant** o filtrate: obbligatorio (vedi §2).
- Refresh `CONCURRENTLY` su schedule/evento per non bloccare letture.

---

## 13 — Index review

- **Buoni**: indici tenant+status+date, FK, trgm per search. Coerenti.
- **Mancanti**: indice su `fin_cost_allocation (tenant_id, ref_type, ref_id)`;
  `dsn_design_version (tenant_id, design_id, version)` UNIQUE; `sync.mutation_log`
  su `(client_mutation_id)` e `(idempotency_key)`; `events.outbox (status)`.
- **Ridondanti da evitare**: indice su `tenant_id` da solo quando esiste già
  `(tenant_id, status, ...)` (il prefisso copre); rimuovere i singoli ridondanti.
- **Write cost**: `inv_movement`, `domain_event`, `audit_log` sono append-only ad
  alto volume → limitare gli indici allo stretto necessario per non penalizzare le
  scritture.

---

## 14 — Migration review (V96 → V2)

- **Ambigui**: store IndexedDB legacy non documentati → ispezione manuale.
- **Hardcoded**: prezzi/markup/KPI nei template → estrazione in `price_rule`/
  `kpi_definition`, con `kb-audit`. **Richiede staging + review manuale.**
- **Non migrabile in sicurezza**: stock storico (manca il registro movimenti) →
  saldo iniziale come singolo `adjust`; lo storico riparte da V2.
- **Legacy senza destinazione**: toggle UI/localStorage non business → scartati (log).
- **Destinazione senza sorgente**: work order, qualità, eventi, audit, ruoli
  espliciti → partono vuoti.
- **Staging tables**: necessarie per clienti (dedup), prezzi (validazione),
  preventivi/ordini (congelamento totals).

---

## 15 — Performance review (candidati partitioning)

Alto volume nel tempo → partizionare per range temporale **quando** cresceranno
(non ora): `inv_movement`, `events.domain_event`, `audit.audit_log`,
`automation.execution_log`, `mac_machine_job`, `sync.mutation_log`, `ai.ai_run`.
Order/order_items e work_orders: alto volume ma con lifecycle → indici + eventuale
archiviazione, partitioning solo se necessario.

---

## Sintesi per categoria

### A. APPROVED
Impianto multi-tenant con tenant_id esplicito; separazione schemi; split stock;
design versioning; outbox eventi; principi di tipizzazione/immutabilità.

### B. APPROVED WITH CHANGES
Snapshot finanziari come **colonne** su item (§5); consumo materiale per operazione
(§6); valuta/periodo in finance (§8); indici mancanti/ridondanti (§13); merge
qc_rework/qc_scrap e automation.condition→JSONB (§1).

### C. HIGH RISK (9) — vedi database-decisions.md per dettaglio
1. Race prenotazioni concorrenti · 2. Coerenza cache inv_balance · 3. Costo/ricorsione
RLS per-riga · 4. Immutabilità legame work_order↔design_version · 5. Ordering eventi
per aggregato · 6. Sync offline non sicura per inventory/order/finance · 7.
machine_utilization in OLTP · 8. Tenant boundary sui file Storage · 9. MV analytics
non filtrate per tenant.

### D. REJECT
Nessun elemento da rigettare in toto. (Nessuna tabella "da non esistere" se si
sposta utilization in analytics.)

### E. REQUIRED CHANGES BEFORE IMPLEMENTATION
- RLS basata su **claim JWT** (no funzioni costose per riga) + test anti-leakage.
- Prenotazioni stock **transazionali con lock**; movimenti append-only, mai "wins".
- `work_order.design_version_id` immutabile dopo IN_PROGRESS.
- `aggregate_version`/sequence sugli eventi; evento nella stessa TX (outbox).
- Storage policy per-tenant + URL firmati.
- MV analytics per-tenant; `machine_utilization` → MV.
- Snapshot prezzi/sconti/IVA/costo come colonne sugli item.

---

# DATABASE REVIEW STATUS: REQUIRES CHANGES
Chiudere i 9 HIGH RISK + i "REQUIRED CHANGES" prima dell'implementazione. Nessuna
tabella creata, nessun SQL, nessuna migrazione, v96 intatta.
