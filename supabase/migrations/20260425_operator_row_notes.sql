-- Per-operator per-day shift notes (separate from time-off)
-- Used for annotations like "leaving at 2pm", "needs early start", etc.
CREATE TABLE IF NOT EXISTS public.operator_row_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  UNIQUE(operator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_row_notes_operator_date ON public.operator_row_notes(operator_id, date);
CREATE INDEX IF NOT EXISTS idx_row_notes_date ON public.operator_row_notes(date);
CREATE INDEX IF NOT EXISTS idx_row_notes_tenant ON public.operator_row_notes(tenant_id);

ALTER TABLE public.operator_row_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "row_notes_admin_all" ON public.operator_row_notes
  FOR ALL USING (public.current_user_has_role('super_admin','operations_manager','admin'));

CREATE POLICY "row_notes_read_own" ON public.operator_row_notes
  FOR SELECT USING (operator_id = auth.uid());
