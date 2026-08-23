-- INGLY OS V2 — Scorte minime / riordino sul catalogo. STAGING ONLY.
-- Additiva e reversibile. Aggiunge le soglie di riordino a catalog_product.
-- La GIACENZA resta derivata dal ledger stock_movement (nessuna duplicazione);
-- impegnato/in arrivo/disponibile sono derivati dagli ordini vendita/acquisto.
-- Dipende da: 0007 (catalog_product).
-- Rollback: supabase/rollback/20260101000016_catalog_reorder_down.sql
-- ==========================================================================
alter table public.catalog_product add column if not exists min_stock numeric not null default 0;
alter table public.catalog_product add column if not exists reorder_point numeric not null default 0;
alter table public.catalog_product add column if not exists reorder_qty numeric not null default 0;

-- indice parziale per trovare rapidamente gli articoli con soglia impostata
create index if not exists catalog_product_reorder_idx
  on public.catalog_product (tenant_id) where (reorder_point > 0 or min_stock > 0);
-- ==========================================================================
-- Nessuna nuova permission/RLS: i campi vivono su catalog_product, già coperto
-- da has_permission('catalog.product', …) nelle policy di 0006/0007/0013.
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
