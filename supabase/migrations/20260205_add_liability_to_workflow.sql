-- Add liability_release_signed column to workflow_steps table
-- Migration: 20260205_add_liability_to_workflow

ALTER TABLE workflow_steps
ADD COLUMN IF NOT EXISTS liability_release_signed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN workflow_steps.liability_release_signed IS 'Whether operator signed the liability release form';

-- Update any existing workflows to check if liability was signed
UPDATE workflow_steps ws
SET liability_release_signed = TRUE
WHERE EXISTS (
  SELECT 1 FROM job_orders jo
  WHERE jo.id = ws.job_order_id
  AND jo.liability_release_signed_at IS NOT NULL
);
