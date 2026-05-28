-- Migration 5 — Anonymization views (DESIGN.md §9)
--
-- These three views are the ONLY way non-admins read *received* feedback.
-- They are created with security_invoker = false ON PURPOSE: the view runs
-- with the owner's rights and therefore bypasses RLS on `responses` /
-- `feedback_assignments` (which deny recipients raw access). The access
-- control is re-implemented INSIDE each view:
--   * identity helpers (current_employee_id/my_role/manager_subtree/
--     is_super_admin) still resolve against the CALLER's JWT, because they
--     read request.jwt.claims from the session — view ownership doesn't
--     change that;
--   * giver identity (from_id) is never selected -> givers stay masked;
--   * results are gated to status='published' for non-admins (§10);
--   * aggregates/texts are suppressed below evaluation_cycles.anon_min_responses
--     (§9), except for super admins.
-- Below-threshold de-anonymisation for super admins is a separate, audit-logged
-- RPC (not these views) — see DESIGN.md §9.

-- v_my_given — the caller's own submitted feedback, un-anonymised (§9).
create view public.v_my_given
with (security_invoker = false) as
  select
    r.id            as response_id,
    fa.cycle_id,
    fa.to_id        as recipient_id,
    fa.type         as assignment_type,
    q.id            as question_id,
    q.text          as question_text,
    q.type          as question_type,
    r.scale_value,
    r.text_value,
    r.choice_value,
    r.updated_at
  from public.responses r
  join public.feedback_assignments fa on fa.id = r.assignment_id
  join public.questions q             on q.id = r.question_id
  where fa.from_id = public.current_employee_id();

-- v_received_aggregated — per recipient × question: avg scale + count,
-- excluding self-assessment, threshold-gated (§9).
create view public.v_received_aggregated
with (security_invoker = false) as
  with base as (
    select
      fa.cycle_id,
      fa.to_id            as recipient_id,
      r.question_id,
      r.scale_value,
      c.anon_min_responses
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    join public.evaluation_cycles c     on c.id = fa.cycle_id
    where fa.from_id <> fa.to_id  -- feedback from others only (exclude self)
      and (
        public.is_super_admin()
        or (
          c.status = 'published'
          and (
            fa.to_id = public.current_employee_id()
            or public.my_role() = 'ceo'
            or fa.to_id in (select employee_id from public.manager_subtree(fa.cycle_id))
          )
        )
      )
  )
  select
    base.cycle_id,
    base.recipient_id,
    base.question_id,
    count(*)::int                 as response_count,
    avg(base.scale_value)::numeric(10,2) as avg_scale
  from base
  group by base.cycle_id, base.recipient_id, base.question_id, base.anon_min_responses
  having count(*) >= base.anon_min_responses or public.is_super_admin();

-- v_received_text_anon — open-text feedback with giver masked, threshold-gated (§9).
create view public.v_received_text_anon
with (security_invoker = false) as
  with base as (
    select
      fa.cycle_id,
      fa.to_id      as recipient_id,
      r.question_id,
      r.id          as response_id,
      r.text_value,
      c.anon_min_responses,
      count(*) over (partition by fa.cycle_id, fa.to_id, r.question_id) as grp_count
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    join public.evaluation_cycles c     on c.id = fa.cycle_id
    where fa.from_id <> fa.to_id
      and r.text_value is not null
      and length(btrim(r.text_value)) > 0
      and (
        public.is_super_admin()
        or (
          c.status = 'published'
          and (
            fa.to_id = public.current_employee_id()
            or public.my_role() = 'ceo'
            or fa.to_id in (select employee_id from public.manager_subtree(fa.cycle_id))
          )
        )
      )
  )
  select cycle_id, recipient_id, question_id, response_id, text_value
  from base
  where grp_count >= anon_min_responses or public.is_super_admin();

grant select on public.v_my_given            to authenticated;
grant select on public.v_received_aggregated to authenticated;
grant select on public.v_received_text_anon  to authenticated;
