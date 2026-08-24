-- INGLY OS V2 — Smart Quoter "Configura Lavorazione": snapshot delle lavorazioni
-- (cost component) per riga di preventivo. STAGING ONLY. Additiva e reversibile:
-- UNA sola colonna jsonb `workings` (snapshot storico della struttura a lunghezza
-- variabile: materiale/laser/manodopera/verniciatura/gadget/catalogo). I totali
-- per categoria restano nelle colonne flat (cost_material/machine/labor/design/
-- extra di 0027) per analisi margine/BI: il jsonb NON sostituisce le colonne
-- relazionali, congela solo il dettaglio. Nessuna tabella nuova, nessun trigger.
-- Dipende da: 0008, 0027 (breakdown flat).
-- Rollback: supabase/rollback/20260101000028_quote_workings_down.sql
-- ==========================================================================

alter table public.sales_quote_line add column if not exists workings jsonb;
-- ==========================================================================
-- FINE — applicare SOLO in staging dopo dry-run pulito. Non toccare produzione.
-- ==========================================================================
