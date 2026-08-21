# 4G — Event/outbox tests (stub, non eseguiti)
Verifiche:
- domain_event creato ATOMICAMENTE con l'operazione (stessa TX): se la TX fallisce,
  nessun evento.
- Consegna duplicata sicura (idempotency_key → consumer idempotente).
- Ordering per aggregato preservato (aggregate_version crescente).
- Retry su fallimento consumer; dopo N tentativi → events.dlq.
- Un fallimento di processing NON corrompe la transazione sorgente.
Criterio: atomicità, idempotenza, ordering, retry, isolamento errori.
