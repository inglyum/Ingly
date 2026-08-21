# INGLY OS V2 — App (staging) · come eseguirla in locale

> Vertical slice V2: auth entry · app shell · navigazione tenant-aware · contesto
> profilo/ruolo · dashboard base. **Solo staging.** Nessun segreto nel repo.
> V96 resta la produzione/fallback e **non** viene toccato.

## Prerequisiti
- Progetto **INGLY OS V2 STAGING** (ref `uepyexyosyogyvzorata`) con foundation +
  RBAC seed già applicati (fatto).
- La **publishable/anon key** dello staging (browser-safe). La trovi in
  Supabase → Project Settings → API → `anon public`. **NON** usare la service-role.

## Configurazione (env, mai segreti nel repo)
1. Copia il template:
   ```bash
   cp app-v2/env.example.js app-v2/env.js
   ```
2. In `app-v2/env.js` incolla `SUPABASE_URL` (staging) e `SUPABASE_ANON_KEY`
   (publishable/anon). `env.js` è **git-ignored**.
   > In alternativa, in CI genera `app-v2/env.js` dalle variabili d'ambiente
   > `SUPABASE_URL` / `SUPABASE_ANON_KEY` (mai committarlo).

## Esecuzione locale
Serve un server statico (i moduli ES non funzionano da `file://`):
```bash
npx serve app-v2            # oppure: python3 -m http.server -d app-v2 8080
```
Apri l'URL indicato. Comportamento:
- **Senza `env.js`** → schermata "Configurazione staging richiesta" (nessun crash).
- **Con `env.js`** ma senza sessione → **auth entry** (magic link via email).
- **Con sessione** → **shell**: selettore tenant, nav tenant-aware, badge ruolo,
  dashboard con contesto (tenant/ruolo/utente dai claim JWT).

## Sicurezza
- Solo chiave **publishable/anon** nel client; una eventuale service-role key
  viene **bloccata** da `assertBrowserSafe()`.
- Nessun dato di business reale: la slice mostra solo auth/shell/contesto.
- Ambiente **staging** (ref `uepyexyosyogyvzorata`); **mai** la produzione
  (`dhfuokioyuytbxxgoilp`).

## Struttura
```
app-v2/
  index.html          shell + boot
  env.example.js      template config (copia in env.js, git-ignored)
  vendor/supabase.js  supabase-js vendored (CSP-safe)
  src/
    config.js         config da env + guardia browser-safe
    supabase.js       client (inietta mock nei test)
    context.js        claim JWT → tenant/ruolo/profilo
    app.js            render config-required / auth / shell / dashboard
    styles.css        stile shell (token brand)
```

## Nota onesta
La connessione **live** a staging (login reale, sessione, RLS runtime) richiede la
anon key + rete verso Supabase e va provata in un ambiente con accesso a internet
verso `*.supabase.co` (non disponibile nella sessione di sviluppo dell'agente). Il
codice e la logica sono testati offline (vedi `tests/app_v2_shell.test.mjs`).
