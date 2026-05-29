-- Migration 14 — Original vs Updated relationships + auto-peers (co-reports)
--
-- Decisions (confirmed with admin):
--   * "original" relationship = the real HR reporting line (employees.reporting_to_id).
--     "updated" relationship  = anything drawn/changed in the graph editor.
--   * Feedback model = MIXED:
--       - upward / downward FOLLOW the edited graph (cycle_relationships manages edges)
--       - peer groups are ANCHORED to the ORIGINAL manager: everyone who shares the
--         same reporting_to_id is a mutual peer (computed here, not stored as edges).
--   * Auto-peers are computed at generation time (not drawn on the canvas).
--
-- This migration:
--   1) adds cycle_relationships.origin ('original' | 'updated') + backfills it
--   2) rewrites generate_assignments to add the co-report auto-peer rule

-- 1) origin marker -----------------------------------------------------------
alter table public.cycle_relationships
  add column if not exists origin text not null default 'updated'
  check (origin in ('original', 'updated'));

-- Backfill: a manages edge that mirrors the real reporting line is "original";
-- everything else (re-pointed managers, manually added managers, peer edges) is
-- an admin edit -> "updated".
update public.cycle_relationships cr
set origin = case
  when cr.relationship_type = 'manages'
       and exists (
         select 1 from public.employees r
         where r.id = cr.to_employee_id
           and r.reporting_to_id = cr.from_employee_id
       )
    then 'original'
  else 'updated'
end;

comment on column public.cycle_relationships.origin is
  'original = mirrors employees.reporting_to_id (real org); updated = admin edit in the graph editor';

-- 2) generate_assignments — add the co-report auto-peer rule ------------------
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

  -- 1) self — one per active participant
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type)
  select p_cycle_id, e.id, e.id, 'self'::assignment_type
  from public.employees e
  where e.is_active
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  -- 2a) manages -> downward (manager -> report)  [follows the edited graph]
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type)
  select cr.cycle_id, cr.from_employee_id, cr.to_employee_id, 'downward'::assignment_type
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
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type)
  select cr.cycle_id, cr.to_employee_id, cr.from_employee_id, 'upward'::assignment_type
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
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type)
  select cr.cycle_id, cr.from_employee_id, cr.to_employee_id, 'peer'::assignment_type
  from public.cycle_relationships cr
  join public.employees a on a.id = cr.from_employee_id
  join public.employees b on b.id = cr.to_employee_id
  where cr.cycle_id = p_cycle_id
    and cr.relationship_type = 'peer'
    and a.is_active and b.is_active
    and not (a.role = 'ceo' and b.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  insert into public.feedback_assignments (cycle_id, from_id, to_id, type)
  select cr.cycle_id, cr.to_employee_id, cr.from_employee_id, 'peer'::assignment_type
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
  -- This is the "all direct reportees of a manager are peers" rule, anchored to
  -- the real org so it is stable regardless of graph edits. Both directions.
  insert into public.feedback_assignments (cycle_id, from_id, to_id, type)
  select p_cycle_id, a.id, b.id, 'peer'::assignment_type
  from public.employees a
  join public.employees b
    on a.reporting_to_id = b.reporting_to_id
   and a.id <> b.id
  where a.reporting_to_id is not null
    and a.is_active and b.is_active
    and not (a.role = 'ceo' and b.role = 'ceo')
  on conflict (cycle_id, from_id, to_id, type) do nothing;
  get diagnostics v_n = row_count; v_inserted := v_inserted + v_n;

  return v_inserted;
end;
$$;

grant execute on function public.generate_assignments(uuid) to authenticated;
