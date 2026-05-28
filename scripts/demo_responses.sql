-- Synthetic responses for the demo cycle so results dashboards have content,
-- then publish the cycle. Runs as the connection role (bypasses RLS for bulk
-- insert). Idempotent: ON CONFLICT DO NOTHING (won't clobber real answers).
begin;

insert into public.responses (assignment_id, question_id, scale_value, text_value, choice_value)
select
  fa.id,
  q.id,
  case
    when q.type = 'scale_5'  then 3 + (random() * 2)::int   -- 3..5
    when q.type = 'scale_10' then 6 + (random() * 4)::int   -- 6..10
    else null
  end,
  case when q.type = 'text' then (array[
    'Great collaborator, very reliable.',
    'Communicates clearly and listens well.',
    'Proactive and takes ownership.',
    'Could share status updates a bit earlier.',
    'Strong contributor, helps the whole team.'
  ])[1 + (random() * 4)::int] else null end,
  case when q.type = 'multi_choice' then (3 + (random() * 1)::int)::text else null end
from public.feedback_assignments fa
join public.questions q
  on q.cycle_id = fa.cycle_id
 and q.target_assignment_types @> array[fa.type::text]
where fa.cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
on conflict (assignment_id, question_id) do nothing;

update public.evaluation_cycles
set status = 'published', published_at = now()
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

do $$
declare nr int;
begin
  select count(*) into nr
  from public.responses r
  join public.feedback_assignments fa on fa.id = r.assignment_id
  where fa.cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  raise notice 'responses in demo cycle: %, status -> published', nr;
end $$;
commit;
