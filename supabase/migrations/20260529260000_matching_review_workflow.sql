-- Migration 26 — Matching review: gating column, approvals table, coverage fn
--
-- The "matching review" human-in-the-loop layer. After an admin generates the
-- assignment graph, each manager Approves (or Requests changes on) the matching
-- for their own people; once everyone approves, the admin Activates and the
-- proposed assignments go live. ALL of this is gated on
-- evaluation_cycles.matching_status, which is backfilled to 'active' for every
-- existing cycle so the LIVE published cycle is completely unaffected.
--
-- Mirrors the feedback_releases RLS pattern (migration 17): the per-manager row
-- is self-serve (manager_id = current_employee_id()), super admin sees/does all.

-- 1) gating column on evaluation_cycles --------------------------------------
-- draft      : not yet generated for review
-- in_review  : generated; awaiting manager approvals
-- approved    : all managers approved; awaiting admin activation
-- active     : matching is live (assignments visible/fillable). Existing cycles
--              backfill to 'active' so nothing about the live cycle changes.
alter table public.evaluation_cycles
  add column if not exists matching_status text not null default 'active'
  check (matching_status in ('draft', 'in_review', 'approved', 'active'));

-- Backfill every pre-existing cycle to 'active' (idempotent; the column default
-- already makes new-by-this-migration rows 'active', but be explicit).
update public.evaluation_cycles set matching_status = 'active'
where matching_status is null;

comment on column public.evaluation_cycles.matching_status is
  'Matching review gate: draft -> in_review -> approved -> active. Live/legacy cycles are active so the new gating never blocks them.';

-- 2) matching_approvals — one row per (cycle, manager) -----------------------
create table if not exists public.matching_approvals (
  cycle_id   uuid not null references public.evaluation_cycles(id) on delete cascade,
  manager_id uuid not null references public.employees(id),
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'changes_requested')),
  note       text,
  decided_at timestamptz,
  primary key (cycle_id, manager_id)
);

create index if not exists idx_matching_approvals_manager
  on public.matching_approvals(manager_id);

alter table public.matching_approvals enable row level security;

-- A manager selects/updates ONLY their own row; a super admin sees/does all.
-- INSERT is allowed for self or admin (propose_matching seeds rows as definer,
-- but allowing self-insert keeps the upsert in decide_matching robust).
drop policy if exists matching_approvals_select on public.matching_approvals;
create policy matching_approvals_select on public.matching_approvals
  for select to authenticated
  using (manager_id = public.current_employee_id() or public.is_super_admin());

drop policy if exists matching_approvals_insert on public.matching_approvals;
create policy matching_approvals_insert on public.matching_approvals
  for insert to authenticated
  with check (manager_id = public.current_employee_id() or public.is_super_admin());

drop policy if exists matching_approvals_update on public.matching_approvals;
create policy matching_approvals_update on public.matching_approvals
  for update to authenticated
  using (manager_id = public.current_employee_id() or public.is_super_admin())
  with check (manager_id = public.current_employee_id() or public.is_super_admin());

grant select, insert, update on public.matching_approvals to authenticated;

-- 3) matching_coverage(cycle) — per-employee give/receive counts --------------
-- For every ACTIVE employee, count DISTINCT counterparts (self excluded):
--   given_count    = distinct to_id   among assignments where from_id = emp
--   received_count = distinct from_id among assignments where to_id   = emp
-- given_ok / received_ok = counts >= 4 (the minimum-4 floor; 4 >= anon_min=3 so
-- aggregates always clear the anonymity threshold). Counts ALL assignment rows
-- regardless of status (proposed and pending alike represent planned feedback).
-- SECURITY DEFINER so the service role / admin panel can read coverage past RLS;
-- it returns only aggregate counts (no giver identities), so it leaks nothing.
create or replace function public.matching_coverage(p_cycle_id uuid)
returns table (
  employee_id    uuid,
  first_name     text,
  last_name      text,
  division       text,
  given_count    integer,
  received_count integer,
  given_ok       boolean,
  received_ok    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.first_name,
    e.last_name,
    e.division,
    coalesce(g.cnt, 0)::int                         as given_count,
    coalesce(r.cnt, 0)::int                         as received_count,
    (coalesce(g.cnt, 0) >= 4)                        as given_ok,
    (coalesce(r.cnt, 0) >= 4)                        as received_ok
  from public.employees e
  left join (
    select fa.from_id as emp, count(distinct fa.to_id) as cnt
    from public.feedback_assignments fa
    where fa.cycle_id = p_cycle_id
      and fa.from_id <> fa.to_id
    group by fa.from_id
  ) g on g.emp = e.id
  left join (
    select fa.to_id as emp, count(distinct fa.from_id) as cnt
    from public.feedback_assignments fa
    where fa.cycle_id = p_cycle_id
      and fa.from_id <> fa.to_id
    group by fa.to_id
  ) r on r.emp = e.id
  where e.is_active
  order by e.last_name, e.first_name;
$$;

grant execute on function public.matching_coverage(uuid) to authenticated;
