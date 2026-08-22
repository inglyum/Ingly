# PHASE 14C — Provisioning utenti di test RBAC (STAGING)

Prepara i 5 utenti necessari a **PHASE 14B — Live RBAC Security Validation**
(`tests/live_rbac_staging.mjs`) su **SOLO staging** `uepyexyosyogyvzorata`.

> REGOLE ASSOLUTE
> - NON toccare PRODUCTION (`dhfuokioyuytbxxgoilp`) né V96.
> - NESSUNA password / service-role key / token nel repo o nei log.
> - NON modificare migration/schema. NON creare un secondo RBAC.
> - Assegnazione ruoli **solo server-side** (SQL editor Dashboard o script con
>   service-role in env). Mai dal client browser/anon.

---

## TASK 1 — Schema reale (audit, nessuna colonna inventata)

Dalle migrazioni `0001_foundation_slice`, `0002_rbac_seed`, `0004_staging_bootstrap`,
`0006_crm_server_rbac`:

| Tabella | Colonne rilevanti | Vincoli |
|---|---|---|
| `public.tenant` | `id uuid pk`, `name`, `slug unique`, `plan`, `status` | tenant di test: `slug = 'ingly-staging'` (creato in 0004) |
| `public.profile` | `id uuid pk → auth.users(id)`, `full_name`, `locale` | 1:1 con l'utente auth |
| `public.tenant_membership` | `tenant_id → tenant`, `user_id → auth.users`, `status` | **unique (tenant_id, user_id)**; `status='active'` |
| `public.role` | `id uuid pk`, `key unique`, `name`, `level` | keys già seminate in 0002: OWNER/ADMIN/MANAGER/SALES/VIEWER (+ altri) |
| `public.user_role` | `tenant_id`, `user_id`, `role_id → role` | **pk (tenant_id, user_id)** → **un solo ruolo per utente per tenant** |
| `public.permission` | `resource`, `action` | unique (resource, action) |
| `public.role_permission` | `role_id`, `permission_id` | pk (role_id, permission_id); derivata in 0006 per `crm.*` |
| `security.role_perm_cache` | `role_key`, `resource`, `action` | letta da `has_permission()` |

Associazione utente→ruolo usata dal server:
- `current_tenant_ids()` (0005) → tenant dalle righe `tenant_membership` di `auth.uid()`.
- `current_user_role(tenant)` (0006) → `role.key` da `user_role ⋈ role` per `auth.uid()` in quel tenant (fallback quando manca il claim JWT — caso staging).
- `has_permission(tenant,res,act)` → `security.role_perm_cache` per quel `role_key`.

Conseguenza: **basta** creare l'utente auth + `tenant_membership(active)` +
`user_role(role_id)` nel tenant `ingly-staging`. Nessuna modifica a ruoli/permessi.

Poiché `user_role` ammette **un ruolo per utente/tenant**, servono **5 utenti
distinti**, uno per ruolo.

---

## TASK 4 — Naming (indirizzi chiaramente di test)

| Ruolo | Email |
|---|---|
| OWNER | `ingly-rbac-owner@staging.ingly.test` |
| ADMIN | `ingly-rbac-admin@staging.ingly.test` |
| MANAGER | `ingly-rbac-manager@staging.ingly.test` |
| SALES | `ingly-rbac-sales@staging.ingly.test` |
| VIEWER | `ingly-rbac-viewer@staging.ingly.test` |

> Non usare account reali. **Non toccare** l'utente reale `mrgiuseppe.inglima@gmail.com`
> (resta OWNER via 0004): gli utenti di test sono separati e dedicati.
> Nota: se il progetto impone la conferma email, usa un dominio che puoi
> confermare oppure abilita *Auto Confirm* alla creazione (vedi sotto).

---

## Procedura A — Supabase Dashboard (consigliata, tutta server-side)

### A.1 Creare i 5 utenti Auth
Dashboard → **Authentication → Users → Add user**, per ciascuna email sopra:
- imposta una password robusta (scelta da te, **non** salvata nel repo);
- attiva **Auto Confirm User** (evita il giro email in staging).

Le password le userai solo come variabili d'ambiente in PHASE 14B (TASK 7).

### A.2 Collegare membership + ruolo (SQL editor = service-role)
Dashboard → **SQL Editor** → esegui lo snippet **idempotente** qui sotto. Non
contiene password; risolve gli utenti per email e li lega al tenant `ingly-staging`
con il ruolo corretto. È rieseguibile senza duplicare nulla.

