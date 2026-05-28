-- Add the real admin user (jan.mikes@dateio.eu) as a super admin + active
-- participant, and (re)generate assignments so he also gets a self form.
begin;
insert into public.employees (email, first_name, last_name, division, job_title, role, is_super_admin, is_active)
values ('jan.mikes@dateio.eu', 'Jan', 'Mikeš', 'Management', 'RevOps / Admin', 'manager', true, true)
on conflict (email) do update set is_super_admin = true, is_active = true;

set local "request.jwt.claims" = '{"email":"jan.mikes@dateio.eu"}';  -- super admin gate
select public.generate_assignments('cccccccc-cccc-cccc-cccc-cccccccccccc');

do $$
declare n int;
begin
  select count(*) into n
  from public.feedback_assignments fa
  join public.employees e on e.id = fa.from_id
  where fa.cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and e.email = 'jan.mikes@dateio.eu';
  raise notice 'jan.mikes@dateio.eu assignments: %', n;
end $$;
commit;
