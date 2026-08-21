# INGLY OS V2 — Supabase CLI Setup Report (Fase 4.3)

> Preparazione locale del tooling. **Nessuna connessione remota tentata, nessun
> link, nessun SQL, produzione e V96 intatte.** Data: 2026-08-21.

## Ambiente
| Elemento | Valore |
|--|--|
| Node.js | **v22.22.2** (≥ 20 ✓) |
| npm | **10.9.7** |
| Supabase CLI | **2.115.0** (installata ora) |
| CLI installata in questa sessione? | **Sì** — `npm install supabase --save-dev` (dev dependency, canale ufficiale npm; nessun `curl\|bash`) |
| `supabase/config.toml` creato? | **Sì** — `npx supabase init` (solo config locale) |
| `project_id` in config.toml | `"Ingly"` (default dal nome cartella — **NON** un ref remoto) |
| Progetto linkato? | **No** — nessun `supabase/.temp/project-ref` |
| Staging project ref | **MANCANTE** (non fornito; non indovinato) |
| Connessione remota tentata? | **No** (nessun `link`/`db push`/`db reset`/`migration up`) |
| Docker / Supabase locale avviato? | **No** |

## Azioni eseguite (sicure, locali)
1. Verifica Node/npm (≥20 ✓).
2. `npm install supabase --save-dev` → CLI 2.115.0 (in `node_modules`, ignorato da git).
3. `npx supabase init` → creato `supabase/config.toml` (nessun avvio locale, nessun Docker).
4. `.gitignore`: `node_modules/` già ignorato (nessun artefatto pesante committato).

## Protezione produzione / credenziali
- Nessun uso del ref di produzione (`dhfuokioyuytbxxgoilp`).
- Nessuna credenziale inserita in repo/HTML/doc; nessun `.env` committato.
- Nessun link o comando remoto eseguito.

## Cosa manca per il link staging (STEP 4 — fermo, come da regola)
1. **STAGING PROJECT REF** di "INGLY OS V2 STAGING" (≠ `dhfuokioyuytbxxgoilp`).
2. **`SUPABASE_ACCESS_TOKEN`** (Personal Access Token) come **env/secret locale**,
   non in chat/repo.
3. **Accesso di rete** a `supabase.com`/`api.supabase.com` dall'ambiente che esegue
   il link (⚠️ in **questa** sessione l'egress verso Supabase non è in allowlist:
   il `supabase link` potrebbe non funzionare da qui e andrà eseguito da una
   macchina/CI con rete verso Supabase).

## Prossima azione (dopo tua conferma)
Con ref + token disponibili e rete verso Supabase:
```
export SUPABASE_ACCESS_TOKEN=<token>      # secret, non in repo
npx supabase link --project-ref <STAGING_REF>
npx supabase projects list                # verifica che il linkato sia lo staging
```
Poi **dry run** delle migrazioni (Fase 4.4) — nessun apply senza tua approvazione.

---

# SUPABASE CLI STATUS: READY FOR STAGING LINK
Tooling pronto (CLI 2.115.0 + config.toml). Il link **non** è stato eseguito:
manca il **project ref di staging** (da fornire) e serve rete verso Supabase.
Nessuna connessione remota, nessun SQL, produzione e V96 intatte.
