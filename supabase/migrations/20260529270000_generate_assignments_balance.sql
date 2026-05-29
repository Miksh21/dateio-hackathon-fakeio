-- Migration 27 — generate_assignments: 4/4 auto-balance + 'proposed' + gating
--
-- Extends the assignment generator (migrations 6/14) with the minimum-4 floor:
-- after building the relationship-driven (self/upward/downward) and co-report
-- peer assignments, every ACTIVE person must GIVE >= 4 and RECEIVE >= 4 DISTINCT
-- counterparts (self excluded). Any shortfall is topped up with deterministic,
-- greedy peer reviewers, preferring same-manager co-reports (not already paired)
-- and then same-division active employees, finally any active employee.
--
-- Two behavioural changes vs the prior version, gated so the LIVE cycle is safe:
--   * NEW assignment rows are inserted with status 'proposed' (was the table
--     default 'pending'). activate_matching() later flips 'proposed'->'pending'.
--     ON CONFLICT DO NOTHING means existing rows keep their current status.
--   * On a successful generation the cycle's matching_status is set to
--     'in_review'. (The live cycle is never re-generated, so it stays 'active'.)
--
-- Still SECURITY DEFINER, still super-admin only, still idempotent (re-running
-- never duplicates a (cycle, from, to, type) row, and never lowers a count).

