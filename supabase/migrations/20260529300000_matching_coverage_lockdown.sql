-- Security fix — lock down matching_coverage() (review finding H1).
--
-- matching_coverage() is SECURITY DEFINER (runs as owner, bypasses RLS) but had
-- NO caller gate, and Postgres grants EXECUTE to PUBLIC by default. So the `anon`
-- role could call it as a PostgREST RPC and read the FULL active employee roster
-- (names, ids, division + give/receive counts) that RLS otherwise denies to anon.
--
-- Fix: revoke EXECUTE from public/anon, and gate the body on is_super_admin()
-- (the admin coverage panel is the only caller) so non-admins and anon get zero
-- rows. Only change to the body vs migration 20260529260000 is the added
-- `and public.is_super_admin()` predicate.

revoke execute on function public.matching_coverage(uuid) from public;
revoke execute on function public.matching_coverage(uuid) from anon;

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
    and public.is_super_admin()   -- admin-only; non-admins / anon get zero rows
  order by e.last_name, e.first_name;
$$;

grant execute on function public.matching_coverage(uuid) to authenticated;
