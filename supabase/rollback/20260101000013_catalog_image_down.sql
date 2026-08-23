-- INGLY OS V2 — Rollback 0013 catalog image. Rimuove policy storage, il campo
-- image_url e (best-effort) il bucket se vuoto. NON tocca catalog_product per il
-- resto né altri moduli.
-- ==========================================================================
drop policy if exists catalog_img_read on storage.objects;
drop policy if exists catalog_img_write on storage.objects;
drop policy if exists catalog_img_update on storage.objects;
drop policy if exists catalog_img_delete on storage.objects;

-- rimuovi il bucket solo se non contiene oggetti
delete from storage.buckets b
  where b.id = 'catalog'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'catalog');

alter table public.catalog_product drop column if exists image_url;
alter table public.catalog_product drop column if exists description;
alter table public.catalog_product drop column if exists vat;
-- ==========================================================================
