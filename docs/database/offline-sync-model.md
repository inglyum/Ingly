# INGLY OS V2 — Offline Sync / Outbox Model

> Fase 3 · solo documentazione. Strutture **server-side** a supporto della sync
> offline. Nessuna implementazione, nessun SQL eseguito. IndexedDB **resta** lato
> client come cache + coda (Regola 12).

## 1. Obiettivo
Permettere: `IndexedDB → outbox client → sync → transazione server → domain event
→ conferma`, con idempotenza, versioni, rilevamento conflitti e stato di sync,
senza perdere né duplicare dati.

## 2. Lato client (IndexedDB) — concettuale
- **`local_outbox`**: mutazioni in attesa. Campi: `client_mutation_id (uuid)`,
  `entity`, `op[create/update/delete]`, `payload`, `base_version`, `created_at`,
  `status[pending/sent/acked/failed]`, `attempts`, `last_error`.
- **`local_cache`**: copie di lettura con `server_version`/`updated_at`.
- La UI scrive **sempre** nell'outbox (ottimistica) e in cache; il sync engine
  invia quando online.

## 3. Lato server — campi standard su tabelle sincronizzabili
Ogni tabella "sincronizzabile" espone:
- **`id uuid`** (deciso dal client per create → idempotenza naturale).
- **`version bigint`** (o `revision`) incrementato ad ogni update (trigger).
- **`updated_at timestamptz`**.
- **`origin_client_id`** / **`last_mutation_id`** (traccia l'ultima mutazione
  applicata, per de-dup).

## 4. Registro mutazioni server
`sync.mutation_log` (schema interno):
`id · tenant_id · user_id · client_mutation_id (UNIQUE) · idempotency_key (UNIQUE)
· entity · entity_id · op · applied_at · result[applied/duplicate/conflict/rejected]
· error`.

- **Idempotenza**: `client_mutation_id`/`idempotency_key` UNIQUE → un reinvio dà
  `duplicate` senza doppio effetto.
- **Ordine**: le mutazioni si applicano per entità in ordine di dipendenza; la
  Edge Function valida e applica in **transazione**, emettendo il **domain event**
  nello stesso commit (outbox).

## 5. Rilevamento e risoluzione conflitti
- **Optimistic concurrency**: la mutazione porta `base_version`; se
  `entity.version != base_version` → **conflitto**.
- **Policy per entità** (dichiarativa):
  - Documenti critici (ordini, movimenti, pagamenti): **server-wins**; il client
    riceve lo stato aggiornato e rigioca eventuali campi non conflittuali.
  - Bozze/preferenze/design non ancora inviati: **client-wins**.
  - Merge campo-a-campo dove sicuro (es. note, tag).
- I conflitti non risolvibili automaticamente → stato `conflict` mostrato all'utente
  con diff, per decisione manuale.

## 6. Ciclo di sync (sequenza)
```
1. client: raccoglie local_outbox(status=pending)
2. client → Edge /sync: batch mutazioni + idempotency keys + base_version
3. server: per ogni mutazione
     - dedup via mutation_log
     - check version → applied | conflict
     - applica in TX + scrive domain_event (outbox) + audit
     - registra mutation_log
4. server → client: risultati (applied/duplicate/conflict) + nuove versioni
5. client: aggiorna cache, marca outbox acked/failed/conflict
6. client: pull incrementale (updated_at > last_sync) per aggiornare la cache
```

## 7. Stato ed errori
- Stati mutazione: `pending → sent → acked | failed | conflict`.
- **Retry**: backoff esponenziale lato client; oltre soglia → `failed` visibile.
- **Error state**: messaggi normalizzati; nessuna perdita (l'outbox trattiene
  finché non `acked`).

## 8. Sicurezza
- La sync passa da Edge Function con **RLS** (l'utente scrive solo nei suoi
  tenant); `service-role` mai sul client.
- `mutation_log` in schema interno non esposto.

## 9. Cosa NON è incluso ora
Nessuna implementazione, nessuna tabella creata: è il **modello**. L'ordine di
adozione è definito in `migration-strategy.md` (Fasi C read-sync, D write-sync).
