# 4F — Concurrency: prenotazioni inventario (stub, non eseguiti)
Scenario: stock=1, due client chiamano reserve_material(qty=1) in parallelo.
Attesi:
- Esattamente UNA reservation valida; l'altra → INSUFFICIENT_STOCK (422).
- Nessun overselling (available mai < 0).
- Retry con stessa Idempotency-Key → risultato memorizzato (no doppio effetto).
- Risultato deterministico su N ripetizioni.
Harness: N worker paralleli via Edge; verifica invarianti su inv_movement/reservation.
