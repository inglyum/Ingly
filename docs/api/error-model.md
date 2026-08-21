# INGLY OS V2 — API Error Model

> Fase 4A · documentazione. Formato uniforme degli errori per PostgREST ed Edge.

## 1. Formato risposta errore
```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Stock non sufficiente",
  "details": { "material_id": "…", "requested": 10, "available": 3 },
  "correlation_id": "…", "retriable": false } }
```
- `code`: enum stabile (machine-readable). `message`: leggibile (i18n lato client).
- `details`: contesto strutturato. `correlation_id`: per tracing/log.
- `retriable`: se il client può ritentare (con stessa Idempotency-Key).

## 2. Mappatura HTTP
| HTTP | Uso |
|--|--|
| 200/201 | ok |
| 400 | VALIDATION_ERROR (input non valido) |
| 401 | UNAUTHENTICATED (token assente/scaduto) |
| 403 | FORBIDDEN (RLS/ruolo) |
| 404 | NOT_FOUND (o nascosto da RLS) |
| 409 | CONFLICT (versione/idempotenza/stato) |
| 422 | DOMAIN_RULE (es. INSUFFICIENT_STOCK, INVALID_TRANSITION) |
| 429 | RATE_LIMITED |
| 500 | INTERNAL |
| 503 | UNAVAILABLE (retriable) |

## 3. Codici di dominio (estratto)
`VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT_VERSION,
IDEMPOTENCY_MISMATCH, INSUFFICIENT_STOCK, INVALID_STATE_TRANSITION,
DESIGN_VERSION_LOCKED, RESERVATION_EXPIRED, PAYMENT_ALREADY_RECORDED,
APPROVAL_REQUIRED, RATE_LIMITED, INTERNAL, UNAVAILABLE`.

## 4. Regole
- Nessun errore espone dettagli interni (stack, SQL). Log completo server-side con
  `correlation_id`.
- 404 vs 403: per evitare enumeration, risorse fuori tenant → 404.
- Gli errori dei command sono **deterministici** e non lasciano stato parziale
  (transazione).
