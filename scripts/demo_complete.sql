-- Demo: mark ~80% of the cycle's assignments submitted so the completion report
-- shows realistic done/missing (the synthetic responses didn't flip status).
update public.feedback_assignments
set status = 'submitted', submitted_at = now()
where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  and status <> 'submitted'
  and abs(hashtextextended(id::text, 0)) % 5 <> 0;  -- leave ~1 in 5 pending

do $$
declare s int; t int;
begin
  select count(*) filter (where status = 'submitted'), count(*) into s, t
  from public.feedback_assignments
  where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  raise notice 'demo assignments submitted: %/%', s, t;
end $$;
