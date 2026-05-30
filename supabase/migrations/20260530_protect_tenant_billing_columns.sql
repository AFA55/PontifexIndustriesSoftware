-- Prevent a tenant owner from self-editing billing/subscription columns via the anon client
-- (the tenants_owner_write RLS policy is FOR ALL on the whole row). RLS lacks column-level
-- limits, so revoke UPDATE on these columns from client roles; the service-role client
-- (webhook + API routes) remains authoritative.
REVOKE UPDATE (
  subscription_status, subscription_plan, subscription_period_end,
  plan_type, current_period_end, stripe_customer_id, stripe_subscription_id,
  trial_ends_at
) ON public.tenants FROM anon, authenticated;
