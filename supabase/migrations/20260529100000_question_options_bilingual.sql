-- Migration 7 — questions: stable code, bilingual text, options
-- Needed to store multi_choice options and named scale labels (the DESIGN.md
-- §7 questions table had nowhere to put them), and to support a CS/EN UI.
--   code     : stable per-cycle key -> idempotent seeding + stable references
--   text_cs  : Czech wording (existing `text` stays the English/primary)
--   options  : jsonb array of {value, en, cs} for multi_choice + scale labels
--              (null for plain text and numeric scale_10)

alter table public.questions add column if not exists code    text;
alter table public.questions add column if not exists text_cs text;
alter table public.questions add column if not exists options jsonb;

-- Unique per cycle; NULLs are distinct, so un-coded ad-hoc questions still allowed.
alter table public.questions add constraint questions_cycle_code_uniq unique (cycle_id, code);
