-- Migration 17 — Release workflow + peer visibility + raw upward view
--
-- Three things, all building on the §8/§9 security model (SECURITY DEFINER
-- helpers resolve the CALLER's JWT email; the *received* views run with owner
-- rights via security_invoker=false and re-implement access control inside):
--
--   1) feedback_releases — a per-manager, per-cycle flag. A manager toggles
--      their OWN release to let their reports read their (the manager's) raw,
--      identified upward feedback. Admins can manage any. RLS-protected.
--
--   2) PEER visibility added to the four aggregated/anonymised received views
--      (v_received_aggregated, v_received_text_anon, v_received_aggregated_by_type,
--      v_received_text_by_type). A non-admin viewer V now also sees target T's
--      anonymised aggregates when V and T are PEERS. Peers = same reporting_to_id
--      (both non-null co-reports) OR an explicit `peer` edge in cycle_relationships
--      (either direction). Threshold + giver masking are UNCHANGED.
--
--   3) v_received_raw — individual, IDENTIFIED responses about a recipient T,
--      readable by anyone BELOW T in the cycle's `manages` graph, but only after
--      T has released (feedback_releases row exists). No threshold; giver shown.
--      Self rows excluded. This is the deliberate "your team can read your raw
--      upward feedback once you choose to share it" capability.

-- 1) feedback_releases -------------------------------------------------------
create table public.feedback_releases (
  cycle_id    uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  released_at timestamptz not null default now(),
  primary key (cycle_id, employee_id)
);

create index idx_feedback_releases_employee on public.feedback_releases(employee_id);

alter table public.feedback_releases enable row level security;

-- A manager sees/toggles their OWN release; a super admin may manage any.
create policy feedback_releases_select on public.feedback_releases
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_super_admin());

create policy feedback_releases_insert on public.feedback_releases
  for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_super_admin());

create policy feedback_releases_delete on public.feedback_releases
  for delete to authenticated
  using (employee_id = public.current_employee_id() or public.is_super_admin());

grant select, insert, delete on public.feedback_releases to authenticated;

-- helpers --------------------------------------------------------------------

-- are_peers(cycle, a, b): true when a and b are peers in the cycle, i.e.
--   * they share the same (non-null) reporting_to_id (co-reports), OR
--   * an explicit `peer` edge exists between them (either direction).
-- SECURITY DEFINER so the *received* views (owner-rights) can call it; it takes
-- explicit ids and does not read the JWT, so it is safe to run as definer.
create or replace function public.are_peers(p_cycle_id uuid, a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a <> b and (
    -- co-reports: same original manager, both non-null
    exists (
      select 1
      from public.employees ea
      join public.employees eb on eb.id = b
      where ea.id = a
        and ea.reporting_to_id is not null
        and eb.reporting_to_id is not null
        and ea.reporting_to_id = eb.reporting_to_id
    )
    -- explicit peer edge in the cycle graph, either direction
    or exists (
      select 1 from public.cycle_relationships cr
      where cr.cycle_id = p_cycle_id
        and cr.relationship_type = 'peer'
        and (
          (cr.from_employee_id = a and cr.to_employee_id = b)
          or (cr.from_employee_id = b and cr.to_employee_id = a)
        )
    )
  )
$$;

-- manages_descendant(cycle, manager, descendant): walk the `manages` graph DOWN
-- from p_manager and return whether p_descendant is reachable. Unlike
-- manager_subtree() (which is anchored to the CALLER), this takes an explicit
-- root, so the raw view can ask "is the caller below recipient T?". UNION (not
-- ALL) dedupes and guards against accidental cycles in the admin-drawn graph.
create or replace function public.manages_descendant(p_cycle_id uuid, p_manager uuid, p_descendant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive sub as (
    select cr.to_employee_id as employee_id
    from public.cycle_relationships cr
    where cr.cycle_id = p_cycle_id
      and cr.relationship_type = 'manages'
      and cr.from_employee_id = p_manager
    union
    select cr.to_employee_id
    from public.cycle_relationships cr
    join sub on cr.from_employee_id = sub.employee_id
    where cr.cycle_id = p_cycle_id
      and cr.relationship_type = 'manages'
  )
  select exists (select 1 from sub where employee_id = p_descendant)
$$;

grant execute on function public.are_peers(uuid, uuid, uuid)            to authenticated;
grant execute on function public.manages_descendant(uuid, uuid, uuid)   to authenticated;

-- 2) expand the four aggregated/anonymised views to include PEERS ------------
-- Only the visibility predicate changes: an extra
--   or public.are_peers(fa.cycle_id, public.current_employee_id(), fa.to_id)
-- branch is added next to the existing self / ceo / manager_subtree branches.
-- Threshold (>= anon_min_responses unless super admin) and giver masking
-- (from_id never selected) are preserved exactly.

create or replace view public.v_received_aggregated
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
            or public.are_peers(fa.cycle_id, public.current_employee_id(), fa.to_id)
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

create or replace view public.v_received_text_anon
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
            or public.are_peers(fa.cycle_id, public.current_employee_id(), fa.to_id)
          )
        )
      )
  )
  select cycle_id, recipient_id, question_id, response_id, text_value
  from base
  where grp_count >= anon_min_responses or public.is_super_admin();

