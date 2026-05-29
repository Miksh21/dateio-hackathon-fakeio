-- Migration — per-report manager release of DOWNWARD feedback.
--
-- WHY THIS EXISTS
-- ---------------
-- A manager's DOWNWARD feedback about a report is identified by definition
-- (single giver = the manager). It is deliberately kept OUT of the anonymized
-- AI summary corpus (see 20260529310000) and out of the anonymized received
-- views. Instead a manager chooses, PER REPORT, whether to share their direct
-- (named) feedback with that one report. A report sees their manager's feedback
-- ONLY when BOTH hold:
--   * the manager has released it for THAT report (a downward_releases row), AND
--   * the cycle is published.
--
-- This mirrors the feedback_releases pattern (20260529200000) but is keyed at the
-- (cycle, manager, report) grain rather than (cycle, employee): feedback_releases
-- is the manager opening their OWN received upward feedback to their whole team;
-- downward_releases is the manager opening the feedback THEY GAVE to one specific
-- report. Different direction, different grain.
--
-- In feedback_assignments a DOWNWARD row is from_id = manager (giver),
-- to_id = report (recipient). So a release for (cycle, manager, report) maps to
-- (cycle, from_id, to_id) on the manager's downward assignments to that report.

-- 1) downward_releases -------------------------------------------------------
create table public.downward_releases (
  cycle_id    uuid not null references public.evaluation_cycles(id) on delete cascade,
  manager_id  uuid not null references public.employees(id),
  report_id   uuid not null references public.employees(id),
  released_at timestamptz not null default now(),
  primary key (cycle_id, manager_id, report_id)
);

create index idx_downward_releases_report  on public.downward_releases(report_id);
create index idx_downward_releases_manager on public.downward_releases(manager_id);

alter table public.downward_releases enable row level security;

-- A manager manages their OWN release rows (manager_id = me); the report may READ
-- the rows about themselves (report_id = me); a super admin may do anything.
-- Mirrors feedback_releases_* policies, extended for the report's read.
create policy downward_releases_select on public.downward_releases
  for select to authenticated
  using (
    manager_id = public.current_employee_id()
    or report_id = public.current_employee_id()
    or public.is_super_admin()
  );

create policy downward_releases_insert on public.downward_releases
  for insert to authenticated
  with check (manager_id = public.current_employee_id() or public.is_super_admin());

create policy downward_releases_delete on public.downward_releases
  for delete to authenticated
  using (manager_id = public.current_employee_id() or public.is_super_admin());

grant select, insert, delete on public.downward_releases to authenticated;

-- 2) v_manager_downward — released, IDENTIFIED downward feedback --------------
-- The manager's direct (named) feedback about a recipient, exposed ONLY when the
-- manager has released it for that report AND the cycle is published. Single
-- giver = the manager, so the giver IS shown (their name + scale/text answers) —
-- that is the whole point of this view. Self rows are impossible here (downward
-- is always from_id <> to_id), but the predicate is kept for symmetry.
--
-- Visibility gate (security_invoker = false; owner re-implements access control):
--   is_super_admin()
--   OR ( cycle published
--        AND a downward_releases row exists for (cycle, manager = giver = from_id,
--            report = recipient = to_id)
--        AND the caller is the RECIPIENT (report) OR the MANAGER (giver) ).
create or replace view public.v_manager_downward
with (security_invoker = false) as
  select
    fa.cycle_id,
    fa.to_id          as recipient_id,
    fa.from_id        as manager_id,
    g.first_name      as manager_first_name,
    g.last_name       as manager_last_name,
    q.id              as question_id,
    q.text            as question_text,
    q.type            as question_type,
    q.sort_order,
    r.scale_value,
    r.text_value,
    r.choice_value
  from public.responses r
  join public.feedback_assignments fa on fa.id = r.assignment_id
  join public.questions q             on q.id = r.question_id
  join public.employees g             on g.id = fa.from_id
  join public.evaluation_cycles c     on c.id = fa.cycle_id
  where fa.type = 'downward'
    and fa.from_id <> fa.to_id
    and (
      public.is_super_admin()
      or (
        c.status = 'published'
        and exists (
          select 1 from public.downward_releases dr
          where dr.cycle_id   = fa.cycle_id
            and dr.manager_id = fa.from_id   -- giver = manager
            and dr.report_id  = fa.to_id     -- recipient = report
        )
        and (
          fa.to_id   = public.current_employee_id()   -- the report reading their own
          or fa.from_id = public.current_employee_id() -- the manager reviewing what they shared
        )
      )
    );

grant select on public.v_manager_downward to authenticated;

comment on view public.v_manager_downward is
  'Released, IDENTIFIED downward (manager) feedback about a recipient. Gated on '
  'cycle published AND a downward_releases row for (cycle, manager=from_id, '
  'report=to_id) AND caller is the report or the manager (or super admin). '
  'security_invoker=false; giver (manager) name + scale/text shown deliberately.';
