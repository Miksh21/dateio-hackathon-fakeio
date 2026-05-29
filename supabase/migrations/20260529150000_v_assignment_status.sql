-- Migration 12 — v_assignment_status: completion metadata for the report.
-- Exposes assignment STATUS (not feedback content), scoped to admin (all),
-- the giver (own), or a manager (assignments where their subtree is giver or
-- recipient). Privacy-safe: no responses, just who-owes-what and done/pending.
create view public.v_assignment_status with (security_invoker = false) as
  select
    fa.id,
    fa.cycle_id,
    fa.type,
    fa.status,
    fa.submitted_at,
    fa.from_id,
    gf.first_name  as from_first_name,
    gf.last_name   as from_last_name,
    gf.division    as from_division,
    gf.reporting_to_id as from_manager_id,
    m.first_name   as from_manager_first,
    m.last_name    as from_manager_last,
    fa.to_id,
    gt.first_name  as to_first_name,
    gt.last_name   as to_last_name
  from public.feedback_assignments fa
  join public.employees gf on gf.id = fa.from_id
  join public.employees gt on gt.id = fa.to_id
  left join public.employees m on m.id = gf.reporting_to_id
  where
    public.is_super_admin()
    or fa.from_id = public.current_employee_id()
    or fa.from_id in (select employee_id from public.manager_subtree(fa.cycle_id))
    or fa.to_id   in (select employee_id from public.manager_subtree(fa.cycle_id));

grant select on public.v_assignment_status to authenticated;
