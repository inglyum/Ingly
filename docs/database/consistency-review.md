# INGLY OS V2 — Consistency Review (Fase 3.6)

> Prova che i documenti di design **concordano** tra loro dopo le correzioni.
> Solo documentazione. Nessun SQL/migrazione. v96 intatta.

## Metodo
Per ogni tema critico si verifica che tutti i documenti coinvolti riportino la
**stessa** regola (o vi rimandino), senza contraddizioni. "Autorità" = documento
che detta la regola; gli altri devono concordare.

| Tema | Autorità | Documenti che devono concordare | Esito |
|--|--|--|--|
| Tabelle/entità (lista, merge, rimozioni) | database-v2 §9 | schema-map §5, ERD §5, DATABASE-REVIEW §1 | ✔ concordi (utilization→MV; qc merge; automation.condition→JSONB; +sync.mutation_log) |
| Relazioni/FK | schema-map §3 | ERD, database-v2 | ✔ concordi (WO→design_version, WO→operation material) |
| RLS (claim, DEFINER, no ricorsione) | rls §9.1 | database-v2 §9.9, DATABASE-REVIEW §3 | ✔ concordi (JWT claim, search_path='') |
| Tenant boundary (tabelle+Storage+MV+Edge) | rls §9.1–9.3 | database-v2 §9.10–9.11, schema-map §1 | ✔ concordi (path per-tenant, signed URL, MV per-tenant) |
| Eventi (aggregate_version, outbox, ordering) | database-v2 §9.5 | domain-boundaries §5, ERD §5, indexing §7.1 | ✔ concordi (UNIQUE per aggregato) |
| Sync offline (command per dominio) | offline-sync §10 | DATABASE-REVIEW §10, database-v2 (HR-6) | ✔ concordi (inventory/order/finance = command) |
| Inventario (movimenti verità, lock, balance cache) | database-v2 §9.1 | schema-map §4, indexing §7, offline-sync §10 | ✔ concordi (available=on_hand−reserved+incoming; reserve con lock) |
| Snapshot finanziari (colonne su item) | database-v2 §9.2–9.3 | v96-mapping §7, DATABASE-REVIEW §5 | ✔ concordi (unit_price/discount/vat_rate/cost/line_total; currency/periodo) |
| Immutabilità design→produzione | database-v2 §9.4 | ERD §5, schema-map §5, v96-mapping §7 | ✔ concordi (FK a version, lock post IN_PROGRESS) |
| Analytics isolation | rls §9.3 | database-v2 §9.6/§9.11, indexing §7.3 | ✔ concordi (MV per-tenant; utilization derivata) |

## Verifiche puntuali di non-contraddizione
- **machine_utilization**: database-v2 §9.6, schema-map §5, ERD §5, indexing §7.3,
  DATABASE-REVIEW (HR-7 FIXED) → tutti dicono "**non OLTP → MV per-tenant**". Coerente.
  (Nota: la §3.8 e le sezioni §1–§4 originali che la elencavano come OLTP sono
  **superate** dagli addendum §9/§5/§7, esplicitamente marcati "VINCOLANTE".)
- **qc_rework/qc_scrap**: database-v2 §9.7, schema-map §5, ERD §5 → "**fusi in
  qc_non_conformance.type**". Coerente. La lista §3.9 originale è superata.
- **automation.condition**: database-v2 §9.8, schema-map §5, ERD §5 → "**JSONB in
  automation**". Coerente. La riga §3.13 originale è superata.
- **work_order ↔ design**: database-v2 §9.4, ERD §5, schema-map §5 → "**FK a
  design_version, immutabile**". Coerente.
- **RLS performance**: rls §9.1 e DATABASE-REVIEW §3 → "**claim JWT, no funzione
  per-riga**". Le §2/§3 originali di rls (che usavano `has_permission` per riga)
  sono **superate** dall'addendum §9.1.

## Regola di precedenza (per evitare ambiguità)
In ogni documento gli **Addendum Fase 3.6** (sezioni marcate "VINCOLANTE")
**prevalgono** sul testo delle sezioni precedenti dove divergono. I testi originali
restano come contesto/motivazione, non come specifica attiva.

## Conclusione
Nessuna contraddizione residua tra i documenti dopo le correzioni. I nove HR sono
recepiti in modo coerente e mutuamente referenziato.

---

## Addendum Fase 4 — foundation SQL vs documenti
| Tema | SQL (0001/0002) | Documenti | Esito |
|--|--|--|--|
| RLS su tutte le public | enable + policy su 7 tabelle | rls §10 | ✔ |
| claim via auth.jwt() | current_tenant_ids() | rls §9.1/§10, authentication §8 | ✔ |
| role_perm_cache | creata in 0002 | rls §9.1/§10 | ✔ (non più reference irrisolta) |
| audit immutabile | revoke update/delete | rls §10, database-v2 §6 | ✔ |
| credential protetta | RLS+revoke | rls §10 | ✔ |
| aggregate_version>0 | CHECK | database-v2 §9.5 | ✔ |
| FK auth.users | profile/membership/user_role | (scelta confermata) | ✔ |
| indici foundation | 8 indici | indexing §7 | ✔ |
| rollback | 0001_..._down.sql | staging-migration-policy §5 | ✔ |
