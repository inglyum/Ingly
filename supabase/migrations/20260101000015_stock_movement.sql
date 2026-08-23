-- INGLY OS V2 — Magazzino: movimenti di stock (stock_movement). STAGING ONLY.
-- Additiva e reversibile. Ledger dei movimenti (carico/scarico/rettifica/
-- trasferimento); la GIACENZA è derivata (somma dei delta) — nessuna tabella
-- giacenza duplicata. Collega acquisti/ordini/inventario via reference.
-- Riusa RBAC/tenant di 0006. NON tocca moduli esistenti/produzione.
-- Dipende da: 0001, 0006, 0007 (catalog_product).
-- Rollback: supabase/rollback/20260101000015_stock_movement_down.sql
-- ==========================================================================

create table if not exists public.stock_movement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  product_id uuid not null references public.catalog_product(id) on delete cascade,
  type text not null check (type in ('IN','OUT','ADJUST','TRANSFER')),
  quantity numeric not null check (quantity <> 0),   -- ADJUST può essere negativo
  location text not null default 'MAIN',
  location_to text,                                  -- per TRANSFER
  reference_type text,                               -- purchase|sales_order|inventory|manual
  reference_id uuid,
  note text,
  -- delta sulla giacenza totale (TRANSFER netto 0 sul totale prodotto)
  delta numeric generated always as (
    case type when 'IN' then quantity
             when 'OUT' then -quantity
             when 'ADJUST' then quantity
             else 0 end
  ) stored,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists stock_movement_tenant_idx on public.stock_movement (tenant_id);
create index if not exists stock_movement_product_idx on public.stock_movement (tenant_id, product_id);

-- PERMESSI inventory.movement (matrice CRM)
insert into public.permission (resource, action) values
  ('inventory.movement','read'),('inventory.movement','create'),
  ('inventory.movement','update'),('inventory.movement','delete')
on conflict (resource, action) do nothing;

insert into security.role_perm_cache (role_key, resource, action)
select r.key, 'inventory.movement', a.action
from public.role r
cross join (values ('read'),('create'),('update'),('delete')) as a(action)
where (a.action = 'read')
   or (a.action in ('create','update') and r.key in ('OWNER','ADMIN','MANAGER','SALES'))
   or (a.action = 'delete' and r.key in ('OWNER','ADMIN','MANAGER'))
on conflict (role_key, resource, action) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join security.role_perm_cache c on c.role_key = r.key and c.resource = 'inventory.movement'
join public.permission p on p.resource = c.resource and p.action = c.action
on conflict (role_id, permission_id) do nothing;

-- RLS = tenant + has_permission
alter table public.stock_movement enable row level security;
drop policy if exists stock_movement_sel on public.stock_movement;
create policy stock_movement_sel on public.stock_movement for select to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'inventory.movement','read') );
drop policy if exists stock_movement_ins on public.stock_movement;
create policy stock_movement_ins on public.stock_movement for insert to authenticated
  with check ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'inventory.movement','create') );
drop policy if exists stock_movement_upd on public.stock_movement;
create policy stock_movement_upd on public.stock_movement for update to authenticated
  using ( tenant_id = any (public.current_tenant_ids()) and public.has_permission(tenant_id,'inventory.movement','update') )
  with check ( tenant_id = any (public.current_tenant_ids()) );

drop trigger if exists stock_movement_del_perm on public.stock_movement;
create trigger stock_movement_del_perm before update on public.stock_movement
  for each row execute function public.crm_enforce_delete_perm('inventory.movement');
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
