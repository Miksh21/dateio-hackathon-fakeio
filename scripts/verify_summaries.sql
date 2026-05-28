-- Did the n8n flow write AI summaries?
do $$
declare n int; s text;
begin
  select count(*) into n from public.result_summaries
   where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and scope = 'overall';
  select left(ai_summary, 160) into s from public.result_summaries
   where cycle_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and scope = 'overall' and ai_summary is not null
   limit 1;
  raise notice 'result_summaries rows: % | sample summary: %', n, coalesce(s, '(none yet)');
end $$;
