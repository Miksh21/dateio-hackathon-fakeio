-- Migration 10 — v_value_matrix: per-recipient Value quadrant data.
--   self_value    = the recipient's own value_self choice (1..4)
--   manager_value = avg of value_manager choices about them (downward, 1..4)
-- Definer view, visible to super admins (all) or a manager for their subtree in
-- a published cycle. Drives the 2x2 talent/value quadrant on the results page.
create view public.v_value_matrix with (security_invoker = false) as
  with self_v as (
    select fa.cycle_id, fa.to_id as recipient_id, max((r.choice_value)::int) as self_value
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    join public.questions q on q.id = r.question_id and q.code = 'value_self'
    where fa.type = 'self' and r.choice_value is not null
    group by fa.cycle_id, fa.to_id
  ),
  mgr_v as (
    select fa.cycle_id, fa.to_id as recipient_id,
           round(avg((r.choice_value)::numeric), 2) as manager_value,
           count(*)::int as manager_count
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    join public.questions q on q.id = r.question_id and q.code = 'value_manager'
    where fa.type = 'downward' and r.choice_value is not null
    group by fa.cycle_id, fa.to_id
  )
  select
    coalesce(s.cycle_id, m.cycle_id)       as cycle_id,
    coalesce(s.recipient_id, m.recipient_id) as recipient_id,
    e.first_name,
    e.last_name,
    s.self_value,
    m.manager_value,
    coalesce(m.manager_count, 0)           as manager_count
  from self_v s
  full join mgr_v m on m.cycle_id = s.cycle_id and m.recipient_id = s.recipient_id
  join public.employees e         on e.id = coalesce(s.recipient_id, m.recipient_id)
  join public.evaluation_cycles c on c.id = coalesce(s.cycle_id, m.cycle_id)
  where
    public.is_super_admin()
    or (
      c.status = 'published'
      and coalesce(s.recipient_id, m.recipient_id) in (select employee_id from public.manager_subtree(c.id))
    );

grant select on public.v_value_matrix to authenticated;
