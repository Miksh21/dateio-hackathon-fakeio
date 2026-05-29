-- Migration — chat_search: privacy-scoped vector retrieval for "chat with your
-- feedback" RAG over feedback_chunks.
--
-- WHY THIS EXISTS
-- ---------------
-- The chat agent (n8n workflow `feedback-chat`) embeds a user's question and must
-- retrieve only the (anonymised, threshold-gated) feedback chunks the ASKER is
-- entitled to see in the app. The entitlement set is a HARD PRE-FILTER baked into
-- this SQL — never a prompt instruction the model could be talked out of.
--
-- ACCESS-CONTROL CONTRACT (must match the app's v_received_*_anon views exactly):
-- asker A may see recipient T's feedback iff ANY of:
--   * T = A                                   (own feedback)
--   * manages_descendant(cycle, A, T)         (A manages T transitively)
--   * are_peers(cycle, A, T)                  (co-report or explicit peer edge)
--   * A.role = 'ceo'                           (CEO sees everyone)
--   * A.is_super_admin                         (admin sees everyone)
-- For non-admins the cycle must be 'published'. Super-admins bypass that gate
-- (mirrors the views' `is_super_admin() OR (status='published' AND …)` shape).
--
-- KEY DIFFERENCE vs the app views: those anchor visibility to the JWT via
-- current_employee_id() / my_role() / manager_subtree(). This RPC is called by
-- n8n as SERVICE ROLE (no JWT), so it takes an EXPLICIT p_asker_id and derives the
-- asker's role/super-admin flag from the employees row, then uses ONLY the
-- explicit-id helpers are_peers(cycle,a,b) and manages_descendant(cycle,m,d).
-- It must NEVER call the caller-anchored helpers (they return null as definer).
--
-- The app route is responsible for setting p_asker_id to the SESSION-VERIFIED
-- employee id (never a client-supplied id) before this RPC ever runs.

create or replace function public.chat_search(
  p_asker_id        uuid,
  p_cycle_id        uuid,
  p_query_embedding vector(1536),
  p_k               int default 8
)
returns table (
  chunk_text      text,
  recipient_id    uuid,
  recipient_name  text,
  question_text   text,
  category        text,
  assignment_type text,
  giver_count     int,
  total_givers    int,
  similarity      double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with asker as (
    select
      e.id                              as id,
      e.role                            as role,
      coalesce(e.is_super_admin, false) as is_super
    from public.employees e
    where e.id = p_asker_id
  ),
  cyc as (
    select c.id, c.status, c.anon_min_responses
    from public.evaluation_cycles c
    where c.id = p_cycle_id
  )
  select
    fc.chunk_text,
    fc.recipient_id,
    (re.first_name || ' ' || re.last_name)            as recipient_name,
    q.text                                            as question_text,
    fc.category,
    fc.assignment_type,
    fc.giver_count,
    fc.total_givers,
    -- cosine similarity in [0,1] for display; ordering uses the distance operator.
    (1 - (fc.embedding <=> p_query_embedding))::double precision as similarity
  from public.feedback_chunks fc
  join public.employees re on re.id = fc.recipient_id
  left join public.questions q on q.id = fc.question_id
  cross join asker a
  cross join cyc
  where fc.cycle_id  = p_cycle_id
    and fc.embedding is not null
    -- If the query embedding is missing (e.g. upstream embed call failed), return
    -- nothing rather than scoped-but-unordered rows — the chat then answers
    -- "no feedback available" instead of leaking an arbitrary slice.
    and p_query_embedding is not null
    -- Defense-in-depth threshold gate (chunks are already gated at ingest).
    and fc.giver_count >= cyc.anon_min_responses
    -- Cycle-state gate: non-admins only see a published cycle; admins bypass.
    and (a.is_super or cyc.status = 'published')
    -- HARD entitlement pre-filter on the recipient set.
    and (
      a.is_super
      or a.role = 'ceo'
      or fc.recipient_id = a.id
      or public.manages_descendant(p_cycle_id, a.id, fc.recipient_id)
      or public.are_peers(p_cycle_id, a.id, fc.recipient_id)
    )
  order by fc.embedding <=> p_query_embedding
  limit greatest(coalesce(p_k, 8), 1);
$$;

-- Only the service role (n8n) may call this. The app never calls it directly with
-- the anon/authenticated key — it proxies through the n8n webhook, which supplies
-- the session-verified asker id. Granting to service_role only keeps the explicit
-- p_asker_id from being abused by a logged-in user crafting an arbitrary id.
revoke all on function public.chat_search(uuid, uuid, vector, int) from public;
grant execute on function public.chat_search(uuid, uuid, vector, int) to service_role;

comment on function public.chat_search(uuid, uuid, vector, int) is
  'Privacy-scoped vector retrieval for the feedback chat RAG. Returns top-k '
  'feedback_chunks ordered by cosine distance, HARD-filtered to the recipient set '
  'the explicit p_asker_id is entitled to (self / managed-descendant / peer / ceo '
  '/ super-admin), threshold-gated (giver_count >= anon_min_responses) and '
  'published-gated for non-admins. SECURITY DEFINER, service_role only; the n8n '
  'chat webhook passes the app-session-verified asker id.';