```sql
-- PHASE 14C — wiring membership+ruolo per gli utenti di test (STAGING).
-- Idempotente. Nessun segreto. Esegui nel SQL editor (service-role) di staging.
do $$
declare
  v_tid uuid;
  m record;
begin
  select id into v_tid from public.tenant where slug = 'ingly-staging' limit 1;
  if v_tid is null then
    raise exception 'tenant ingly-staging assente: applica prima 0004_staging_bootstrap';
  end if;

  for m in
    select * from (values
      ('ingly-rbac-owner@staging.ingly.test',   'OWNER'),
      ('ingly-rbac-admin@staging.ingly.test',   'ADMIN'),
      ('ingly-rbac-manager@staging.ingly.test', 'MANAGER'),
      ('ingly-rbac-sales@staging.ingly.test',   'SALES'),
      ('ingly-rbac-viewer@staging.ingly.test',  'VIEWER')
    ) as t(email, role_key)
  loop
    declare
      v_uid uuid;
      v_rid uuid;
    begin
      select id into v_uid from auth.users where email = m.email limit 1;
      if v_uid is null then
        raise notice 'utente auth mancante (crealo in A.1): %', m.email;
        continue;
      end if;
      select id into v_rid from public.role where key = m.role_key limit 1;

      insert into public.profile (id, full_name, locale)
        values (v_uid, m.role_key || ' Test', 'it')
        on conflict (id) do nothing;

      insert into public.tenant_membership (tenant_id, user_id, status)
        values (v_tid, v_uid, 'active')
        on conflict (tenant_id, user_id) do update set status = 'active';

      insert into public.user_role (tenant_id, user_id, role_id)
        values (v_tid, v_uid, v_rid)
        on conflict (tenant_id, user_id) do update set role_id = excluded.role_id;

      raise notice 'ok % → % (tenant %)', m.email, m.role_key, v_tid;
    end;
  end loop;
end $$;
```

### A.3 Verifica (facoltativa, sempre in SQL editor)
```sql
select u.email, r.key as role, tm.status
from auth.users u
join public.tenant_membership tm on tm.user_id = u.id
join public.tenant t on t.id = tm.tenant_id and t.slug = 'ingly-staging'
join public.user_role ur on ur.user_id = u.id and ur.tenant_id = t.id
join public.role r on r.id = ur.role_id
where u.email like 'ingly-rbac-%@staging.ingly.test'
order by r.level;
```
Attesi 5 utenti, ruoli OWNER/ADMIN/MANAGER/SALES/VIEWER, `status = active`.

---

## Procedura B — Script opzionale (`scripts/provision-rbac-test-users.mjs`)

Automatizza A.1 (Admin API) + A.2 (PostgREST con service-role). Requisiti di
sicurezza rispettati: legge tutto da env, non salva/stampa password, rifiuta ogni
ref diverso da staging, nessun segreto hardcoded. Uso:

```powershell
# PowerShell — variabili SOLO nella sessione, mai nel repo
$env:EXPECTED_PROJECT_REF   = "uepyexyosyogyvzorata"
$env:SUPABASE_URL           = "https://uepyexyosyogyvzorata.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role key di STAGING>"   # solo in env, server-side
# password scelte da te, solo in env:
$env:RBAC_OWNER_PASSWORD   = "<...>"
$env:RBAC_ADMIN_PASSWORD   = "<...>"
$env:RBAC_MANAGER_PASSWORD = "<...>"
$env:RBAC_SALES_PASSWORD   = "<...>"
$env:RBAC_VIEWER_PASSWORD  = "<...>"
node scripts/provision-rbac-test-users.mjs
```
Lo script è idempotente (crea se assente, non tocca password esistenti), fa il
**read-back di verifica** (membership `active` + `user_role→role.key`) e stampa
il report `PHASE 14C PROVISIONING`. Non stampa mai password/chiavi. La
service-role key **non** va nel repo: solo in questa sessione.

### Comando unico guidato (PowerShell) — provisioning + verifica
Incolla questo blocco, sostituisci solo i placeholder `INSERISCI_...` con i
valori reali (le password le scegli tu, una volta, e restano solo in sessione):