create or replace function public.generate_assignments(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   cycle_status;
  v_inserted integer := 0;
  v_n        integer;
  v_target   integer := 4;            -- the minimum-4 floor
  rec        record;
  cand       record;
  v_added    integer;
  v_n2       integer;
begin
  if not public.is_super_admin() then
    raise exception 'generate_assignments: only a super admin may run this';
  end if;

  select status into v_status from public.evaluation_cycles where id = p_cycle_id;
  if v_status is null then
    raise exception 'generate_assignments: cycle % not found', p_cycle_id;
  end if;
  if v_status not in ('draft', 'open') then
    raise exception 'generate_assignments: cycle status is % (must be draft or open)', v_status;
  end if;

  ------------------------------------------------------------------------------
  -- A) Relationship-driven + co-report peers (unchanged rules; status proposed)
  ------------------------------------------------------------------------------

  -- 1) self — one per active participant
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
  select p_cycle_id, e.id, e.id, 'self'::assignment_type, 'proposed'::assignment_status
  from public.employees e
  where e.is_active
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  -- 2a) manages -> downward (manager -> report)  [follows the edited graph]
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
  select cr.cycle_id, cr.from_employee_id, cr.to_employee_id, 'downward'::assignment_type, 'proposed'::assignment_status
  from public.cycle_relationships cr
  join public.employees m on m.id = cr.from_employee_id
  join public.employees r on r.id = cr.to_employee_id
  where cr.cycle_id = p_cycle_id
    and cr.relationship_type = 'manages'
    and m.is_active and r.is_active
    and not (m.role = 'ceo' and r.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  -- 2b) manages -> upward (report -> manager)  [follows the edited graph]
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
  select cr.cycle_id, cr.to_employee_id, cr.from_employee_id, 'upward'::assignment_type, 'proposed'::assignment_status
  from public.cycle_relationships cr
  join public.employees m on m.id = cr.from_employee_id
  join public.employees r on r.id = cr.to_employee_id
  where cr.cycle_id = p_cycle_id
    and cr.relationship_type = 'manages'
    and m.is_active and r.is_active
    and not (m.role = 'ceo' and r.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  -- 3a/3b) explicit peer edges drawn by the admin (both directions)
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
  select cr.cycle_id, cr.from_employee_id, cr.to_employee_id, 'peer'::assignment_type, 'proposed'::assignment_status
  from public.cycle_relationships cr
  join public.employees a on a.id = cr.from_employee_id
  join public.employees b on b.id = cr.to_employee_id
  where cr.cycle_id = p_cycle_id
    and cr.relationship_type = 'peer'
    and a.is_active and b.is_active
    and not (a.role = 'ceo' and b.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
  select cr.cycle_id, cr.to_employee_id, cr.from_employee_id, 'peer'::assignment_type, 'proposed'::assignment_status
  from public.cycle_relationships cr
  join public.employees a on a.id = cr.from_employee_id
  join public.employees b on b.id = cr.to_employee_id
  where cr.cycle_id = p_cycle_id
    and cr.relationship_type = 'peer'
    and a.is_active and b.is_active
    and not (a.role = 'ceo' and b.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  -- 3c) AUTO-PEERS — co-reports of the same ORIGINAL manager (reporting_to_id).
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
  select p_cycle_id, a.id, b.id, 'peer'::assignment_type, 'proposed'::assignment_status
  from public.employees a
  join public.employees b
    on a.reporting_to_id = b.reporting_to_id
   and a.id <> b.id
  where a.reporting_to_id is not null
    and a.is_active and b.is_active
    and not (a.role = 'ceo' and b.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  ------------------------------------------------------------------------------
  -- B) Auto-balance to the minimum-4 floor (deterministic greedy top-up).
  --    A top-up reviewer X->T is a 'peer' edge: it raises X's GIVEN count and
  --    T's RECEIVED count at once. Self is always excluded.
  --
  --    Candidate preference (ORDER BY priority, last_name, first_name, id so it
  --    is fully deterministic): 0 = same ORIGINAL manager co-report, 1 = same
  --    division, 2 = any other active employee. We never reuse a pair that
  --    already exists in ANY type (the unique key is per-type, but we check all
  --    types so we don't, e.g., add a peer on top of an existing upward).
  ------------------------------------------------------------------------------

  -- B1) RECEIVED pass: every active T must have >= 4 DISTINCT givers.
  for rec in
    select e.id, e.division, e.reporting_to_id
    from public.employees e
    where e.is_active
    order by e.last_name, e.first_name, e.id
  loop
    -- how many distinct givers does T already have (self excluded)?
    select count(distinct fa.from_id) into v_n
    from public.feedback_assignments fa
    where fa.cycle_id = p_cycle_id and fa.to_id = rec.id and fa.from_id <> rec.id;

    v_added := 0;
    while v_n + v_added < v_target loop
      -- pick the best not-yet-paired active giver X (X <> T, no existing X->T row)
      select x.id into cand
      from public.employees x
      where x.is_active
        and x.id <> rec.id
        and not exists (
          select 1 from public.feedback_assignments fa
          where fa.cycle_id = p_cycle_id and fa.from_id = x.id and fa.to_id = rec.id
        )
        and not (x.role = 'ceo' and exists (
          select 1 from public.employees t where t.id = rec.id and t.role = 'ceo'))
      order by
        case
          when x.reporting_to_id is not null and x.reporting_to_id = rec.reporting_to_id then 0
          when x.division is not distinct from rec.division then 1
          else 2
        end,
        x.last_name, x.first_name, x.id
      limit 1;

      exit when cand is null;  -- no candidate left (tiny org); stop gracefully

      -- The NOT EXISTS guard already excluded any existing X->T row of ANY type,
      -- so this peer insert always succeeds (no conflict possible).
      insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
      values (p_cycle_id, cand.id, rec.id, 'peer'::assignment_type, 'proposed'::assignment_status)
      on conflict (cycle_id, from_id, to_id, type) do nothing;
      get diagnostics v_n2 = row_count;
      if v_n2 > 0 then v_inserted := v_inserted + 1; end if;
      v_added := v_added + 1;
      cand := null;  -- reset so a "no candidate" next iteration is detectable
    end loop;
  end loop;

  -- B2) GIVEN pass: every active G must GIVE to >= 4 DISTINCT targets.
  for rec in
    select e.id, e.division, e.reporting_to_id, e.role
    from public.employees e
    where e.is_active
    order by e.last_name, e.first_name, e.id
  loop
    select count(distinct fa.to_id) into v_n
    from public.feedback_assignments fa
    where fa.cycle_id = p_cycle_id and fa.from_id = rec.id and fa.to_id <> rec.id;

    v_added := 0;
    while v_n + v_added < v_target loop
      -- pick the best not-yet-paired active target T (T <> G, no existing G->T row)
      select y.id into cand
      from public.employees y
      where y.is_active
        and y.id <> rec.id
        and not exists (
          select 1 from public.feedback_assignments fa
          where fa.cycle_id = p_cycle_id and fa.from_id = rec.id and fa.to_id = y.id
        )
        and not (rec.role = 'ceo' and y.role = 'ceo')
      order by
        case
          when y.reporting_to_id is not null and y.reporting_to_id = rec.reporting_to_id then 0
          when y.division is not distinct from rec.division then 1
          else 2
        end,
        y.last_name, y.first_name, y.id
      limit 1;

      exit when cand is null;

      insert into public.feedback_assignments (cycle_id, from_id, to_id, type, status)
      values (p_cycle_id, rec.id, cand.id, 'peer'::assignment_type, 'proposed'::assignment_status)
      on conflict (cycle_id, from_id, to_id, type) do nothing;
      get diagnostics v_n2 = row_count;
      if v_n2 > 0 then v_inserted := v_inserted + 1; end if;
      v_added := v_added + 1;
      cand := null;
    end loop;
  end loop;

  ------------------------------------------------------------------------------
  -- C) Mark the cycle as generated-for-review (gating). Only ever moves a
  --    not-yet-active cycle into 'in_review'; never disturbs an 'active' one.
  ------------------------------------------------------------------------------
  update public.evaluation_cycles
  set matching_status = 'in_review'
  where id = p_cycle_id and matching_status <> 'active';

  return v_inserted;
end;
$$;

grant execute on function public.generate_assignments(uuid) to authenticated;
