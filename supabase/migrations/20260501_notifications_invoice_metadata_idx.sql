-- Partial index to accelerate the 7-day dedupe lookup performed by the
-- /api/cron/invoice-30d-reminders route. The dedupe filters by
--   type = 'invoice_unpaid_30d' AND created_at >= now() - 7 days
-- and then matches metadata->>invoiceId. Indexing (user_id, type, created_at)
-- restricted to the relevant type keeps the partial index small.
CREATE INDEX IF NOT EXISTS idx_notifications_invoice_unpaid_30d
  ON public.notifications (user_id, type, created_at DESC)
  WHERE type = 'invoice_unpaid_30d';
