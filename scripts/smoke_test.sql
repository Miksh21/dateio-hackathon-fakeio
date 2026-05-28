-- scripts/smoke_test.sql — post-deploy validation. Runs in ONE transaction and
-- ROLLS BACK at the end, so it never persists. Run connected as the project's
-- `postgres` role (the Supabase pooler / CLI connection uses it).
--
-- Covers: assignment generation (self / up / down / peer), the CEO<->CEO guard,
-- RLS scoping (IC sees only own; manager subtree), and the anonymization
-- threshold (suppress < anon_min_responses, reveal at the threshold).
-- Any failed check RAISEs and aborts the tx -> the run reports an error.

begin;

create temporary table t_ids on commit drop as
select
  (select id from public.employees where email = 'elon.musk@fakeio.eu')          as musk,
  (select id from public.employees where email = 'steve.jobs@fakeio.eu')         as jobs,
  (select id from public.employees where email = 'luke.skywalker@fakeio.eu')     as luke,
  (select id from public.employees where email = 'frodo.baggins@fakeio.eu')      as frodo,
  (select id from public.employees where email = 'samwise.gamgee@fakeio.eu')     as sam,
  (select id from public.employees where email = 'meriadoc.brandybuck@fakeio.eu') as merry,
  (select id from public.employees where email = 'peregrin.took@fakeio.eu')      as pippin,
  (select id from public.employees where email = 'rachel.green@fakeio.eu')       as rachel;

-- a draft cycle, threshold = 3, created by Rachel
insert into public.evaluation_cycles (id, name, status, form_start, form_end, anon_min_responses, created_by)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SMOKE', 'draft',
       now() - interval '1 day', now() + interval '7 days', 3, t.rachel
from t_ids t;

-- graph: Luke->Frodo (manages); Frodo->Sam/Merry/Pippin (manages);
--        Sam<->Merry, Sam<->Pippin (peer); Musk->Jobs (manages, CEO<->CEO).
insert into public.cycle_relationships (cycle_id, from_employee_id, to_employee_id, relationship_type)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', a, b, c::relationship_type
from (
  select (select luke from t_ids), (select frodo from t_ids),  'manages' union all
  select (select frodo from t_ids), (select sam from t_ids),   'manages' union all
  select (select frodo from t_ids), (select merry from t_ids), 'manages' union all
  select (select frodo from t_ids), (select pippin from t_ids),'manages' union all
  select (select sam from t_ids),   (select merry from t_ids), 'peer'    union all
  select (select sam from t_ids),   (select pippin from t_ids),'peer'    union all
  select (select musk from t_ids),  (select jobs from t_ids),  'manages'
) e(a, b, c);

-- generate (the in-function guard needs a super-admin JWT)
set local "request.jwt.claims" = '{"email":"rachel.green@fakeio.eu"}';
select public.generate_assignments('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local "request.jwt.claims" = '{}';

-- 1) self = every active employee; up/down/peer counts; CEO<->CEO skipped
do $$
declare n_self int; n_active int; n_down int; n_up int; n_peer int; n_ceo int;
begin
  select count(*) into n_self from public.feedback_assignments
    where cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and type='self';
  select count(*) into n_active from public.employees where is_active;
  if n_self <> n_active then raise exception 'self % <> active %', n_self, n_active; end if;

  select count(*) into n_down from public.feedback_assignments where cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and type='downward';
  select count(*) into n_up   from public.feedback_assignments where cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and type='upward';
  select count(*) into n_peer from public.feedback_assignments where cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and type='peer';
  if n_down <> 4 then raise exception 'downward % <> 4', n_down; end if;
  if n_up   <> 4 then raise exception 'upward % <> 4',   n_up;   end if;
  if n_peer <> 4 then raise exception 'peer % <> 4',     n_peer; end if;

  select count(*) into n_ceo from public.feedback_assignments fa, t_ids t
   where fa.cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and fa.from_id in (t.musk, t.jobs) and fa.to_id in (t.musk, t.jobs)
     and fa.from_id <> fa.to_id;
  if n_ceo <> 0 then raise exception 'CEO<->CEO not skipped: % rows', n_ceo; end if;

  raise notice 'OK gen: self=% (=active) down=4 up=4 peer=4, CEO<->CEO skipped', n_self;
