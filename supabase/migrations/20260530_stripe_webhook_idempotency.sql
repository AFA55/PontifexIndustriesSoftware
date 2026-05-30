-- Idempotency ledger for Stripe webhooks (Stripe delivers at-least-once + retries).
-- The webhook inserts event.id with ON CONFLICT and skips if already present.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    text PRIMARY KEY,
  event_type  text,
  processed_at timestamptz NOT NULL DEFAULT now()
);
-- Server-only (webhook uses the service-role client). RLS on + no policy = deny-all to clients.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
