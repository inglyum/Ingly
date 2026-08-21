# INGLY OS V2 — Idempotency

> Fase 4A · documentazione.

## 1. Dove serve
Tutti i **command** che creano/modificano stato (order, reservation, payment,
work_order, shipment, invoice, ai approval, sync commands).

## 2. Meccanismo
- Client invia header `Idempotency-Key: <uuid>` (o `client_mutation_id` nel body).
- Server registra la chiave in `sync.mutation_log` (o tabella idempotenza del
  command) con UNIQUE.
- **Prima esecuzione**: applica, salva risultato, ritorna 201.
- **Reinvio stessa chiave**: ritorna il **risultato memorizzato** (stesso output),
  nessun doppio effetto → `result='duplicate'`.
- **Chiave riusata con payload diverso**: 409 `IDEMPOTENCY_MISMATCH`.

## 3. Interazione con concorrenza
- L'idempotenza NON sostituisce il lock: `reserve_material` usa **sia** idempotency
  (dedup reinvii) **sia** lock transazionale (dedup concorrenza reale).

## 4. Scadenza
- Le chiavi hanno TTL (es. 24–72h) per pulizia; oltre il TTL una chiave riusata è
  trattata come nuova (documentato al client).

## 5. Eventi
- Anche i domain event usano `idempotency_key`/`aggregate_version` per consegna
  at-least-once idempotente (vedi domain-boundaries §5).
