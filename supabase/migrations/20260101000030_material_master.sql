-- INGLY OS V2 — Materiali come MASTER DATA (dentro catalog_product). STAGING ONLY.
-- Additiva e reversibile. PRINCIPIO: una sola source of truth per il materiale.
-- Un materiale È un catalog_product con kind='material': eredita automaticamente
-- Magazzino (stock_movement), Acquisti (purchase_order_line), Smart Quoter
-- (cost_per_mq) e Produzione (BOM component) SENZA una seconda anagrafica.
-- Estende il check kind e aggiunge i campi materiale mancanti (gli altri —
-- cost_per_mq 0029, min_stock/reorder 0016, sku/unit/image 0007/0013 — esistono).
-- Dipende da: 0007 (catalog), 0012 (supplier), 0029 (cost_per_mq).
-- Rollback: supabase/rollback/20260101000030_material_master_down.sql
-- ==========================================================================

alter table public.catalog_product drop constraint if exists catalog_product_kind_check;
alter table public.catalog_product add constraint catalog_product_kind_check
  check (kind in ('product','service','material'));

alter table public.catalog_product add column if not exists material_type text;   -- MDF/plexi/acciaio/vernice…
alter table public.catalog_product add column if not exists subcategory text;
alter table public.catalog_product add column if not exists cost_per_kg numeric;
alter table public.catalog_product add column if not exists supplier_id uuid references public.supplier(id) on delete set null;
create index if not exists catalog_product_kind_idx on public.catalog_product (tenant_id, kind);
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
