-- Migration 13 — allow gmail.com in the login gate (demo: lets jan.mikes21@gmail.com
-- log in via real email, since Resend's unverified domain only delivers to that
-- address). can_login still requires the email to exist in employees, so this
-- only enables the one gmail account we add. Remove gmail.com once a real domain
-- (dateio.eu) is verified in Resend.
create or replace function public.can_login(p_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where lower(e.email) = lower(p_email)
      and split_part(lower(p_email), '@', 2) = any (array['dateio.eu', 'tapix.io', 'fakeio.eu', 'gmail.com'])
  )
$$;
