-- INGLY OS V2 — Catalogo: immagine prodotto (image_url) + Storage bucket.
-- STAGING ONLY. Additiva e reversibile. NON duplica catalog_product, NON tocca
-- RLS/RBAC esistenti, preserva i dati. Le immagini NON vanno in PostgreSQL: solo
-- l'URL nel record; il binario nello Storage bucket 'catalog'.
-- Dipende da: 0007 (catalog_product).
-- Rollback: supabase/rollback/20260101000013_catalog_image_down.sql
-- ==========================================================================

-- 1) Campi premium (additivi, preservano i dati esistenti) ------------------
alter table public.catalog_product add column if not exists image_url text;
alter table public.catalog_product add column if not exists description text;
alter table public.catalog_product add column if not exists vat numeric;

-- 2) Bucket Storage pubblico dedicato alle immagini prodotto -----------------
insert into storage.buckets (id, name, public)
  values ('catalog', 'catalog', true)
on conflict (id) do nothing;

-- 3) RLS su storage.objects per il bucket 'catalog' -------------------------
-- Lettura pubblica (bucket public); scrittura/aggiornamento/eliminazione solo
-- ad utenti autenticati con permesso di modifica sul catalogo, scoped al path
-- del proprio tenant: primo segmento del path = tenant_id.
drop policy if exists catalog_img_read on storage.objects;
create policy catalog_img_read on storage.objects for select to public
  using ( bucket_id = 'catalog' );

drop policy if exists catalog_img_write on storage.objects;
create policy catalog_img_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog'
    and (storage.foldername(name))[1] = any (public.current_tenant_ids()::text[])
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'catalog.product', 'update')
  );

drop policy if exists catalog_img_update on storage.objects;
create policy catalog_img_update on storage.objects for update to authenticated
  using (
    bucket_id = 'catalog'
    and (storage.foldername(name))[1] = any (public.current_tenant_ids()::text[])
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'catalog.product', 'update')
  );

drop policy if exists catalog_img_delete on storage.objects;
create policy catalog_img_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'catalog'
    and (storage.foldername(name))[1] = any (public.current_tenant_ids()::text[])
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'catalog.product', 'delete')
  );
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
