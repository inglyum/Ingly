-- INGLY OS V2 — Rollback 0008 preventivi. Rimuove tabelle/funzioni/permessi
-- sales.quote. NON tocca CRM/Catalogo né la funzione trigger condivisa (0006).
-- ==========================================================================
drop trigger if exists sales_quote_del_perm on public.sales_quote;
drop trigger if exists sales_quote_line_aiud on public.sales_quote_line;
drop trigger if exists sales_quote_bi on public.sales_quote;

drop function if exists public.sales_quote_line_after();
drop function if exists public.sales_quote_recalc(uuid);
drop function if exists public.sales_quote_before_ins();
drop function if exists public.next_quote_number(uuid);

delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'sales.quote';
delete from security.role_perm_cache where resource = 'sales.quote';
delete from public.permission where resource = 'sales.quote';

drop table if exists public.sales_quote_line;
drop table if exists public.sales_quote_counter;
drop table if exists public.sales_quote;
-- ==========================================================================
