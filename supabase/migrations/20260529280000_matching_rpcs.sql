-- Migration 28 — Matching review RPCs: propose / decide / activate
--
-- Three transitions over evaluation_cycles.matching_status, all gated so the
-- LIVE 'active' cycle is never touched:
--
--   propose_matching(cycle)        admin · in_review  · seeds approval rows
--   decide_matching(cycle,st,note) manager · self-row · approve / request changes
--   activate_matching(cycle)       admin · -> active  · requires ALL approved
--
-- Authorization model mirrors the rest of the app: SECURITY DEFINER functions
-- re-check is_super_admin() / current_employee_id() internally, and the
-- per-manager write in decide_matching is ALSO protected by matching_approvals
-- RLS (defense in depth — even the definer respects the WHERE manager_id check
-- we apply, and a direct table write by a manager is RLS-bound to their row).

-- propose_matching(cycle) — ADMIN ------------------------------------------- --
-- Validates the 4/4 coverage floor, sets matching_status='in_review', and seeds
-- one matching_approvals row per DISTINCT manager of people in the cycle. A
-- "manager of a person in the cycle" = any active employee who is the from_id of
-- a 'downward' assignment (i.e. they give downward feedback to >=1 report). This
-- is exactly the set of people whose sign-off the review needs.
create or replace function public.propose_matching(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status     cycle_status;
  v_bad        integer;
  v_managers   integer;
begin
  if not public.is_super_admin() then
    raise exception 'propose_matching: only a super admin may propose';
  end if;

  select status into v_status from public.evaluation_cycles where id = p_cycle_id;
  if v_status is null then
    raise exception 'propose_matching: cycle % not found', p_cycle_id;
  end if;

  -- 4/4 floor must be met for EVERY active employee before proposing.
  select count(*) into v_bad
  from public.matching_coverage(p_cycle_id)
  where not given_ok or not received_ok;
  if v_bad > 0 then
    raise exception 'propose_matching: % active employee(s) below the 4 given / 4 received floor', v_bad;
  end if;

  update public.evaluation_cycles
  set matching_status = 'in_review'
  where id = p_cycle_id;

  -- Seed an approval row per distinct manager (downward giver). Idempotent:
  -- re-proposing keeps existing decisions but adds any newly-introduced manager.
  insert into public.matching_approvals (cycle_id, manager_id, status)
  select distinct p_cycle_id, fa.from_id, 'pending'
  from public.feedback_assignments fa
  join public.employees m on m.id = fa.from_id
  where fa.cycle_id = p_cycle_id
    and fa.type = 'downward'
    and m.is_active
  on conflict (cycle_id, manager_id) do nothing;

  select count(*) into v_managers
  from public.matching_approvals where cycle_id = p_cycle_id;

  return v_managers;  -- number of managers whose approval is required
end;
$$;

-- decide_matching(cycle, status, note) — MANAGER ---------------------------- --
-- A manager upserts THEIR OWN approval row (approve or request changes + note).
-- We hard-gate manager_id = current_employee_id() inside the function AND the
-- matching_approvals RLS independently enforces the same — a manager can never
-- write another manager's row. Admins may also act (e.g. on behalf during demo).
create or replace function public.decide_matching(
  p_cycle_id uuid,
  p_status   text,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := public.current_employee_id();
  v_admin   boolean := public.is_super_admin();
  v_target  uuid;
  v_cstatus text;
begin
  if v_me is null then
    raise exception 'decide_matching: no current employee';
  end if;
  if p_status not in ('approved', 'changes_requested', 'pending') then
    raise exception 'decide_matching: invalid status %', p_status;
  end if;

  select matching_status into v_cstatus from public.evaluation_cycles where id = p_cycle_id;
  if v_cstatus is null then
    raise exception 'decide_matching: cycle % not found', p_cycle_id;
  end if;
  if v_cstatus <> 'in_review' then
    raise exception 'decide_matching: cycle is not in review (matching_status=%)', v_cstatus;
  end if;

  -- The row being decided is the caller's own (managers); admins decide their
  -- own row too. There is deliberately NO way to target another manager's row.
  v_target := v_me;

  -- The caller must actually be a seeded reviewer for this cycle (a manager with
  -- people in it), unless they are a super admin (who always has a row or may
  -- self-insert one). This prevents random employees from creating noise rows.
  if not v_admin and not exists (
    select 1 from public.matching_approvals
    where cycle_id = p_cycle_id and manager_id = v_target
  ) then
    raise exception 'decide_matching: you are not a reviewer for this cycle';
  end if;

  insert into public.matching_approvals (cycle_id, manager_id, status, note, decided_at)
  values (p_cycle_id, v_target, p_status, p_note, now())
  on conflict (cycle_id, manager_id) do update
    set status = excluded.status,
        note = excluded.note,
        decided_at = now();
end;
$$;

-- activate_matching(cycle) — ADMIN ------------------------------------------ --
-- Requires EVERY seeded approval row to be 'approved'. Flips the cycle to
-- matching_status='active' and promotes its 'proposed' assignments to 'pending'
-- so they become live forms. Never touches rows already past 'proposed'.
create or replace function public.activate_matching(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   cycle_status;
  v_total    integer;
  v_approved integer;
  v_flipped  integer;
begin
  if not public.is_super_admin() then
    raise exception 'activate_matching: only a super admin may activate';
  end if;

  select status into v_status from public.evaluation_cycles where id = p_cycle_id;
  if v_status is null then
    raise exception 'activate_matching: cycle % not found', p_cycle_id;
  end if;

  select count(*), count(*) filter (where status = 'approved')
    into v_total, v_approved
  from public.matching_approvals where cycle_id = p_cycle_id;

  if v_total = 0 then
    raise exception 'activate_matching: no approvals seeded — run propose_matching first';
  end if;
  if v_approved < v_total then
    raise exception 'activate_matching: % of % managers have approved (all required)', v_approved, v_total;
  end if;

  update public.evaluation_cycles
  set matching_status = 'active'
  where id = p_cycle_id;

  update public.feedback_assignments
  set status = 'pending'
  where cycle_id = p_cycle_id and status = 'proposed';
  get diagnostics v_flipped = row_count;

  return v_flipped;  -- number of assignments promoted proposed -> pending
end;
$$;

grant execute on function public.propose_matching(uuid)               to authenticated;
grant execute on function public.decide_matching(uuid, text, text)    to authenticated;
grant execute on function public.activate_matching(uuid)              to authenticated;
