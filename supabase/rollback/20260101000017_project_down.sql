-- INGLY OS V2 — Rollback 0017 progetti/commesse.
drop trigger if exists project_del_perm on public.project;
drop trigger if exists project_bi on public.project;
drop function if exists public.project_before_ins();
drop function if exists public.next_project_number(uuid);
drop index if exists public.sales_order_project_idx;
drop index if exists public.purchase_order_project_idx;
alter table public.sales_order drop column if exists project_id;
alter table public.purchase_order drop column if exists project_id;
delete from public.role_permission rp using public.permission p
  where rp.permission_id = p.id and p.resource = 'project.project';
delete from security.role_perm_cache where resource = 'project.project';
delete from public.permission where resource = 'project.project';
drop table if exists public.project_task;
drop table if exists public.project_counter;
drop table if exists public.project;
