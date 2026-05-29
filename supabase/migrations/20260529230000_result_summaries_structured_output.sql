-- Migration 20 — result_summaries: add structured_output jsonb column
--
-- The RAG generation script produces a full structured JSON object
-- (summary, theme_tags, strengths, growth_areas, polarizing_traits,
-- escalation_required, escalation_note). Previously only ai_summary and
-- theme_tags were stored. This migration adds a structured_output column
-- so the results page can render the full breakdown without re-parsing.

ALTER TABLE public.result_summaries
  ADD COLUMN IF NOT EXISTS structured_output jsonb;

COMMENT ON COLUMN public.result_summaries.structured_output IS
  'Full Claude JSON output: { summary, theme_tags, strengths, growth_areas, polarizing_traits, escalation_required, escalation_note }';
