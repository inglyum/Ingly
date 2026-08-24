-- INGLY OS V2 — Rollback 0027 quoter breakdown.
alter table public.sales_quote_line drop constraint if exists sales_quote_line_kind_chk;
alter table public.sales_quote_line drop column if exists kind;
alter table public.sales_quote_line drop column if exists cost_material;
alter table public.sales_quote_line drop column if exists cost_machine;
alter table public.sales_quote_line drop column if exists cost_labor;
alter table public.sales_quote_line drop column if exists cost_design;
alter table public.sales_quote_line drop column if exists cost_extra;
alter table public.sales_quote_line drop column if exists markup_pct;
alter table public.sales_quote_line drop column if exists discount_pct;
alter table public.sales_quote_line drop column if exists vat_rate;
alter table public.sales_quote_line drop column if exists image_url;
alter table public.sales_quote_line drop column if exists spec;
alter table public.sales_quote drop column if exists title;
alter table public.sales_quote drop column if exists priority;
alter table public.sales_quote drop column if exists category;
alter table public.sales_quote drop column if exists deposit_pct;
