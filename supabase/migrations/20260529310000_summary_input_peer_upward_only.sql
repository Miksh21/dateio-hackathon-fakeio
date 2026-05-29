-- Migration — AI summary input = peers + reports only (exclude the manager's downward).
--
-- WHY THIS EXISTS
-- ---------------
-- The per-recipient AI summary must reflect ONLY the feedback a person received
-- from their PEERS and their OWN REPORTS (assignment types 'peer' + 'upward'),
-- and must EXCLUDE their MANAGER's feedback ('downward') and self-assessment.
-- The manager's downward feedback is single-giver and identified by definition;
-- it has its own, separate, per-report release path (see the downward_releases
-- migration) and must never be folded into the anonymized AI summary corpus.
--
-- Self ('downward' originates from the manager; self is from_id = to_id) is
-- already excluded by the existing `fa.from_id <> fa.to_id` predicate in both
-- functions; this migration adds the explicit positive filter
--   and fa.type in ('peer','upward')
-- to EVERY feedback_assignments scan in BOTH SECURITY DEFINER input builders the
-- pipeline can call:
--   * public.feedback_ingestion_payload  — the function the live n8n summary
--     workflow (CaU6TbuazSSUrTc9, node "Get privacy-safe input") actually calls,
--     and the GENERATE-stage proportionality source. ALSO feeds the future chat
--     embeddings ingester; the chat corpus keeps its old chunks until re-ingested
--     (acceptable — this migration targets the summaries).
--   * public.feedback_summary_input      — the sibling builder (mirrors the
--     v_received_*_by_type contract), kept in lock-step so either entry point
--     yields the same peer+upward-only corpus.
--
-- NOTE on threshold interaction: a person normally has exactly one manager, so
-- 'downward' feedback is single-giver and ALREADY dropped by the existing
-- `having count(...) >= anon_min_responses` gate. This filter is therefore an
-- explicit, threshold-independent CONTRACT guarantee (downward never reaches the
-- LLM even if the threshold is lowered or a re-org leaves multiple downward
-- givers), not merely a re-statement of the threshold. Both functions preserve
-- their existing threshold gating + giver masking EXACTLY; only the positive
-- type filter is added. Bodies below are reproduced verbatim from
-- 20260529230000_feedback_chunks_vector.sql and 20260529220000_feedback_summary_input.sql
-- with that single added predicate.

-- 1) feedback_ingestion_payload (live workflow input + RAG ingester) ----------
create or replace function public.feedback_ingestion_payload(
  p_cycle_id     uuid,
  p_recipient_id uuid
)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with cyc as (
    select c.id, c.anon_min_responses
    from public.evaluation_cycles c
    where c.id = p_cycle_id
  )
  select jsonb_build_object(
    'recipient', (
      select jsonb_build_object(
        'id',         e.id::text,
        'first_name', e.first_name,
        'last_name',  e.last_name,
        'job_title',  coalesce(e.job_title, 'Employee')
      )
      from public.employees e where e.id = p_recipient_id
    ),
    'anon_min_responses', (select anon_min_responses from cyc),
    'question_groups', (
      select coalesce(
        jsonb_agg(g order by (g->>'assignment_type'), (g->>'sort_order')::int),
        '[]'::jsonb
      )
      from (
        select jsonb_build_object(
          'question_id',     q.id::text,
          'question_text',   q.text,
          'category',        coalesce(q.category, 'General'),
          'sort_order',      q.sort_order,
          'assignment_type', fa.type::text,
          'total_givers',    count(distinct fa.from_id),
          'giver_count',     count(r.id) filter (
                               where r.text_value is not null
                                 and length(btrim(r.text_value)) > 0
                             ),
          'comments', coalesce(
            jsonb_agg(r.text_value order by r.created_at)
            filter (where r.text_value is not null and length(btrim(r.text_value)) > 0),
            '[]'::jsonb
          )
        ) as g
        from public.responses r
        join public.feedback_assignments fa on fa.id = r.assignment_id
        join public.questions q             on q.id  = r.question_id
        cross join cyc
        where fa.cycle_id  = p_cycle_id
          and fa.to_id     = p_recipient_id
          and fa.from_id  <> fa.to_id            -- exclude self-assessment
          and fa.type in ('peer','upward')       -- peers + reports only; exclude manager's downward
          and fa.status    = 'submitted'
        group by q.id, q.text, q.category, q.sort_order, fa.type, cyc.anon_min_responses
        -- FIX 1: threshold gate (anti de-anon) — was `> 0` in the PR.
        having count(r.id) filter (
          where r.text_value is not null and length(btrim(r.text_value)) > 0
        ) >= cyc.anon_min_responses
      ) sub
    ),
    'ratings', (
      -- Inner subquery aggregates per (question x type) and builds the JSON object
      -- at the grouped level; the outer jsonb_agg then collects those objects. The
      -- subquery boundary is required — jsonb_agg wrapped directly around
      -- avg()/count() nests aggregates (Postgres: "aggregate function calls cannot
      -- be nested").
      select coalesce(jsonb_agg(g order by (g->>'sort_order')::int), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'question_text',   q.text,
          'category',        coalesce(q.category, 'General'),
          'assignment_type', fa.type::text,
          'avg_score',       round(avg(r.scale_value)::numeric, 2),
          'response_count',  count(r.id),
          'total_givers',    count(distinct fa.from_id),
          'sort_order',      q.sort_order
        ) as g
        from public.responses r
        join public.feedback_assignments fa on fa.id = r.assignment_id
        join public.questions q             on q.id  = r.question_id
        cross join cyc
        where fa.cycle_id  = p_cycle_id
          and fa.to_id     = p_recipient_id
          and fa.from_id  <> fa.to_id              -- exclude self-assessment
          and fa.type in ('peer','upward')         -- peers + reports only; exclude manager's downward
          and fa.status    = 'submitted'
          and r.scale_value is not null
        group by q.id, q.text, q.category, q.sort_order, fa.type, cyc.anon_min_responses
        -- FIX 1: gate rating groups on distinct givers >= threshold too.
        having count(distinct fa.from_id) >= cyc.anon_min_responses
      ) sub
    )
  )
$$;

comment on function public.feedback_ingestion_payload(uuid, uuid) is
  'Privacy-safe per-recipient ingestion/generation payload (text groups + rating '
  'aggregates with giver_count/total_givers). Self-excluded, giver-masked, and '
  'threshold-gated per (question x assignment_type) at evaluation_cycles.'
  'anon_min_responses, AND restricted to assignment types (peer, upward) — peers '
  'plus the person''s own reports — so the manager''s downward feedback never '
  'enters the AI summary corpus. Adopted from Vojtech''s RAG PR; the >0 gate was '
  'replaced with >= anon_min_responses to stop single-giver comment leaks.';

-- 2) feedback_summary_input (sibling builder, kept in lock-step) --------------
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
      and fa.type in ('peer','upward')      -- peers + reports only; exclude manager's downward
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
      and fa.type in ('peer','upward')      -- peers + reports only; exclude manager's downward
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

comment on function public.feedback_summary_input(uuid, uuid) is
  'Privacy-safe per-recipient feedback input for AI summary / RAG. Self-excluded, '
  'giver-masked, threshold-gated per (question x assignment_type) at '
  'evaluation_cycles.anon_min_responses, AND restricted to assignment types '
  '(peer, upward) — peers plus the person''s own reports — excluding the '
  'manager''s downward feedback. Mirrors the v_received_*_by_type views. '
  'SECURITY DEFINER, callable by service_role (bypasses RLS). Stable JSON contract.';
