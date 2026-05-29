-- Migration 18 — feedback_chunks: pgvector store for RAG summarization (DESIGN.md §7)
--
-- Architecture overview:
--   1. Chunks are keyed per (cycle × recipient × question × assignment_type).
--   2. giver_count / total_givers are stored so the generation prompt can
--      express proportionality ("3 out of 5 peers mentioned…") without
--      re-querying responses — those rows are giver-identified and RLS-blocked.
--   3. chunk_text contains ONLY anonymized text — no giver identifiers.
--      The ingestion script (scripts/ingest_embeddings.ts) is the sole writer.
--   4. RLS: service_role writes; super-admins can read for inspection;
--      normal authenticated users have no direct access (they get summaries
--      via result_summaries instead).
--   5. The HNSW index supports cosine similarity search. At the current scale
--      (~8–200 employees, ~15 chunks per person) full-scan would be fine, but
--      HNSW costs nothing here and scales to 10k chunks without tuning.

-- pgvector is pre-enabled on Supabase managed Postgres (available since v0.5).
-- If running on a self-hosted instance: CREATE EXTENSION IF NOT EXISTS vector;
-- (already done in migration 1 or available in Supabase extensions settings)

CREATE TABLE IF NOT EXISTS public.feedback_chunks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid        NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  recipient_id    uuid        NOT NULL REFERENCES public.employees(id),
  question_id     uuid        REFERENCES public.questions(id),
  category        text,
  assignment_type text        NOT NULL,
  chunk_text      text        NOT NULL,
  -- proportionality metadata (no re-querying needed at generation time)
  giver_count     int         NOT NULL DEFAULT 0 CHECK (giver_count >= 0),
  total_givers    int         NOT NULL DEFAULT 0 CHECK (total_givers >= 0),
  embedding       vector(1536),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, recipient_id, question_id, assignment_type)
);

-- HNSW index for cosine similarity (better recall than IVFFlat at small scale,
-- no training step required, handles incremental inserts cleanly per cycle).
CREATE INDEX IF NOT EXISTS idx_feedback_chunks_embedding
  ON public.feedback_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_feedback_chunks_lookup
  ON public.feedback_chunks (cycle_id, recipient_id, assignment_type);

ALTER TABLE public.feedback_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fc_service_role_all" ON public.feedback_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "fc_super_admin_read" ON public.feedback_chunks
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ── RPC: feedback_ingestion_payload ─────────────────────────────────────────
-- Returns all text responses for one recipient grouped by (question × assignment_type),
-- with giver_count and total_givers per group. Called by the ingestion script
-- to build chunk_text + generate embeddings.
-- SECURITY DEFINER so the ingestion script (service_role) can call it cleanly.

CREATE OR REPLACE FUNCTION public.feedback_ingestion_payload(
  p_cycle_id     uuid,
  p_recipient_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'recipient', (
      SELECT jsonb_build_object(
        'id',         e.id::text,
        'first_name', e.first_name,
        'last_name',  e.last_name,
        'job_title',  coalesce(e.job_title, 'Employee')
      )
      FROM public.employees e WHERE e.id = p_recipient_id
    ),
    'question_groups', (
      SELECT coalesce(
        jsonb_agg(g ORDER BY (g->>'assignment_type'), (g->>'sort_order')::int),
        '[]'::jsonb
      )
      FROM (
        SELECT jsonb_build_object(
          'question_id',     q.id::text,
          'question_text',   q.text,
          'category',        coalesce(q.category, 'General'),
          'sort_order',      q.sort_order,
          'assignment_type', fa.type::text,
          'total_givers',    count(DISTINCT fa.from_id),
          'giver_count',     count(r.id) FILTER (
                               WHERE r.text_value IS NOT NULL
                                 AND length(btrim(r.text_value)) > 0
                             ),
          'comments', coalesce(
            jsonb_agg(r.text_value ORDER BY r.created_at)
            FILTER (WHERE r.text_value IS NOT NULL AND length(btrim(r.text_value)) > 0),
            '[]'::jsonb
          )
        ) AS g
        FROM public.responses r
        JOIN public.feedback_assignments fa ON fa.id = r.assignment_id
        JOIN public.questions q             ON q.id  = r.question_id
        WHERE fa.cycle_id  = p_cycle_id
          AND fa.to_id     = p_recipient_id
          AND fa.from_id  <> fa.to_id
          AND fa.status    = 'submitted'
        GROUP BY q.id, q.text, q.category, q.sort_order, fa.type
        HAVING count(r.id) FILTER (
          WHERE r.text_value IS NOT NULL AND length(btrim(r.text_value)) > 0
        ) > 0
      ) sub
    ),
    'ratings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'question_text',   q.text,
        'category',        coalesce(q.category, 'General'),
        'assignment_type', fa.type::text,
        'avg_score',       round(avg(r.scale_value)::numeric, 2),
        'response_count',  count(r.id),
        'total_givers',    count(DISTINCT fa.from_id)
      ) ORDER BY q.sort_order), '[]'::jsonb)
      FROM public.responses r
      JOIN public.feedback_assignments fa ON fa.id = r.assignment_id
      JOIN public.questions q             ON q.id  = r.question_id
      WHERE fa.cycle_id  = p_cycle_id
        AND fa.to_id     = p_recipient_id
        AND fa.from_id  <> fa.to_id
        AND fa.status    = 'submitted'
        AND r.scale_value IS NOT NULL
      GROUP BY q.id, q.text, q.category, q.sort_order, fa.type
    )
  )
$$;

GRANT EXECUTE ON FUNCTION public.feedback_ingestion_payload(uuid, uuid)
  TO service_role;

-- ── RPC: get_recipient_chunks ────────────────────────────────────────────────
-- Returns all stored chunks for a recipient, ordered for generation context
-- assembly. Called by n8n Code nodes and the generation script.

CREATE OR REPLACE FUNCTION public.get_recipient_chunks(
  p_cycle_id     uuid,
  p_recipient_id uuid
)
RETURNS TABLE (
  chunk_text      text,
  category        text,
  assignment_type text,
  giver_count     int,
  total_givers    int,
  question_text   text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    fc.chunk_text,
    fc.category,
    fc.assignment_type,
    fc.giver_count,
    fc.total_givers,
    q.text AS question_text
  FROM public.feedback_chunks fc
  LEFT JOIN public.questions q ON q.id = fc.question_id
  WHERE fc.cycle_id     = p_cycle_id
    AND fc.recipient_id = p_recipient_id
    AND fc.embedding    IS NOT NULL
  ORDER BY fc.assignment_type, fc.category NULLS LAST, fc.giver_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recipient_chunks(uuid, uuid)
  TO service_role;
