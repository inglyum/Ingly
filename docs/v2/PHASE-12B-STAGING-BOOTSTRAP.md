# INGLY OS V2 — Fase 12B: Staging User Bootstrap (design)

> Design del bootstrap minimo per far risolvere tenant/ruolo all'utente
> `mrgiuseppe.inglima@gmail.com` in **staging**. Migrazione **scritta ma NON
> applicata**. Nessun insert remoto, nessun SQL remoto, produzione/V96 intatti.

## Stato bootstrap rilevato (fornito)
`profile = NULL · tenant_membership = NULL · user_role = NULL · role = NULL · tenant = NULL`
→ la V2 non può risolvere tenant/ruolo.

## TASK 1 — Schema effettivo della foundation (da 0001/0002)
| Tabella | Colonne (PK/FK/def) |
|--|--|
| `public.tenant` | `id uuid pk` · `name text NOT NULL` · `slug text UNIQUE NOT NULL` · `plan text def 'starter'` · `status text def 'active'` · `created_at` |
| `public.profile` | `id uuid pk → auth.users(id) on delete cascade` · `full_name` · `locale def 'it'` · `created_at` |
| `public.tenant_membership` | `id uuid pk` · `tenant_id → tenant(id)` · `user_id → auth.users(id)` · `status def 'active'` · `created_at` · **UNIQUE(tenant_id,user_id)** |
| `public.role` | `id uuid pk` · `key text UNIQUE` · `name` · `level int` |
| `public.permission` | `id uuid pk` · `resource` · `action` · UNIQUE(resource,action) — **non seminata** |
| `public.role_permission` | `role_id,permission_id` **PK composta** — **non seminata** |
| `public.user_role` | `tenant_id → tenant` · `user_id → auth.users` · `role_id → role` · **PK(tenant_id,user_id)** (un ruolo per utente/tenant) |

## TASK — Ruoli seminati (0002)
`OWNER(level 0), ADMIN(1), MANAGER(2), SALES(3), DESIGNER(3), PRODUCTION(3),
WAREHOUSE(3), FINANCE(3), VIEWER(9)` + tabella `security.role_perm_cache` (vuota).
Permessi/`role_permission` **non** seminati (RBAC di dettaglio arriva dopo; il
confine attuale è il tenant via RLS).

## TASK 2 — Design del bootstrap (idempotente, staging-only)
Per `mrgiuseppe.inglima@gmail.com`:
1. **tenant**: uno solo, cercato per `slug='ingly-staging'`; se assente → crea
   `('Ingly Staging','ingly-staging','enterprise','active')`.
2. **profile**: `insert (id=auth.uid, full_name) on conflict (id) do nothing`.
3. **tenant_membership**: `insert (tenant,user,'active') on conflict (tenant,user)
   do update status='active'`.
4. **user_role**: ruolo **OWNER** (già seminato) → `insert on conflict (tenant,user)
   do update role_id`.
- **No-op** se l'utente auth non esiste (`select id from auth.users where email=…`).
- **Nessun** nuovo ruolo/permesso creato. Idempotente (rieseguibile).
- **No** ref di produzione. Solo staging.

## TASK 3 — RLS bootstrap blocker (confermato)
La policy attuale della foundation:
```sql
create policy membership_self on public.tenant_membership
  for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) );
```
legge il **claim** (vuoto senza Auth Hook) → l'utente **non può leggere la propria
membership** prima che i claim esistano → **il fallback DB (Fase 12) resta a vuoto**.

**Fix minimo proposto (Parte A della migrazione)**: consentire la self-read via
`auth.uid()` **senza allargare** l'accesso ai dati business:
```sql
create policy membership_self on public.tenant_membership
  for select to authenticated
  using ( user_id = auth.uid() or tenant_id = any (public.current_tenant_ids()) );
-- idem per user_role_read
```
Riguarda solo le righe **proprie** (`user_id = auth.uid()`): l'utente vede le sue
associazioni tenant/ruolo, non i dati di altri tenant.

## TASK 4 — Migrazione proposta (scritta, NON applicata)
- `supabase/migrations/20260101000004_staging_bootstrap.sql`
  - **Parte A**: fix policy RLS bootstrap (`membership_self`, `user_role_read`).
  - **Parte B**: seed idempotente utente (blocco `DO $$ … $$`).
- `supabase/rollback/20260101000004_staging_bootstrap_down.sql`
  - rimuove i dati seminati (+ tenant se orfano) e **ripristina** le policy claim-only.
- Ordering: `…0001 → …0002 → …0003(crm) → …0004(bootstrap) → 20260817_stripe`.

## Effetto atteso (dopo apply in staging)
La V2, per l'utente autenticato: legge `tenant_membership`/`user_role` via
`auth.uid()` → **fallback DB (Fase 12) risolve** tenant, active tenant, ruolo
OWNER e permessi. La UI mostra Tenant/Role reali (non «—»).

## Cosa NON è stato fatto (per istruzione)
Nessun `db push`, nessun insert remoto, nessuna modifica a produzione/V96. La
migrazione va **revisionata e applicata in staging** (con `SUPABASE_ACCESS_TOKEN`
+ rete) dopo tua approvazione: `supabase link …` → `db push --dry-run` → `db push`.

## Test statici (aggiunti)
`tests/staging_sql.test.mjs` (+8): policy `auth.uid()`, idempotenza/guardie no-op,
uso di OWNER (no nuovi ruoli/permessi), down ripristina policy+rimuove dati,
ordering, no ref produzione, `$$` bilanciati.
