-- Adds AI draft-analysis storage to the existing feedback/ticket system.
-- The analysis is written by a super_admin-only route after a draft-only
-- investigation agent runs; never auto-applied.

ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;
