-- Migration 19 — result_summaries: add review_status for escalation blocking
--
-- When the RAG pipeline flags an escalation (misconduct, toxic behaviour, etc.),
-- the summary must not be shown to the recipient until an admin reviews it.
-- This migration adds a review_status column to result_summaries and a helper
-- RPC that the generation script calls to lock a row under review.

ALTER TABLE public.result_summaries
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'ready'
    CHECK (review_status IN ('ready', 'under_review', 'approved'));

COMMENT ON COLUMN public.result_summaries.review_status IS
  'ready = visible to recipient; under_review = escalation flagged, blocked pending admin review; approved = admin cleared for release';

-- Index so the admin panel can quickly find rows needing review.
CREATE INDEX IF NOT EXISTS idx_rs_review_status
  ON public.result_summaries (review_status)
  WHERE review_status = 'under_review';

-- RPC: flag a summary as under_review and return the super-admin emails to
-- notify. Called by the generation script immediately after an escalation is
-- detected. SECURITY DEFINER so the script (service_role) gets the admin list
-- without exposing employees to anon callers.
CREATE OR REPLACE FUNCTION public.flag_summary_under_review(
  p_cycle_id     uuid,
  p_recipient_id uuid,
  p_scope        text DEFAULT 'rag_full'
)
RETURNS TABLE (admin_email text, admin_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Block the summary from the recipient by marking it under_review.
  UPDATE public.result_summaries
     SET review_status = 'under_review',
         ai_summary    = NULL  -- wipe until an admin approves
   WHERE cycle_id     = p_cycle_id
     AND recipient_id = p_recipient_id
     AND scope        = p_scope;

  -- Return all super-admin emails for notification (generation script sends the emails).
  RETURN QUERY
    SELECT e.email, (e.first_name || ' ' || e.last_name)
    FROM public.employees e
    WHERE e.is_super_admin = true
      AND e.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_summary_under_review(uuid, uuid, text)
  TO service_role;
