-- Project manager (owner) of a job — an office person (managers & admins),
-- distinct from created_by (the dispatcher) and assigned_to (the field operator).
-- Additive + idempotent. Applied to prod 2026-07-27 via Supabase MCP.
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS project_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_orders_project_manager_id
  ON public.job_orders(project_manager_id);

COMMENT ON COLUMN public.job_orders.project_manager_id IS
  'Office project manager who owns this job (managers & admins). Distinct from created_by (dispatcher) and assigned_to (field operator).';
