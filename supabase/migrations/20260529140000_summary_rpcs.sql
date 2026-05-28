-- Migration 11 — helper RPCs for the n8n + OpenAI summary flow.
-- Keep aggregation in Postgres so the n8n workflow stays simple/robust.
-- SECURITY DEFINER: n8n calls these with the service key (reads past RLS).

-- Recipients in a cycle who received feedback from >= anon_min_responses givers
-- (respects the anonymity threshold — no AI summary for under-threshold people).
create or replace function public.recipients_for_summary(p_cycle_id uuid)
returns table (recipient_id uuid)
language sql stable security definer set search_path = public
as $$
  select fa.to_id
  from public.feedback_assignments fa
  join public.responses r            on r.assignment_id = fa.id
  join public.evaluation_cycles c    on c.id = fa.cycle_id
  where fa.cycle_id = p_cycle_id and fa.from_id <> fa.to_id
  group by fa.to_id, c.anon_min_responses
  having count(distinct fa.from_id) >= c.anon_min_responses
$$;

-- One recipient's aggregated feedback as JSON, for feeding to the LLM.
create or replace function public.feedback_summary_input(p_cycle_id uuid, p_recipient_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'recipient', (
      select jsonb_build_object('first_name', e.first_name, 'last_name', e.last_name, 'job_title', e.job_title)
      from public.employees e where e.id = p_recipient_id
    ),
    'ratings', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'question', q.text, 'category', q.category,
               'avg', round(x.avg_scale, 2), 'responses', x.cnt
             ) order by q.sort_order), '[]'::jsonb)
      from (
        select r.question_id, avg(r.scale_value) as avg_scale, count(*) as cnt
        from public.responses r
        join public.feedback_assignments fa on fa.id = r.assignment_id
        where fa.cycle_id = p_cycle_id and fa.to_id = p_recipient_id
          and fa.from_id <> fa.to_id and r.scale_value is not null
        group by r.question_id
      ) x
      join public.questions q on q.id = x.question_id
    ),
    'comments', (
      select coalesce(jsonb_agg(r.text_value), '[]'::jsonb)
      from public.responses r
      join public.feedback_assignments fa on fa.id = r.assignment_id
      where fa.cycle_id = p_cycle_id and fa.to_id = p_recipient_id
        and fa.from_id <> fa.to_id and r.text_value is not null
        and length(btrim(r.text_value)) > 0
    )
  )
$$;

grant execute on function public.recipients_for_summary(uuid)        to service_role, authenticated;
grant execute on function public.feedback_summary_input(uuid, uuid)  to service_role, authenticated;
