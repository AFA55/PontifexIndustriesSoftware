-- Customer Satisfaction Survey v2
-- Extends public.customer_surveys with v2 fields:
--   * operator_feedback_notes (free-text notes about the operator)
--   * likely_to_use_again_rating (1-10 NPS-style)
--   * customer_email (optional, when customer chooses email delivery)
--   * delivered_to (audit string: "sms:+1..." or "email:foo@bar.com")
--
-- Idempotent — safe to re-run. RLS unchanged.

ALTER TABLE public.customer_surveys
  ADD COLUMN IF NOT EXISTS operator_feedback_notes TEXT;

ALTER TABLE public.customer_surveys
  ADD COLUMN IF NOT EXISTS likely_to_use_again_rating INT
  CHECK (likely_to_use_again_rating BETWEEN 1 AND 10);

ALTER TABLE public.customer_surveys
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE public.customer_surveys
  ADD COLUMN IF NOT EXISTS delivered_to TEXT;

COMMENT ON COLUMN public.customer_surveys.operator_feedback_notes
  IS 'Optional free-text feedback about the operator (cleanliness, professionalism, etc).';
COMMENT ON COLUMN public.customer_surveys.likely_to_use_again_rating
  IS 'NPS-style 1-10 likelihood the customer would use Patriot Concrete Cutting again.';
COMMENT ON COLUMN public.customer_surveys.customer_email
  IS 'Optional customer email when they choose to receive results via email instead of SMS.';
COMMENT ON COLUMN public.customer_surveys.delivered_to
  IS 'Audit note describing where survey results were delivered (e.g. "sms:+15551234567" or "email:foo@bar.com").';
