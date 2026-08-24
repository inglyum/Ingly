-- INGLY OS V2 — Audit Log (audit_log). STAGING ONLY.
-- Additiva e reversibile. Traccia SERVER-SIDE (trigger SECURITY DEFINER) le
-- operazioni sulle tabelle sensibili: chi, cosa, quando, con snapshot old/new.
-- La scrittura avviene SOLO via trigger (non dall'API); la lettura è riservata
-- a OWNER/ADMIN. Riusa RBAC/tenant di 0006. NON modifica le tabelle tracciate
-- (aggiunge solo trigger AFTER). Dipende da: 0001, 0006, 0007, 0009, 0010, 0011,
-- 0021. Rollback: supabase/rollback/20260101000026_audit_log_down.sql
-- ==========================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  table_name text not null,
  op text not null check (op in ('INSERT','UPDATE','DELETE')),
  row_id uuid,
  actor uuid,
  changes jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_tenant_idx on public.audit_log (tenant_id, at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, at desc);

-- Trigger generico: registra INSERT/UPDATE/DELETE con snapshot.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_row uuid; v_changes jsonb;
begin
  begin v_tenant := coalesce(new.tenant_id, old.tenant_id); exception when others then v_tenant := null; end;
  begin v_row := coalesce(new.id, old.id); exception when others then v_row := null; end;
  if tg_op = 'UPDATE' then v_changes := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  elsif tg_op = 'INSERT' then v_changes := jsonb_build_object('new', to_jsonb(new));
  else v_changes := jsonb_build_object('old', to_jsonb(old)); end if;
  insert into public.audit_log (tenant_id, table_name, op, row_id, actor, changes)
    values (v_tenant, tg_table_name, tg_op, v_row, auth.uid(), v_changes);
  return coalesce(new, old);
end;
$$;

-- Attacca il trigger alle tabelle sensibili (denaro/fisco/impostazioni).
do $$
declare t text;
begin
  foreach t in array array['sales_invoice','sales_order','sales_payment','catalog_product','tenant_settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- PERMESSO system.audit: SOLO lettura, solo OWNER/ADMIN.
insert into public.permission (resource, action) values ('system.audit','read')
on conflict (resource, action) do nothing;
insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'system.audit', 'read' from public.role r where r.key in ('OWNER','ADMIN')
on conflict (role_key, resource, action) do nothing;
insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'system.audit'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS: lettura riservata; nessuna policy di scrittura (solo il trigger
-- SECURITY DEFINER, come owner, inserisce — bypass RLS del proprietario).
alter table public.audit_log enable row level security;
drop policy if exists audit_log_sel on public.audit_log;
create policy audit_log_sel on public.audit_log for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'system.audit','read') );
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
