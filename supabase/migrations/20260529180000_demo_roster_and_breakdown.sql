-- Migration 15 — demo roster (for the all-people picker) + feedback breakdown by type
--
-- 1) demo_roster(): anon-callable list of active employees for the demo login
--    picker. DEMO ONLY — exposes the directory. Revoke/drop after the demo.
-- 2) by-type received views: same security model as v_received_aggregated /
--    v_received_text_anon (definer, giver masked, published-for-non-admins,
--    threshold-gated) but grouped ALSO by assignment_type, so the threshold is
--    enforced PER SLICE (peer / upward / downward). Self is excluded here.
-- 3) v_self_assessment: a person's own self-answers — visible to themselves or a
--    super admin (no threshold; it is their own input, not anonymous feedback).

-- 1) roster for the picker ---------------------------------------------------
create or replace function public.demo_roster()
returns table (
  email text, first_name text, last_name text, role app_role, division text, is_super_admin boolean
)
language sql stable security definer set search_path = public
as $$
  select email, first_name, last_name, role, division, is_super_admin
  from public.employees
  where is_active = true
  order by last_name, first_name
$$;
grant execute on function public.demo_roster() to anon, authenticated;

-- 2a) aggregated ratings per recipient × question × TYPE ---------------------
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

-- 2b) open-text per recipient × question × TYPE ------------------------------
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
          )
        )
      )
  )
  select cycle_id, recipient_id, assignment_type, question_id, response_id, text_value
  from base
  where grp_count >= anon_min_responses or public.is_super_admin();

-- 3) own self-assessment (no threshold; own input) ---------------------------
create or replace view public.v_self_assessment
with (security_invoker = false) as
  select
    fa.cycle_id,
    fa.to_id        as recipient_id,
    r.question_id,
    r.scale_value,
    r.text_value,
    r.choice_value
  from public.responses r
  join public.feedback_assignments fa on fa.id = r.assignment_id
  where fa.type = 'self'
    and fa.from_id = fa.to_id
    and (public.is_super_admin() or fa.to_id = public.current_employee_id());

grant select on public.v_received_aggregated_by_type to authenticated;
grant select on public.v_received_text_by_type       to authenticated;
grant select on public.v_self_assessment             to authenticated;
