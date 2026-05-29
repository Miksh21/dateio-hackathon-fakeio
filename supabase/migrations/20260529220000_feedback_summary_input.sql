-- Migration 18 — feedback_summary_input(): privacy-safe LLM/RAG input builder.
--
-- WHY THIS EXISTS
-- ---------------
-- The n8n "summary middle-end" (and, later, Vojtěch's RAG indexer) must build a
-- per-recipient summary of the feedback a person RECEIVED. It runs as the
-- Supabase service role (bypasses RLS), so it CANNOT read the app's received
-- views: those are security_invoker=false and gate on current_employee_id() /
-- is_super_admin(), both of which are NULL/false for a service-role JWT — the
-- views would return nothing.
--
-- So this function re-implements, server-side and as an explicit admin/service
-- function, the SAME anonymisation contract the app's *_by_type received views
-- enforce (see 20260528120400_anonymization_views.sql and
-- 20260529200000_release_workflow.sql):
--
--   * SELF EXCLUDED        — fa.from_id <> fa.to_id (self-assessment is not
--                            "received" feedback).
--   * THRESHOLD-GATED      — a (question × assignment_type) group is included
--                            ONLY if it has >= evaluation_cycles.anon_min_responses
--                            responses. Mirrors the views' `having count(*) >=
--                            anon_min_responses`. Below threshold a group would
--                            de-anonymise the giver, so it is dropped entirely.
--   * GIVER-MASKED         — from_id / giver name are NEVER selected or returned.
--                            Only aggregates and the raw text answers (which are
--                            themselves only released once their group clears the
--                            threshold) leave this function.
--
-- It REPLACES the earlier, non-gated feedback_summary_input() from
-- 20260529140000_summary_rpcs.sql, which aggregated every response regardless of
-- per-group count and did not segment by assignment_type. That earlier version
-- leaked under-threshold groups to the LLM; this one does not.
--
-- CONTRACT (stable — n8n today, RAG endpoint later both consume this shape):
--   feedback_summary_input(p_cycle_id uuid, p_recipient_id uuid) -> jsonb
--   {
--     "cycle_id":      uuid,
--     "recipient_id":  uuid,
--     "anon_min_responses": int,        -- the threshold actually applied
--     "recipient": { first_name, last_name, job_title },  -- subject context only;
--                                                          -- NOT a giver identity
--     "ratings": [                       -- one row per (question × assignment_type)
--                                        -- group that cleared the threshold
--       { "code","question","question_cs","category","assignment_type",
--         "avg_scale": numeric, "response_count": int }
--       ...ordered by question sort_order, then assignment_type
--     ],
--     "comments": [                      -- masked free-text, only from groups that
--                                        -- cleared the threshold; giver unknown
--       { "code","question","question_cs","category","assignment_type",
--         "text": "..." }
--       ...ordered by question sort_order, then assignment_type
--     ]
--   }
--
-- SECURITY DEFINER + explicit ids (does NOT read the JWT) => safe to run as the
-- definer for service callers; granted to service_role (and authenticated, so a
-- super admin tool could call it too — it returns the same admin-equivalent
-- full-threshold data either way; it deliberately does NOT itself check the
-- caller, because gating happens via the threshold, not via identity).

create or replace function public.feedback_summary_input(
  p_cycle_id uuid,
  p_recipient_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cyc as (
    select c.id, c.anon_min_responses
    from public.evaluation_cycles c
    where c.id = p_cycle_id
  ),
  -- ratings: per (question × assignment_type), threshold-gated on the count of
  -- scale responses in that exact group. Mirrors v_received_aggregated_by_type.
  rating_groups as (
    select
      r.question_id,
      fa.type                                   as assignment_type,
      count(*)::int                             as response_count,
      round(avg(r.scale_value)::numeric, 2)     as avg_scale
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    cross join cyc
    where fa.cycle_id = p_cycle_id
      and fa.to_id    = p_recipient_id
      and fa.from_id <> fa.to_id            -- exclude self-assessment
      and r.scale_value is not null
    group by r.question_id, fa.type, cyc.anon_min_responses
    having count(*) >= cyc.anon_min_responses   -- threshold gate (anti de-anon)
  ),
  -- comments: free-text answers, but a group's texts are only released once the
  -- (question × assignment_type) text-group itself clears the threshold.
  -- Mirrors v_received_text_by_type (grp_count window + >= anon_min_responses).
  text_base as (
    select
      r.id          as response_id,
      r.question_id,
      fa.type       as assignment_type,
      r.text_value,
      count(*) over (partition by r.question_id, fa.type) as grp_count
    from public.responses r
    join public.feedback_assignments fa on fa.id = r.assignment_id
    where fa.cycle_id = p_cycle_id
      and fa.to_id    = p_recipient_id
      and fa.from_id <> fa.to_id            -- exclude self-assessment
      and r.text_value is not null
      and length(btrim(r.text_value)) > 0
  ),
  text_groups as (
    select tb.question_id, tb.assignment_type, tb.text_value
    from text_base tb
    cross join cyc
    where tb.grp_count >= cyc.anon_min_responses  -- threshold gate (anti de-anon)
  )
  select jsonb_build_object(
    'cycle_id',           p_cycle_id,
    'recipient_id',       p_recipient_id,
    'anon_min_responses', (select anon_min_responses from cyc),
    'recipient', (
      select jsonb_build_object(
        'first_name', e.first_name,
        'last_name',  e.last_name,
        'job_title',  e.job_title
      )
      from public.employees e
      where e.id = p_recipient_id
    ),
    'ratings', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'code',            q.code,
            'question',        q.text,
            'question_cs',     q.text_cs,
            'category',        q.category,
            'assignment_type', rg.assignment_type,
            'avg_scale',       rg.avg_scale,
            'response_count',  rg.response_count
          )
          order by q.sort_order, rg.assignment_type
        ),
        '[]'::jsonb
      )
      from rating_groups rg
      join public.questions q on q.id = rg.question_id
    ),
    'comments', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'code',            q.code,
            'question',        q.text,
            'question_cs',     q.text_cs,
            'category',        q.category,
            'assignment_type', tg.assignment_type,
            'text',            tg.text_value
          )
          order by q.sort_order, tg.assignment_type
        ),
        '[]'::jsonb
      )
      from text_groups tg
      join public.questions q on q.id = tg.question_id
    )
  )
$$;

grant execute on function public.feedback_summary_input(uuid, uuid) to service_role, authenticated;

comment on function public.feedback_summary_input(uuid, uuid) is
  'Privacy-safe per-recipient feedback input for AI summary / RAG. Self-excluded, '
  'giver-masked, and threshold-gated per (question x assignment_type) at '
  'evaluation_cycles.anon_min_responses — mirrors the v_received_*_by_type views. '
  'SECURITY DEFINER, callable by service_role (bypasses RLS). Stable JSON contract.';
