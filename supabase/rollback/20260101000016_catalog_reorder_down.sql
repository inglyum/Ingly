-- INGLY OS V2 — Rollback 0016 scorte minime.
drop index if exists public.catalog_product_reorder_idx;
alter table public.catalog_product drop column if exists min_stock;
alter table public.catalog_product drop column if exists reorder_point;
alter table public.catalog_product drop column if exists reorder_qty;