create or replace view public.v_received_aggregated_by_type
with (security_invoker = false) as
  with base as (
    select
      fa.cycle_id,
      fa.to_id            as recipient_id,
      fa.type             as assignment_type,
      r.question_id,
      r.scale_value,
      c.anon_min_responses
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    join public.evaluation_cycles c     on c.id = fa.cycle_id
    where fa.from_id <> fa.to_id
      and (
        public.is_super_admin()
        or (
          c.status = 'published'
          and (
            fa.to_id = public.current_employee_id()
            or public.my_role() = 'ceo'
            or fa.to_id in (select employee_id from public.manager_subtree(fa.cycle_id))
            or public.are_peers(fa.cycle_id, public.current_employee_id(), fa.to_id)
          )
        )
      )
  )
  select
    base.cycle_id,
    base.recipient_id,
    base.assignment_type,
    base.question_id,
    count(*)::int                          as response_count,
    avg(base.scale_value)::numeric(10, 2)  as avg_scale
  from base
  group by base.cycle_id, base.recipient_id, base.assignment_type, base.question_id, base.anon_min_responses
  having count(*) >= base.anon_min_responses or public.is_super_admin();

create or replace view public.v_received_text_by_type
with (security_invoker = false) as
  with base as (
    select
      fa.cycle_id,
      fa.to_id      as recipient_id,
      fa.type       as assignment_type,
      r.question_id,
      r.id          as response_id,
      r.text_value,
      c.anon_min_responses,
      count(*) over (partition by fa.cycle_id, fa.to_id, fa.type, r.question_id) as grp_count
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
            or public.are_peers(fa.cycle_id, public.current_employee_id(), fa.to_id)
          )
        )
      )
  )
  select cycle_id, recipient_id, assignment_type, question_id, response_id, text_value
  from base
  where grp_count >= anon_min_responses or public.is_super_admin();

-- 3) v_received_raw — raw, identified, downward-readable after release --------
-- Givers ARE shown (the whole point), no anonymisation threshold. Gate:
--   is_super_admin()
--   OR ( cycle published
--        AND recipient has released (feedback_releases row)
--        AND the caller is somewhere BELOW the recipient in the manages graph ).
-- Self rows excluded (from_id <> to_id) — self-assessment isn't "received".
create or replace view public.v_received_raw
with (security_invoker = false) as
  select
    fa.cycle_id,
    fa.to_id          as recipient_id,
    q.id              as question_id,
    q.text            as question_text,
    q.type            as question_type,
    q.sort_order,
    fa.from_id        as giver_id,
    g.first_name      as giver_first_name,
    g.last_name       as giver_last_name,
    fa.type           as assignment_type,
    r.scale_value,
    r.text_value,
    r.choice_value
  from public.responses r
  join public.feedback_assignments fa on fa.id = r.assignment_id
  join public.questions q             on q.id = r.question_id
  join public.employees g             on g.id = fa.from_id
  join public.evaluation_cycles c     on c.id = fa.cycle_id
  where fa.from_id <> fa.to_id
    and (
      public.is_super_admin()
      or (
        c.status = 'published'
        and exists (
          select 1 from public.feedback_releases fr
          where fr.cycle_id = fa.cycle_id and fr.employee_id = fa.to_id
        )
        and public.manages_descendant(fa.cycle_id, fa.to_id, public.current_employee_id())
      )
    );

grant select on public.v_received_raw to authenticated;
