-- Migration 29 — matching_review_for_manager(cycle): manager-facing read model
--
-- The feedback_assignments SELECT policy only lets a person read rows where they
-- are the GIVER. A manager reviewing the matching needs to see, for each of
-- their direct reports, WHO will review the report and WHOM the report reviews
-- (names + assignment type + the 4/4 counts) — but nothing about feedback
-- content. This SECURITY DEFINER function provides exactly that, with access
-- control baked in (mirrors the v_received_raw / are_peers definer pattern):
--
--   * super admin           -> every active employee in the cycle
--   * a manager (caller)     -> only their DIRECT reports (employees.reporting_to_id
--                              = caller). One review card per report.
--
-- Returns one row per (report, counterpart, direction): direction 'incoming'
-- means counterpart -> report (a reviewer OF the report); 'outgoing' means
-- report -> counterpart (someone the report reviews). given_count/received_count
-- are the report's own distinct counts (self excluded) so the UI can show 4/4.
-- Self rows (report==counterpart) are excluded.

create or replace function public.matching_review_for_manager(p_cycle_id uuid)
returns table (
  report_id        uuid,
  report_first     text,
  report_last      text,
  report_division  text,
  given_count      integer,
  received_count   integer,
  direction        text,    -- 'incoming' (reviewer of report) | 'outgoing' (report reviews)
  counterpart_id   uuid,
  counterpart_first text,
  counterpart_last  text,
  assignment_type  text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_employee_id() as id, public.is_super_admin() as admin),
  reports as (
    -- the set of people whose cards this caller may see
    select e.id, e.first_name, e.last_name, e.division
    from public.employees e, me
    where e.is_active
      and (me.admin or e.reporting_to_id = me.id)
  ),
  counts as (
    select r.id as report_id,
      (select count(distinct fa.to_id) from public.feedback_assignments fa
        where fa.cycle_id = p_cycle_id and fa.from_id = r.id and fa.to_id <> r.id) as given_count,
      (select count(distinct fa.from_id) from public.feedback_assignments fa
        where fa.cycle_id = p_cycle_id and fa.to_id = r.id and fa.from_id <> r.id) as received_count
    from reports r
  )
  -- incoming: counterpart -> report (reviewers of the report)
  select
    r.id, r.first_name, r.last_name, r.division,
    c.given_count::int, c.received_count::int,
    'incoming'::text,
    g.id, g.first_name, g.last_name,
    fa.type::text
  from reports r
  join counts c on c.report_id = r.id
  join public.feedback_assignments fa
    on fa.cycle_id = p_cycle_id and fa.to_id = r.id and fa.from_id <> r.id
  join public.employees g on g.id = fa.from_id
  union all
  -- outgoing: report -> counterpart (people the report reviews)
  select
    r.id, r.first_name, r.last_name, r.division,
    c.given_count::int, c.received_count::int,
    'outgoing'::text,
    t.id, t.first_name, t.last_name,
    fa.type::text
  from reports r
  join counts c on c.report_id = r.id
  join public.feedback_assignments fa
    on fa.cycle_id = p_cycle_id and fa.from_id = r.id and fa.to_id <> r.id
  join public.employees t on t.id = fa.to_id;
$$;

grant execute on function public.matching_review_for_manager(uuid) to authenticated;
