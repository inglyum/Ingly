-- INGLY OS V2 — Pagamenti fornitori (supplier_payment). STAGING ONLY.
-- Additiva e reversibile. UNICO evento finanziario non derivabile dai dati
-- esistenti (le uscite verso fornitori). Tutto il resto della Finanza è una
-- VISTA/aggregazione derivata (fatture/incassi/acquisti): nessuna seconda fonte
-- di verità. Riusa RBAC/tenant di 0006. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0006, 0012 (supplier), 0014 (purchase_order).
-- Rollback: supabase/rollback/20260101000018_supplier_payment_down.sql
-- ==========================================================================

create table if not exists public.supplier_payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  purchase_order_id uuid references public.purchase_order(id) on delete set null,
  supplier_id uuid references public.supplier(id) on delete set null,
  supplier_name text,
  amount numeric not null check (amount > 0),
  paid_date date not null default current_date,
  method text not null default 'bank_transfer'
    check (method in ('cash','card','bank_transfer','paypal','stripe','other')),
  reference text,
  notes text,
  allow_overpayment boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists supplier_payment_tenant_idx on public.supplier_payment (tenant_id);
create index if not exists supplier_payment_po_idx on public.supplier_payment (purchase_order_id);

-- Validazione overpayment vs totale ordine di acquisto (lato DB)
create or replace function public.supplier_payment_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_paid numeric;
begin
  if new.deleted_at is not null or new.purchase_order_id is null then return new; end if;
  select total into v_total from public.purchase_order where id = new.purchase_order_id;
  select coalesce(sum(amount),0) into v_paid from public.supplier_payment
    where purchase_order_id = new.purchase_order_id and deleted_at is null
      and (tg_op <> 'UPDATE' or id <> new.id);
  if not new.allow_overpayment and new.amount > coalesce(v_total,0) - v_paid + 0.001 then
    raise exception 'pagamento (%) superiore al residuo (%).', new.amount, coalesce(v_total,0)-v_paid using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_payment_biu on public.supplier_payment;
create trigger supplier_payment_biu before insert or update on public.supplier_payment
  for each row execute function public.supplier_payment_validate();

-- PERMESSI finance.payment (matrice CRM)
insert into public.permission (resource, action) values
  ('finance.payment','read'),('finance.payment','create'),
  ('finance.payment','update'),('finance.payment','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'finance.payment', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'finance.payment'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission
alter table public.supplier_payment enable row level security;
drop policy if exists supplier_payment_sel on public.supplier_payment;
create policy supplier_payment_sel on public.supplier_payment for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'finance.payment','read') );
drop policy if exists supplier_payment_ins on public.supplier_payment;
create policy supplier_payment_ins on public.supplier_payment for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'finance.payment','create') );
drop policy if exists supplier_payment_upd on public.supplier_payment;
create policy supplier_payment_upd on public.supplier_payment for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'finance.payment','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists supplier_payment_del_perm on public.supplier_payment;
create trigger supplier_payment_del_perm before update on public.supplier_payment
  for each row execute function public.crm_enforce_delete_perm('finance.payment');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