end $$;

-- 2) RLS: IC (Sam) sees only their own assignments (self + upward + 2 peer = 4)
set local role authenticated;
set local "request.jwt.claims" = '{"email":"samwise.gamgee@fakeio.eu"}';
do $$
declare n int;
begin
  select count(*) into n from public.feedback_assignments;
  if n <> 4 then raise exception 'RLS: Sam should see 4 own, saw %', n; end if;
  raise notice 'OK RLS: IC sees only own assignments (4)';
end $$;
reset role;
set local "request.jwt.claims" = '{}';

-- 3) RLS: manager subtree (Frodo) = Sam, Merry, Pippin
set local role authenticated;
set local "request.jwt.claims" = '{"email":"frodo.baggins@fakeio.eu"}';
do $$
declare n int;
begin
  select count(*) into n from public.manager_subtree('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  if n <> 3 then raise exception 'subtree(Frodo) should be 3, got %', n; end if;
  raise notice 'OK RLS: manager_subtree(Frodo)=3';
end $$;
reset role;
set local "request.jwt.claims" = '{}';

-- anonymization setup: 1 scale question, publish, 2 responses about Sam
insert into public.questions (cycle_id, text, type, category, target_assignment_types, sort_order)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Smoke Q', 'scale_5', 'general',
        array['self','upward','downward','peer'], 1);

insert into public.responses (assignment_id, question_id, scale_value)
select fa.id, q.id, 4
from public.feedback_assignments fa
join public.questions q on q.cycle_id = fa.cycle_id and q.text = 'Smoke Q'
where fa.cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and fa.to_id   = (select sam   from t_ids)
  and fa.from_id = (select frodo from t_ids) and fa.type='downward';

insert into public.responses (assignment_id, question_id, scale_value)
select fa.id, q.id, 5
from public.feedback_assignments fa
join public.questions q on q.cycle_id = fa.cycle_id and q.text = 'Smoke Q'
where fa.cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and fa.to_id   = (select sam   from t_ids)
  and fa.from_id = (select merry from t_ids) and fa.type='peer';

update public.evaluation_cycles set status='published', published_at=now()
 where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 4) threshold: 2 responses (< 3) -> recipient sees nothing
set local role authenticated;
set local "request.jwt.claims" = '{"email":"samwise.gamgee@fakeio.eu"}';
do $$
declare n int;
begin
  select count(*) into n from public.v_received_aggregated
   where cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'threshold: expected suppression at 2 responses, got % rows', n; end if;
  raise notice 'OK anon: suppressed below threshold (2 < 3)';
end $$;
reset role;
set local "request.jwt.claims" = '{}';

-- add a 3rd response (Pippin -> Sam) to reach the threshold
insert into public.responses (assignment_id, question_id, scale_value)
select fa.id, q.id, 3
from public.feedback_assignments fa
join public.questions q on q.cycle_id = fa.cycle_id and q.text = 'Smoke Q'
where fa.cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and fa.to_id   = (select sam    from t_ids)
  and fa.from_id = (select pippin from t_ids) and fa.type='peer';

-- 5) threshold: 3 responses -> recipient sees aggregate (count=3, avg=4.00)
set local role authenticated;
set local "request.jwt.claims" = '{"email":"samwise.gamgee@fakeio.eu"}';
do $$
declare c int; a numeric;
begin
  select response_count, avg_scale into c, a from public.v_received_aggregated
   where cycle_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c is null   then raise exception 'threshold: expected a row at 3 responses, got none'; end if;
  if c <> 3      then raise exception 'threshold: expected count 3, got %', c; end if;
  raise notice 'OK anon: revealed at threshold (count=%, avg=%)', c, a;
end $$;
reset role;
set local "request.jwt.claims" = '{}';

do $$ begin raise notice '*** ALL SMOKE CHECKS PASSED ***'; end $$;

rollback;
