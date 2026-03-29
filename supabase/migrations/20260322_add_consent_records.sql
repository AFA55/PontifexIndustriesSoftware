-- Consent records — immutable audit trail for all consent events
CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  context TEXT,
  context_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own consent" ON public.consent_records
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins read all consent" ON public.consent_records
  FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager')
  );

CREATE POLICY "Anyone can insert consent" ON public.consent_records
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_consent_records_user ON public.consent_records(user_id, consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_records_type ON public.consent_records(consent_type, document_version);

-- Quick GPS consent lookup on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gps_consent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gps_consent_version TEXT;
