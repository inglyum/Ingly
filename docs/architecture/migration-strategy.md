# INGLY OS V2 — Migration Strategy (incrementale e reversibile)

> Fase 2 · solo design. **Nessuna migrazione eseguita.** Nessuna modifica a
> codice/DB. v96 resta la produzione. Ogni fase ha un **rollback** definito.

## Principi di migrazione
- **Strangler pattern**: il backend affianca il monolite; i moduli migrano uno
  alla volta; il monolite resta funzionante finché il sostituto non è verificato.
- **Reversibilità**: ogni fase è attivabile/disattivabile via **feature flag**
  (default OFF) e ha un piano di rollback.
- **Nessuna migrazione dati distruttiva**; nessuna scrittura server sui dati reali
  finché la fase di write-sync non è approvata e testata.
- **Rete di sicurezza**: test E2E (Playwright, già disponibile) sui flussi critici
  **prima** di ogni estrazione di logica.

## Fasi

### Fase A — Backend foundation (nessun impatto sul client)
- Provisioning Postgres/Supabase (progetto già esistente per auth).
- Schema **`database-v2`** (solo DDL in ambiente **staging**, non produzione):
  tenant, membership, ruoli/permessi, entità core, `domain_events`, `audit_log`.
- **RLS** attiva su tutte le tabelle. Seed di test (dati fittizi).
- Client invariato (v96 continua su IndexedDB).
- **Rollback**: eliminare il progetto staging; zero effetti sul client.

### Fase B — Auth/RBAC
- Estendere Supabase Auth (già usato) con `membership` + ruoli.
- Il gate SaaS del monolite legge i ruoli dal backend (feature flag).
- **Rollback**: flag OFF → torna al gate localStorage attuale.

### Fase C — Read synchronization (sola lettura)
- Un **read-adapter** nel client legge dal backend e **popola la cache IndexedDB**
  per 1–2 moduli pilota (es. Catalogo, Clienti), in **sola lettura**.
- I dati reali restano su IndexedDB; il backend è "mirror" popolato da import
  controllato (non dai dati di produzione dell'utente finché non approvato).
- **Rollback**: flag OFF → il modulo torna a leggere solo da IndexedDB.

### Fase D — Write synchronization (outbox)
- Le mutazioni dei moduli pilota passano da un **outbox**: scrivono in IndexedDB
  **e** inviano al backend; riconciliazione con `updated_at`/versione.
- Prima su **1 modulo**, con doppia scrittura verificata (shadow), poi il backend
  diventa autorità per quel modulo.
- **Rollback**: disattivare l'invio; l'outbox resta locale; nessuna perdita dati.

### Fase E — Domain service extraction
- Estrarre la logica business dai template del monolite in **servizi di dominio**
  (Pricing, Inventory, Production…), consumati sia dal nuovo frontend sia (via
  shim) dal monolite durante la transizione.
- **Rollback**: mantenere la vecchia funzione dietro flag finché il servizio non è
  validato dai test.

### Fase F — Module migration (uno alla volta)
Ordine consigliato (dipendenze): **Auth/RBAC → Catalog → CRM → Sales
(quote/order) → Inventory → Production/MES → Machines → Finance → Design Studio →
Automation → AI**. Ogni modulo: backend + API + UI nuova + test E2E, con flag.
- **Rollback per modulo**: flag OFF → il modulo legacy del monolite resta attivo.

### Fase G — Legacy retirement
- Solo quando **tutti** i moduli critici sono migrati e verificati: il monolite
  passa a "client offline/cache" o viene dismesso come app primaria.
- IndexedDB resta come **cache/offline** (non si rimuove).
- **Rollback**: riattivare il monolite come primario (resta in git: v96 mai
  cancellata).

## Migrazione dati (quando approvata, non ora)
- **Export** controllato dai dati IndexedDB attuali → **mapping** allo schema v2 →
  import in **staging** → validazione → solo dopo, promozione.
- Ogni step con **backup pre-operazione** e **rollback** (Regole 4–5).
- Nessuna migrazione automatica/distruttiva; dry-run obbligatorio.

## Feature flags & sicurezza del rollout
- Flag per fase/modulo (default OFF), attivabili per tenant.
- Canary su un tenant pilota (Ingly Design) prima del rilascio ampio.
- Test E2E verdi come **gate** obbligatorio prima di ogni promozione.

## Matrice rischi/rollback (sintesi)
| Fase | Rischio principale | Mitigazione | Rollback |
|--|--|--|--|
| A | Nessuno sul client | Staging isolato | Elimina staging |
| B | Login errato | Flag + fallback gate locale | Flag OFF |
| C | Cache incoerente | Read-only, versioni | Flag OFF |
| D | Conflitti scrittura | Shadow write + policy conflitti | Stop invio, outbox locale |
| E | Regressione logica | Test E2E + shim dietro flag | Riattiva funzione legacy |
| F | Rottura modulo | Migrazione 1 modulo/volta + flag | Flag OFF sul modulo |
| G | Perdita offline | IDB mantenuto come cache | Riattiva monolite |

## Cosa NON si fa in questa fase
Nessun DDL in produzione, nessuna migrazione dati, nessuna modifica al frontend
o al monolite, nessuna skill creata. Questo documento è **solo il piano**.
