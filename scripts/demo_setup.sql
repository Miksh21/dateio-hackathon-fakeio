-- Demo data: draw a `manages` graph for the seeded cycle from the Bamboo
-- reporting lines, open the cycle, and generate assignments so there's real
-- data to build/test the UI against. Idempotent. Run via scripts/run-sql.ts.
begin;
set local "request.jwt.claims" = '{"email":"rachel.green@fakeio.eu"}';  -- super admin (generate_assignments gate)

-- manages edges straight from reporting_to (manager -> report)
insert into public.cycle_relationships (cycle_id, from_employee_id, to_employee_id, relationship_type)
select 'cccccccc-cccc-cccc-cccc-cccccccccccc', e.reporting_to_id, e.id, 'manages'
from public.employees e
where e.reporting_to_id is not null and e.is_active
on conflict (cycle_id, from_employee_id, to_employee_id, relationship_type) do nothing;

-- open the cycle with a 30-day window
update public.evaluation_cycles
set status = 'open',
    form_start = now() - interval '1 day',
    form_end   = now() + interval '30 days'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

select public.generate_assignments('cccccccc-cccc-cccc-cccc-cccccccccccc');

do $$
declare nrel int; nasg int;
begin
  select count(*) into nrel from public.cycle_relationships
    where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  select count(*) into nasg from public.feedback_assignments
    where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  raise notice 'demo cycle: % manages edges, % assignments', nrel, nasg;
end $$;
commit;
