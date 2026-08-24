-- INGLY OS V2 — Smart Quoter premium: metadati preventivo + SNAPSHOT breakdown
-- di riga + righe extra. STAGING ONLY. Additiva e reversibile: SOLO colonne
-- nullable/defaulted, nessuna tabella nuova, nessun trigger nuovo. Gli extra
-- (setup/spedizione/express/packaging) sono righe kind='extra' → il ricalcolo
-- header esistente (subtotal/tax/total) li include senza modifiche alla logica.
-- Il breakdown è uno SNAPSHOT storico: congelato al salvataggio, non ricalcolato
-- retroattivamente dai valori futuri del catalogo.
-- Dipende da: 0008 (sales_quote / sales_quote_line).
-- Rollback: supabase/rollback/20260101000027_quote_breakdown_down.sql
-- ==========================================================================

-- Metadati commessa/preventivo
alter table public.sales_quote add column if not exists title text;
alter table public.sales_quote add column if not exists priority text;      -- low/normal/high/urgent (libero)
alter table public.sales_quote add column if not exists category text;
alter table public.sales_quote add column if not exists deposit_pct numeric; -- acconto % (nullable)

-- Snapshot breakdown di riga + tipo riga + spec/immagine
alter table public.sales_quote_line add column if not exists kind text not null default 'product';
alter table public.sales_quote_line drop constraint if exists sales_quote_line_kind_chk;
alter table public.sales_quote_line add constraint sales_quote_line_kind_chk check (kind in ('product','extra'));
alter table public.sales_quote_line add column if not exists cost_material numeric;
alter table public.sales_quote_line add column if not exists cost_machine numeric;
alter table public.sales_quote_line add column if not exists cost_labor numeric;
alter table public.sales_quote_line add column if not exists cost_design numeric;
alter table public.sales_quote_line add column if not exists cost_extra numeric;
alter table public.sales_quote_line add column if not exists markup_pct numeric;
alter table public.sales_quote_line add column if not exists discount_pct numeric;
alter table public.sales_quote_line add column if not exists vat_rate numeric;
alter table public.sales_quote_line add column if not exists image_url text;
alter table public.sales_quote_line add column if not exists spec text;
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
