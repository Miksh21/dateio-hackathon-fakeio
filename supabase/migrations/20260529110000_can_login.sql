-- Migration 8 — can_login(email): pre-OTP login gate (DESIGN.md §1, §2)
-- True only if the email is in an allowed domain AND exists in employees.
-- SECURITY DEFINER + granted to anon so the login screen can check before
-- sending an OTP (employees is otherwise unreadable by anon).
--
-- NOTE: this reveals whether an address is an employee (enumeration). Fine for
-- the hackathon; rate-limit / gate at the edge for production. Domains are
-- hardcoded; move to a settings table if they must change without a migration.

create or replace function public.can_login(p_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where lower(e.email) = lower(p_email)
      and split_part(lower(p_email), '@', 2) = any (array['dateio.eu', 'tapix.io', 'fakeio.eu'])
  )
$$;

grant execute on function public.can_login(text) to anon, authenticated;
