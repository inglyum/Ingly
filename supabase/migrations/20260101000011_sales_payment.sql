-- INGLY OS V2 — Pagamenti/Incassi (sales_payment) — STAGING ONLY.
-- Additiva e reversibile. Quarto stadio: Invoice → Payment. Integrato: ogni
-- pagamento aggiorna paid_total e lo STATO della fattura via trigger DB;
-- validazione overpayment lato DB. Riusa RBAC/tenant di 0006. NON tocca moduli
-- esistenti/produzione.
-- Dipende da: 0001, 0006 (has_permission, crm_enforce_delete_perm), 0010 (sales_invoice).
-- Rollback: supabase/rollback/20260101000011_sales_payment_down.sql
-- ==========================================================================

-- 1) TABELLA pagamenti -------------------------------------------------------
create table if not exists public.sales_payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  invoice_id uuid not null references public.sales_invoice(id) on delete cascade,
  amount numeric not null check (amount > 0),
  paid_date date not null default current_date,
  method text not null default 'bank_transfer'
    check (method in ('cash','card','bank_transfer','paypal','stripe','other')),
  reference text,                    -- estremi transazione
  notes text,
  allow_overpayment boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists sales_payment_invoice_idx on public.sales_payment (invoice_id);
create index if not exists sales_payment_tenant_idx on public.sales_payment (tenant_id);

-- 2) RICALCOLO paid_total + STATO fattura (deterministico, lato DB) ----------
create or replace function public.sales_invoice_apply_payments(p_invoice uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric; v_paid numeric; v_status text; v_due date;
begin
  select total, status, due_date into v_total, v_status, v_due
    from public.sales_invoice where id = p_invoice;
  if not found then return; end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.sales_payment where invoice_id = p_invoice and deleted_at is null;

  -- stati "manuali" non vengono sovrascritti dall'automatismo
  if v_status not in ('CANCELLED','DRAFT') then
    if v_paid >= v_total and v_total > 0 then v_status := 'PAID';
    elsif v_paid > 0 then v_status := 'PARTIALLY_PAID';
    elsif v_due is not null and v_due < current_date then v_status := 'OVERDUE';
    else v_status := 'ISSUED';
    end if;
  end if;

  update public.sales_invoice
    set paid_total = v_paid, status = v_status, updated_at = now()
    where id = p_invoice;
end;
$$;

-- 3) VALIDAZIONE overpayment (BEFORE INSERT/UPDATE) --------------------------
create or replace function public.sales_payment_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_paid numeric; v_residuo numeric;
begin
  if new.deleted_at is not null then return new; end if;   -- storno: nessun limite
  select total into v_total from public.sales_invoice where id = new.invoice_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.sales_payment
    where invoice_id = new.invoice_id and deleted_at is null
      and (tg_op <> 'UPDATE' or id <> new.id);              -- escludi la riga corrente in update
  v_residuo := coalesce(v_total, 0) - v_paid;
  if not new.allow_overpayment and new.amount > v_residuo + 0.001 then
    raise exception 'incasso (%) superiore al residuo (%). Usa allow_overpayment per forzare.',
      new.amount, v_residuo using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists sales_payment_biu on public.sales_payment;
create trigger sales_payment_biu before insert or update on public.sales_payment
  for each row execute function public.sales_payment_validate();

-- 4) PROPAGAZIONE alla fattura (AFTER INSERT/UPDATE/DELETE) ------------------
create or replace function public.sales_payment_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sales_invoice_apply_payments(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
drop trigger if exists sales_payment_aiud on public.sales_payment;
create trigger sales_payment_aiud after insert or update or delete on public.sales_payment
  for each row execute function public.sales_payment_after();

-- 5) PERMESSI sales.payment (idempotenti, stessa matrice CRM) ----------------
insert into public.permission (resource, action) values
  ('sales.payment','read'),('sales.payment','create'),
  ('sales.payment','update'),('sales.payment','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'sales.payment', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'sales.payment'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- 6) RLS = tenant + has_permission ------------------------------------------
alter table public.sales_payment enable row level security;

drop policy if exists sales_payment_sel on public.sales_payment;
create policy sales_payment_sel on public.sales_payment for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.payment','read') );
drop policy if exists sales_payment_ins on public.sales_payment;
create policy sales_payment_ins on public.sales_payment for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.payment','create') );
drop policy if exists sales_payment_upd on public.sales_payment;
create policy sales_payment_upd on public.sales_payment for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'sales.payment','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

-- 7) SOFT-DELETE (storno): il cambio deleted_at richiede permesso 'delete' ---
drop trigger if exists sales_payment_del_perm on public.sales_payment;
create trigger sales_payment_del_perm before update on public.sales_payment
  for each row execute function public.crm_enforce_delete_perm('sales.payment');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
