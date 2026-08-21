-- INGLY OS V2 — RBAC seed + role_perm_cache (Fase 4D) — STAGING ONLY — NON ESEGUITO
-- Risolve W-2/W-3: crea security.role_perm_cache e semina i 9 ruoli + permessi.
-- ==========================================================================
create schema if not exists security;

-- Cache ruolo->permessi (materializzata come tabella, indicizzata) usata da
-- has_permission() senza join costosi/ricorsivi in RLS.
create table if not exists security.role_perm_cache (
  role_key text not null,
  resource text not null,
  action   text not null,
  primary key (role_key, resource, action)
);

-- Seed ruoli (level: piu' basso = piu' privilegi)
insert into public.role (key, name, level) values
  ('OWNER','Owner',0),('ADMIN','Admin',1),('MANAGER','Manager',2),
  ('SALES','Sales',3),('DESIGNER','Designer',3),('PRODUCTION','Production',3),
  ('WAREHOUSE','Warehouse',3),('FINANCE','Finance',3),('VIEWER','Viewer',9)
on conflict (key) do nothing;

-- NB: il set completo di permessi (resource,action) e la mappa role_perm_cache
-- vengono popolati in staging da uno script di seed derivato da rls-model §4
-- (matrice ruoli↔permessi). Qui si crea solo la struttura + i ruoli base.
-- has_permission() (definita in una migrazione successiva) leggera' role dal
-- claim JWT e verifichera' security.role_perm_cache — nessuna funzione costosa
-- per riga in RLS.
-- ==========================================================================
