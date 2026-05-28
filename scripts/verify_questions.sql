-- Read-only check of the seeded question bank.
do $$
declare nq int; nopt int; ncs int; vs text;
begin
  select count(*) into nq  from public.questions where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  select count(*) into nopt from public.questions where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and options is not null;
  select count(*) into ncs  from public.questions where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and text_cs is not null;
  select options->0->>'cs' into vs from public.questions
    where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and code = 'value_self';
  raise notice 'questions=% | with options=% | with text_cs=% | value_self top option (cs)=%', nq, nopt, ncs, vs;
end $$;
