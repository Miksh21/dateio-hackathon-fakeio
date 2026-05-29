-- Migration 16 — v_given: feedback a person GAVE, as-is (un-aggregated).
--
-- Visible to the giver themselves OR a super admin. Unlike the *received* views
-- (aggregated + anonymized), "given" is the caller's / a person's own raw input,
-- so no threshold and giver identity is the point. Admins viewing someone else's
-- given feedback is a deliberate de-anonymising capability (demo / RevOps).
create or replace view public.v_given
with (security_invoker = false) as
  select
    fa.from_id,
    fa.cycle_id,
    fa.to_id                 as recipient_id,
    e.first_name             as recipient_first_name,
    e.last_name              as recipient_last_name,
    fa.type                  as assignment_type,
    q.id                     as question_id,
    q.text                   as question_text,
    q.type                   as question_type,
    q.sort_order,
    r.scale_value,
    r.text_value,
    r.choice_value
  from public.responses r
  join public.feedback_assignments fa on fa.id = r.assignment_id
  join public.questions q             on q.id = r.question_id
  join public.employees e             on e.id = fa.to_id
  where public.is_super_admin() or fa.from_id = public.current_employee_id();

grant select on public.v_given to authenticated;
