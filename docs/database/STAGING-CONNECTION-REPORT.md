# INGLY OS V2 — Staging Connection Report (Fase 4.2)

> Verifiche di sicurezza pre-connessione. **Nessun SQL eseguito, nessuna
> migrazione applicata, nessun link creato, produzione mai toccata.**
> Data: 2026-08-21.

## CLI status
- **Supabase CLI: ASSENTE** (`command -v supabase` → non trovato).
- Per la regola di TASK 1, in assenza della CLI **mi fermo** e non installo alcun
  installer sconosciuto.

## Configurazione Supabase rilevata
| Elemento | Valore |
|--|--|
| `supabase/config.toml` | assente |
| Progetto linkato (`supabase/.temp/project-ref`) | **nessuno** |
| Project ref di staging configurato | **nessuno** |
| Project URL di staging | **nessuno** |
| Env var (`SUPABASE_*`, `*STAGING*`) | **nessuna** |
| Unico ref presente nel repo | `dhfuokioyuytbxxgoilp` = **PRODUZIONE** (in un commento di `supabase/functions/stripe-webhook/index.ts`, non un link attivo) |

## Environment verification
- Target **"INGLY OS V2 STAGING"**: **NON verificabile**. Non esiste alcun riferimento
  al progetto di staging (né ref, né URL, né credenziali) in questo ambiente.
- L'unico progetto identificabile è la **produzione**, che **non deve essere toccata**.
- Regola critica: *"If the target project cannot be positively verified as INGLY OS
  V2 STAGING, STOP."* → **STOP**.

## Linked status
- **Non linkato.** Nessun link creato (CLI assente + nessun ref di staging).

## Dry-run result
- **Non eseguibile.** Senza CLI e senza progetto verificato non è possibile alcun
  `supabase db … --dry-run`. La review **statica offline** dell'SQL è già stata
  fatta (`STAGING-FOUNDATION-SQL-REVIEW-V2.md` → READY FOR STAGING).

## Migration files rilevati
- `supabase/migrations/staging/0001_foundation_slice.sql`
- `supabase/migrations/staging/0001_foundation_slice_down.sql`
- `supabase/migrations/staging/0002_rbac_seed.sql`
(Non applicati.)

## Blockers
1. **Supabase CLI non installata** in questo ambiente.
2. **Nessun project-ref di staging** fornito/configurato (non posso identificare
   "INGLY OS V2 STAGING").
3. **Credenziali staging non presenti** (né devono essere incollate in chat/repo;
   vanno come env/secret locali).
4. Egress verso `supabase.com` non incluso nell'allowlist di rete di questo
   ambiente → anche con CLI il linking potrebbe non essere possibile da qui.

## Next action (per sbloccare, lato utente)
Per procedere in sicurezza servono, in un ambiente con rete verso Supabase:
1. **Installare la Supabase CLI** (canale ufficiale) — non lo faccio io da installer opaco.
2. Fornire il **project ref dello staging** (es. `abcd…`, diverso da
   `dhfuokioyuytbxxgoilp`) e confermare che corrisponde a "INGLY OS V2 STAGING".
3. Rendere disponibili le credenziali staging come **env/secret locali** (mai in
   repo/HTML/chat): `SUPABASE_ACCESS_TOKEN`, DB password per il link/push.
4. Poi: `supabase link --project-ref <STAGING_REF>` → verifica del ref linkato →
   **dry run** delle migrazioni → (solo dopo tua approvazione) apply.

## Production protection
- Nessun link/migrazione/reset verso produzione. Il ref di produzione è solo in un
  commento documentale e **non** è stato usato.

---

# STAGING CONNECTION STATUS: BLOCKED
CLI assente + progetto di staging non verificabile. Nessuna operazione eseguita.
In attesa: CLI installata + project ref staging + credenziali come secret.

---

## Aggiornamento Fase 4.4 — tentativo di link staging
- CLI: 2.115.0 ✓ · nessun link preesistente (nessun tocco a produzione).
- Staging ref fornito: `uepyexyosyogyvzorata` (≠ produzione `dhfuokioyuytbxxgoilp`).
- Comando eseguito: `npx supabase link --project-ref uepyexyosyogyvzorata`.
- **Esito: FALLITO — `LegacyPlatformAuthRequiredError`** (access token assente).
  `SUPABASE_ACCESS_TOKEN` non presente in env; `supabase login` è interattivo
  (browser) → non eseguibile in questa sessione. Egress verso Supabase comunque
  non in allowlist qui.
- **Link NON avvenuto** (nessun `supabase/.temp/project-ref`). Nessun dry-run,
  nessuna migrazione, produzione e V96 intatte.

### Per completare il link (serve uno di questi)
1. `SUPABASE_ACCESS_TOKEN` come **secret/env locale** (Personal Access Token da
   supabase.com → Account → Access Tokens), **mai** in repo/chat, **in un ambiente
   con rete verso Supabase**. Poi `npx supabase link --project-ref uepyexyosyogyvzorata`.
2. In alternativa eseguire link + `db push --dry-run` da una **macchina/CI** con
   accesso a Supabase (i file migrazione sono già pronti nel repo).

---

## Aggiornamento Fase 4.5 — token non visibile alla shell del tool
- `SUPABASE_ACCESS_TOKEN` **non presente** nell'ambiente dei comandi eseguiti da
  questa sessione (ogni comando parte da una shell nuova dal profilo; una variabile
  esportata nel terminale interattivo dell'utente **non** si propaga qui). Verificato
  senza mai stamparne il valore.
- Nessun file di profilo/`.env` contiene il nome della variabile.
- Conseguenza: `supabase link` non eseguibile da qui → **STOP**. Nessun link,
  nessun dry-run, produzione e V96 intatte.

### Come rendere il token disponibile a QUESTA sessione (una delle due)
1. Persistere il token in un profilo letto dalla shell non interattiva, es.
   `~/.profile` o `~/.bashrc`: `export SUPABASE_ACCESS_TOKEN=…` (attenzione: finisce
   in un file locale della sandbox; accettabile solo in ambiente effimero/staging,
   mai committato). Poi ri-eseguire link + `db push --dry-run`.
2. **Consigliato**: eseguire link + `db push --dry-run` da una **macchina/CI** con
   `SUPABASE_ACCESS_TOKEN` in env e rete verso Supabase (i file migrazione sono già
   nel repo). Comandi: `npx supabase link --project-ref uepyexyosyogyvzorata` →
   `npx supabase db push --dry-run`.
