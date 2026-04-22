-- ============================================================================
-- Migration: Signature Delivery — customer_signature_method + public policies
-- Date: 2026-04-18
-- ============================================================================

-- Add customer_signature_method to job_orders for tracking how signature was obtained
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS customer_signature_method TEXT
  CHECK (customer_signature_method IN ('on_site', 'remote', 'none'));

-- Add public read policy on signature_requests so the signing page can load without auth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'signature_requests' AND policyname = 'sig_requests_public_token_read'
  ) THEN
    CREATE POLICY "sig_requests_public_token_read" ON public.signature_requests
      FOR SELECT USING (true);
  END IF;
END $$;

-- Allow public (unauthenticated) to update signature_requests when signing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'signature_requests' AND policyname = 'sig_requests_public_sign'
  ) THEN
    CREATE POLICY "sig_requests_public_sign" ON public.signature_requests
      FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;
