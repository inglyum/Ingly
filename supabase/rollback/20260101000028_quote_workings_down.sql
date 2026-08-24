-- INGLY OS V2 — Rollback 0028 quoter workings.
alter table public.sales_quote_line drop column if exists workings;
