-- INGLY OS V2 — CRM RLS fix ROLLBACK (down) — STAGING ONLY — NON APPLICATO
-- Ripristina current_tenant_ids() alla versione claim-only (foundation 0001).
-- Le policy CRM restano quelle di 0003 (idempotenti, identiche): non vengono
-- rimosse per non disabilitare la RLS. Se serve rimuoverle, usare il down di 0003.
-- ==========================================================================
create or replace function public.current_tenant_ids()
returns uuid[]
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_agg((v)::uuid)
       from jsonb_array_elements_text(
         coalesce(auth.jwt() -> 'app_metadata' -> 'tenant_ids', '[]'::jsonb)) as v),
    array[]::uuid[]);
$$;
revoke execute on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;
-- ==========================================================================
