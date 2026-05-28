-- Migration 6 — Assignment generator (DESIGN.md §4)
--
-- generate_assignments(cycle_id): builds feedback_assignments from the
-- admin-drawn cycle_relationships graph + active participants.
--   * self      : one per active participant (pure admins is_active=false excluded)
--   * manages m->r : downward (m->r) AND upward (r->m)
--   * peer {a,b}   : peer (a->b) AND peer (b->a)
--   * skip any edge where BOTH endpoints are CEOs
--   * idempotent  : ON CONFLICT DO NOTHING on (cycle_id, from_id, to_id, type)
--
-- Assumption (flagged for review): edge-derived assignments also require BOTH
-- endpoints is_active = true. The spec states this only for `self`; we extend
-- it to edges so no forms are generated for/about inactive people. Returns the
-- number of assignment rows actually inserted.
--
-- SECURITY DEFINER so it can insert past RLS; guarded to super admins only.

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

  -- 2a) manages -> downward (manager -> report)
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

  -- 2b) manages -> upward (report -> manager)
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

  -- 3a) peer -> a -> b
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

  -- 3b) peer -> b -> a
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

  return v_inserted;
end;
$$;

grant execute on function public.generate_assignments(uuid) to authenticated;
