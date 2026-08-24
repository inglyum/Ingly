-- INGLY OS V2 — Rollback 0030 materiali master-data.
alter table public.catalog_product drop column if exists material_type;
alter table public.catalog_product drop column if exists subcategory;
alter table public.catalog_product drop column if exists cost_per_kg;
alter table public.catalog_product drop column if exists supplier_id;
alter table public.catalog_product drop constraint if exists catalog_product_kind_check;
alter table public.catalog_product add constraint catalog_product_kind_check
  check (kind in ('product','service'));
