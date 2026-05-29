-- Migration — feedback_chunks: pgvector store for RAG summarization + future chat.
--
-- ADOPTED from Vojtěch's feat/rag-pipeline PR (#4) and reimplemented on main with
-- three blocker fixes (see header notes below). Original authorship: Vojtěch.
--
-- WHY THIS EXISTS
-- ---------------
-- The vector store is the FOUNDATION for the future semantic-search chat over
-- 360° feedback. The per-recipient AI summary pipeline (n8n CaU6...) does NOT
-- require similarity search — it summarizes ALL of a recipient's threshold-gated
-- feedback — but it DOES reuse `feedback_ingestion_payload` (below) to obtain the
-- proportionality counts (giver_count / total_givers) its richer prompt needs.
--
-- Architecture:
--   1. Chunks are keyed per (cycle × recipient × question × assignment_type).
--   2. giver_count / total_givers are stored so the generation prompt can express
--      proportionality ("3 of 5 peers mentioned…") without re-querying responses.
--   3. chunk_text contains ONLY anonymized text — no giver identifiers.
--   4. RLS: service_role writes; super-admins can read for inspection; normal
--      authenticated users have no direct access (they read result_summaries).
--   5. HNSW index for cosine similarity.
--
-- ── FIXES vs the original PR file ────────────────────────────────────────────
-- FIX 1 (PRIVACY, blocker): the PR gated text groups with `HAVING count(text) > 0`,
--        which leaks single-giver comments to the embedder / LLM. Every group-level
--        gate here is now `>= (anon_min_responses of the cycle)`, matching
--        feedback_summary_input() and the app's v_received_*_by_type views. No
--        under-threshold (question × assignment_type) group is embedded or returned.
-- FIX 2 (RENAME): the PR used 20260529210000_, which collides with
--        20260529210000_demo_roster_restrict.sql on main. Renamed to 230000.
-- FIX 3 (pgvector): `create extension if not exists vector;` is run first so the
--        vector(1536) column applies on this managed-Postgres instance.

-- ── FIX 3: enable pgvector before any vector-typed DDL ───────────────────────
create extension if not exists vector;

create table if not exists public.feedback_chunks (
  id              uuid        primary key default gen_random_uuid(),
  cycle_id        uuid        not null references public.evaluation_cycles(id) on delete cascade,
  recipient_id    uuid        not null references public.employees(id),
  question_id     uuid        references public.questions(id),
  category        text,
  assignment_type text        not null,
  chunk_text      text        not null,
  -- proportionality metadata (no re-querying needed at generation time)
  giver_count     int         not null default 0 check (giver_count >= 0),
  total_givers    int         not null default 0 check (total_givers >= 0),
  embedding       vector(1536),
  created_at      timestamptz not null default now(),
  unique (cycle_id, recipient_id, question_id, assignment_type)
);

-- HNSW index for cosine similarity (no training step, handles incremental inserts).
create index if not exists idx_feedback_chunks_embedding
  on public.feedback_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists idx_feedback_chunks_lookup
  on public.feedback_chunks (cycle_id, recipient_id, assignment_type);

alter table public.feedback_chunks enable row level security;

drop policy if exists "fc_service_role_all" on public.feedback_chunks;
create policy "fc_service_role_all" on public.feedback_chunks
  for all to service_role using (true) with check (true);

drop policy if exists "fc_super_admin_read" on public.feedback_chunks;
create policy "fc_super_admin_read" on public.feedback_chunks
  for select to authenticated
  using (public.is_super_admin());

-- ── RPC: feedback_ingestion_payload ─────────────────────────────────────────
-- Returns text responses + rating aggregates for ONE recipient, grouped by
-- (question × assignment_type), with giver_count / total_givers per group.
--
-- Consumed by BOTH:
--   * the future embeddings ingester (scripts/ingest_embeddings.ts), and
--   * the n8n summary pipeline's GENERATE stage (for proportionality counts).
--
-- FIX 1 (PRIVACY): a (question × assignment_type) group is included ONLY when its
-- count of non-empty text answers is `>= anon_min_responses`. The PR used `> 0`,
-- which exposed single-giver comments. Self-assessment is excluded (from <> to).
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
          and fa.status    = 'submitted'
          and r.scale_value is not null
        group by q.id, q.text, q.category, q.sort_order, fa.type, cyc.anon_min_responses
        -- FIX 1: gate rating groups on distinct givers >= threshold too.
        having count(distinct fa.from_id) >= cyc.anon_min_responses
      ) sub
    )
  )
$$;

grant execute on function public.feedback_ingestion_payload(uuid, uuid)
  to service_role;

comment on function public.feedback_ingestion_payload(uuid, uuid) is
  'Privacy-safe per-recipient ingestion/generation payload (text groups + rating '
  'aggregates with giver_count/total_givers). Self-excluded, giver-masked, and '
  'threshold-gated per (question x assignment_type) at evaluation_cycles.'
  'anon_min_responses. Adopted from Vojtech''s RAG PR; the >0 gate was replaced '
  'with >= anon_min_responses to stop single-giver comment leaks.';

-- ── RPC: get_recipient_chunks ────────────────────────────────────────────────
-- Returns stored chunks for a recipient, ordered for generation/chat context.
--
-- FIX 1 (PRIVACY, defense-in-depth): even though ingestion now only writes
-- above-threshold groups, this reader ALSO refuses to return any chunk whose
-- giver_count < the cycle threshold. A pre-fix chunk lingering in the table can
-- never leak through this RPC.
create or replace function public.get_recipient_chunks(
  p_cycle_id     uuid,
  p_recipient_id uuid
)
returns table (
  chunk_text      text,
  category        text,
  assignment_type text,
  giver_count     int,
  total_givers    int,
  question_text   text
)
language sql stable security definer set search_path = public
as $$
  select
    fc.chunk_text,
    fc.category,
    fc.assignment_type,
    fc.giver_count,
    fc.total_givers,
    q.text as question_text
  from public.feedback_chunks fc
  left join public.questions q on q.id = fc.question_id
  cross join (
    select c.anon_min_responses from public.evaluation_cycles c where c.id = p_cycle_id
  ) cyc
  where fc.cycle_id     = p_cycle_id
    and fc.recipient_id = p_recipient_id
    and fc.embedding    is not null
    -- FIX 1: never surface an under-threshold group, even if it was stored.
    and fc.giver_count >= cyc.anon_min_responses
  order by fc.assignment_type, fc.category nulls last, fc.giver_count desc;
$$;

grant execute on function public.get_recipient_chunks(uuid, uuid)
  to service_role;

comment on function public.get_recipient_chunks(uuid, uuid) is
  'Reader for feedback_chunks (RAG/chat context). Threshold-gated: only returns '
  'chunks with giver_count >= evaluation_cycles.anon_min_responses (defense in '
  'depth against any pre-fix under-threshold rows).';
