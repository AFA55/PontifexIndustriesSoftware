-- NFC Tag Programming: add operator assignment + Pontifex NFC ID fields
ALTER TABLE public.nfc_tags
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS pontifex_nfc_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS programmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS programmed_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_nfc_tags_operator ON public.nfc_tags(operator_id) WHERE operator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nfc_tags_pontifex_nfc_id ON public.nfc_tags(pontifex_nfc_id) WHERE pontifex_nfc_id IS NOT NULL;
