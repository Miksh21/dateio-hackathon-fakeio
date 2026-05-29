-- Migration 18 — restrict the demo login picker to the demo aliases + admins.
-- The login picker reads demo_roster(); for the demo we only want the five
-- @dateio.eu aliases plus any super-admin (shown with role/admin tags).
create or replace function public.demo_roster()
returns table (
  email text, first_name text, last_name text, role app_role, division text, is_super_admin boolean
)
language sql stable security definer set search_path = public
as $$
  select email, first_name, last_name, role, division, is_super_admin
  from public.employees
  where is_active = true
    and (is_super_admin or email ilike '%@dateio.eu')
  order by is_super_admin desc, last_name, first_name
$$;
grant execute on function public.demo_roster() to anon, authenticated;
