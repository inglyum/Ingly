-- INGLY OS V2 — Rollback 0007 catalog. Rimuove tabella, policy, permessi
-- catalog.product. NON tocca il CRM né la funzione trigger condivisa (usata
-- ancora dai trigger CRM di 0006).
-- ==========================================================================
drop trigger if exists catalog_product_del_perm on public.catalog_product;

drop policy if exists catalog_product_sel on public.catalog_product;
drop policy if exists catalog_product_ins on public.catalog_product;
drop policy if exists catalog_product_upd on public.catalog_product;

delete from public.role_permission rp
using public.permission p
where rp.permission_id = p.id and p.resource = 'catalog.product';

delete from security.role_perm_cache where resource = 'catalog.product';
delete from public.permission where resource = 'catalog.product';

drop table if exists public.catalog_product;
-- ==========================================================================