```powershell
# ── STAGING ONLY — nessun valore va committato ──────────────────────────────
$env:EXPECTED_PROJECT_REF        = "uepyexyosyogyvzorata"
$env:SUPABASE_URL                = "https://uepyexyosyogyvzorata.supabase.co"
$env:SUPABASE_ANON_KEY           = "INSERISCI_ANON_KEY"          # publishable/anon STAGING
$env:SUPABASE_SERVICE_ROLE_KEY   = "INSERISCI_SERVICE_ROLE_KEY"  # solo provisioning, server-side

# email fisse degli utenti di test (servono anche a PHASE 14B)
$env:RBAC_OWNER_EMAIL   = "ingly-rbac-owner@staging.ingly.test"
$env:RBAC_ADMIN_EMAIL   = "ingly-rbac-admin@staging.ingly.test"
$env:RBAC_MANAGER_EMAIL = "ingly-rbac-manager@staging.ingly.test"
$env:RBAC_SALES_EMAIL   = "ingly-rbac-sales@staging.ingly.test"
$env:RBAC_VIEWER_EMAIL  = "ingly-rbac-viewer@staging.ingly.test"

# password (scelte da te, riusate per creazione + login harness)
$env:RBAC_OWNER_PASSWORD   = "INSERISCI_PASSWORD"
$env:RBAC_ADMIN_PASSWORD   = "INSERISCI_PASSWORD"
$env:RBAC_MANAGER_PASSWORD = "INSERISCI_PASSWORD"
$env:RBAC_SALES_PASSWORD   = "INSERISCI_PASSWORD"
$env:RBAC_VIEWER_PASSWORD  = "INSERISCI_PASSWORD"

node .\scripts\provision-rbac-test-users.mjs
```

Se il report finale mostra `Tenant membership: PASS` e `Role assignment: PASS`,
nella **stessa** finestra PowerShell (le env sono già impostate) esegui solo:

```powershell
node .\tests\live_rbac_staging.mjs
```

> La service-role key serve **solo** al provisioning. Se preferisci non tenerla
> in sessione dopo, chiudi la finestra: le password restano in env solo finché
> la sessione è aperta e non vengono mai scritte su disco.

---

## TASK 7 — Preparare PHASE 14B (PowerShell, valori mai nel repo)

```powershell
$env:SUPABASE_URL      = "https://uepyexyosyogyvzorata.supabase.co"
$env:SUPABASE_ANON_KEY = "<publishable/anon key STAGING>"

$env:RBAC_OWNER_EMAIL    = "ingly-rbac-owner@staging.ingly.test"
$env:RBAC_OWNER_PASSWORD = "<password OWNER>"
$env:RBAC_ADMIN_EMAIL    = "ingly-rbac-admin@staging.ingly.test"
$env:RBAC_ADMIN_PASSWORD = "<password ADMIN>"
$env:RBAC_MANAGER_EMAIL    = "ingly-rbac-manager@staging.ingly.test"
$env:RBAC_MANAGER_PASSWORD = "<password MANAGER>"
$env:RBAC_SALES_EMAIL    = "ingly-rbac-sales@staging.ingly.test"
$env:RBAC_SALES_PASSWORD = "<password SALES>"
$env:RBAC_VIEWER_EMAIL    = "ingly-rbac-viewer@staging.ingly.test"
$env:RBAC_VIEWER_PASSWORD = "<password VIEWER>"

# opzionale — isolamento tenant (2° tenant): serve un utente in altro tenant
# $env:RBAC_TENANTB_EMAIL / $env:RBAC_TENANTB_PASSWORD

node tests/live_rbac_staging.mjs
```
Exit `0` = **SECURITY VERIFIED**. I record creati dai test sono taggati
`PHASE14 LIVE TEST` e auto-ripuliti via soft-delete.

> Isolamento tenant completo (TASK 3 di 14B): se vuoi il PASS reale e non uno
> SKIP, crea un secondo tenant + un utente lì con la stessa procedura e imposta
> `RBAC_TENANTB_*`. Altrimenti l'isolamento risulta `SKIP(no RBAC_TENANTB_*)`.

---

## Pulizia (a validazione conclusa)
Utenti e righe di test possono restare in staging per riuso. Per rimuoverli:
elimina i 5 utenti da **Authentication → Users** (il `on delete cascade` su
`profile/tenant_membership/user_role` rimuove le righe collegate). Non toccare
`mrgiuseppe.inglima@gmail.com` né dati reali.
