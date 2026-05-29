-- Migration 25 — Add 'proposed' to the assignment_status enum
--
-- Part of the "matching review" approval workflow (DESIGN: matching gating).
-- New generations seed assignments as 'proposed'; activate_matching() flips
-- 'proposed' -> 'pending' once every manager has approved. Existing live rows
-- (pending/draft/submitted) are NEVER touched.
--
-- IMPORTANT: `ALTER TYPE ... ADD VALUE` adds a new enum label, but Postgres
-- forbids USING that new label inside the same transaction that added it. This
-- migration therefore does ONLY the enum addition and nothing else — every
-- function/policy that references 'proposed' lives in a later migration that
-- runs in a separate transaction. `IF NOT EXISTS` keeps it idempotent.

alter type public.assignment_status add value if not exists 'proposed';
