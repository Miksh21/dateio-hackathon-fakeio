-- Migration 9 — v_my_assignments: the caller's own assignments joined with the
-- recipient's name + cycle window. A giver can't read the recipient's employees
-- row under RLS (own + subtree + admin only), but needs their name on the form.
-- Definer view, filtered to from_id = current user, so it discloses only the
-- people the caller is actually assigned to review.
create view public.v_my_assignments with (security_invoker = false) as
  select
    fa.id,
    fa.cycle_id,
    fa.type,
    fa.status,
    fa.submitted_at,
    fa.to_id               as recipient_id,
    r.first_name           as recipient_first_name,
    r.last_name            as recipient_last_name,
    r.job_title            as recipient_job_title,
    c.name                 as cycle_name,
    c.form_start,
    c.form_end,
    c.status               as cycle_status
  from public.feedback_assignments fa
  join public.employees r         on r.id = fa.to_id
  join public.evaluation_cycles c on c.id = fa.cycle_id
  where fa.from_id = public.current_employee_id();

grant select on public.v_my_assignments to authenticated;
