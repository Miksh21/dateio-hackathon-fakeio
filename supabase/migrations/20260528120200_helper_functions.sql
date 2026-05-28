-- Migration 3 — Security-definer helper functions (DESIGN.md §8)
-- These resolve the authenticated Supabase user (JWT email) -> employees row.
-- SECURITY DEFINER + owned by the migration role so they bypass RLS on
-- employees. That is deliberate: it lets the employees RLS policy call
-- current_employee_id() without infinite recursion.

create or replace function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select e.id from public.employees e
  where lower(e.email) = lower(auth.jwt() ->> 'email')
  limit 1
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select e.is_super_admin from public.employees e
     where lower(e.email) = lower(auth.jwt() ->> 'email')
     limit 1),
    false)
$$;

create or replace function public.my_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select e.role from public.employees e
  where lower(e.email) = lower(auth.jwt() ->> 'email')
  limit 1
$$;

-- All descendants of the current user in a cycle's `manages` graph (§8/§11.6).
-- A `manages` edge is from_employee_id (manager) -> to_employee_id (report),
-- so we walk from -> to. UNION (not UNION ALL) dedupes and guards against
-- accidental cycles the admin might draw in the graph.
create or replace function public.manager_subtree(p_cycle_id uuid)
returns table (employee_id uuid)
language sql stable security definer set search_path = public
as $$
  with recursive sub as (
    select cr.to_employee_id as employee_id
    from public.cycle_relationships cr
    where cr.cycle_id = p_cycle_id
      and cr.relationship_type = 'manages'
      and cr.from_employee_id = public.current_employee_id()
    union
    select cr.to_employee_id
    from public.cycle_relationships cr
    join sub on cr.from_employee_id = sub.employee_id
    where cr.cycle_id = p_cycle_id
      and cr.relationship_type = 'manages'
  )
  select employee_id from sub
$$;

-- Forms are writable only inside the window and before the deadline (§8/§10).
create or replace function public.form_is_open(p_cycle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.evaluation_cycles c
    where c.id = p_cycle_id
      and (c.form_start is null or now() >= c.form_start)
      and (c.form_end   is null or now() <= c.form_end)
  )
$$;

grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_super_admin()      to authenticated;
grant execute on function public.my_role()             to authenticated;
grant execute on function public.manager_subtree(uuid) to authenticated;
grant execute on function public.form_is_open(uuid)    to authenticated;
