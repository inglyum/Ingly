-- INGLY OS V2 — Staging bootstrap ROLLBACK (down) — STAGING ONLY — NON APPLICATO
-- Ripristina le policy claim-only e rimuove i dati di bootstrap seminati.
-- ==========================================================================
-- PARTE B (dati) — rimuovi le associazioni dell'utente di staging + tenant se orfano
do $$
declare v_uid uuid; v_tid uuid;
begin
  select id into v_uid from auth.users where email = 'mrgiuseppe.inglima@gmail.com' limit 1;
  select id into v_tid from public.tenant where slug = 'ingly-staging' limit 1;
  if v_uid is not null then
    delete from public.user_role        where user_id = v_uid and tenant_id = v_tid;
    delete from public.tenant_membership where user_id = v_uid and tenant_id = v_tid;
    delete from public.profile           where id = v_uid;
  end if;
  -- rimuovi il tenant di staging solo se non ha piu' membership
  if v_tid is not null and not exists (select 1 from public.tenant_membership where tenant_id = v_tid) then
    delete from public.tenant where id = v_tid;
  end if;
end $$;

-- PARTE A (policy) — ripristina le policy claim-only della foundation
drop policy if exists membership_self on public.tenant_membership;
create policy membership_self on public.tenant_membership
  for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) );

drop policy if exists user_role_read on public.user_role;
create policy user_role_read on public.user_role
  for select to authenticated using ( tenant_id = any (public.current_tenant_ids()) );
-- ==========================================================================
