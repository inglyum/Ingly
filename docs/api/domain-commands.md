# INGLY OS V2 — Domain Commands (contratti dettagliati)

> Fase 4A · documentazione. Per ogni command: input · validazione · autorizzazione ·
> transazione · idempotenza · output · eventi · audit · errori. Nessuna implementazione.

## Formato
Ogni command è una Edge Function transazionale; emette domain event nell'outbox
(stessa TX) e scrive audit se sensibile.

### confirm_order
- **Input**: `order_id`, `Idempotency-Key`.
- **Validazione**: ordine esiste, stato = DRAFT/CONFIRMED-pending; righe valide.
- **Autorizzazione**: SALES/MANAGER/ADMIN/OWNER sul tenant.
- **Transazione**: set stato CONFIRMED; per ogni riga con materiale → `reserve_material`
  (interno, con lock); crea proiezione finanziaria; (se >€50) segna acconto 50%.
- **Idempotenza**: sì (chiave). **Output**: ordine aggiornato + prenotazioni.
- **Eventi**: `order.confirmed`, `stock.reserved` (per materiale). **Audit**: sì.
- **Errori**: INSUFFICIENT_STOCK, INVALID_STATE_TRANSITION, FORBIDDEN.

### reserve_material
- **Input**: `material_id`, `qty`, `ref{order_id|work_order_id}`, key.
- **Validazione**: qty>0.
- **Autorizzazione**: PRODUCTION/WAREHOUSE/SALES (via confirm_order) o ruolo con permesso.
- **Transazione**: `FOR UPDATE`/advisory lock su saldo; ricalcolo `available`;
  insert reservation **solo se** available≥qty.
- **Idempotenza**: sì. **Output**: reservation. **Eventi**: `stock.reserved`.
- **Errori**: INSUFFICIENT_STOCK (422).

### release_material / consume_material
- **release**: annulla reservation attiva → `available` risale. Evento `stock.released`.
- **consume**: crea `inv_movement` (consume) legato a work_order/operation; chiude
  reservation. Evento `stock.consumed`. Audit sì.

### create_work_order / schedule_work_order
- **create**: da `order_id`+`design_version_id` (immutabile) → work_order + operazioni
  (da routing). Evento `work_order.created`.
- **schedule**: assegna macchina/tempi pianificati; verifica capacità. Evento
  `work_order.scheduled`.

### start_production / complete_production
- **start**: transizione SCHEDULED→IN_PROGRESS (blocca cambio design_version);
  `actual_start`. Evento `production.started`.
- **complete**: →COMPLETED; `actual_end`, `actual_cost`; genera `inv_movement`
  production_output se applicabile. Evento `production.completed`.

### record_quality_result
- **Input**: `work_order_id`, `result[pass|fail]`, note.
- **Transazione**: crea `qc_quality_check`; se fail → `qc_non_conformance(type=rework)`
  + eventuale nuovo giro. Eventi `quality.passed|quality.failed`. Audit sì.

### create_shipment
- Da `order_id` (stato COMPLETED/QC pass) → shipment + items. Evento `shipment.created`.

### issue_invoice / record_payment
- **issue_invoice**: da order → invoice + items (snapshot); SDI status. Evento
  `invoice.issued`. Audit sì.
- **record_payment**: idempotente; crea `fin_payment` + `fin_cashflow_transaction`.
  Evento `payment.received`. Errore PAYMENT_ALREADY_RECORDED se duplicato.

### approve_ai_recommendation
- **Input**: `recommendation_id`, decisione.
- **Autorizzazione**: ruolo richiesto dal tipo di azione (gate).
- **Transazione**: registra `ai_decision`/`ai_approval`; **solo dopo approvazione**
  esegue l'azione collegata (mai automatica se irreversibile). Audit sì.
- **Eventi**: `ai.recommendation.approved|rejected`.

### receive_purchase_order
- Da PO → `inv_movement` receipt per riga; aggiorna incoming. Evento
  `purchase.received`, `stock.received`.

### create_design_version / publish_design_version
- **create**: nuova versione (immutabile) dei layer/oggetti.
- **publish**: congela la versione (usabile in produzione). Evento
  `design.version.published`. Dopo l'uso in produzione IN_PROGRESS non è più modificabile.
