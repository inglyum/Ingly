# INGLY OS V2 — Pagination, Filtering, Sorting

> Fase 4A · documentazione.

## 1. Paginazione (cursor-based)
- Default `limit=50`, max `limit=200`.
- Cursore stabile su `(created_at, id)` (o `(updated_at, id)` per liste "recenti").
- Risposta: `{ data: [...], next_cursor: "…", has_more: true }`.
- Vietato OFFSET profondo su tabelle grandi (costoso).

## 2. Filtri
- Whitelist di campi filtrabili **per tabella** (no filtri arbitrari su colonne non
  indicizzate).
- Operatori consentiti: `eq, in, gte, lte, like(trgm)`; range date su colonne indicizzate.
- Ricerca testuale: trgm su nomi/codici, full-text su descrizioni (vedi indexing).

## 3. Ordinamento
- Whitelist di campi ordinabili (indicizzati). Default per lista (es. ordini →
  `created_at desc`).

## 4. Coerenza con RLS
- Tutti i filtri operano **dentro** il confine RLS: nessun filtro può esporre altri
  tenant. Le liste sono già ristrette al/ai tenant dell'utente.

## 5. Performance
- Ogni combinazione filtro+sort "calda" deve avere un indice di supporto
  (vedi `indexing-strategy.md`).
