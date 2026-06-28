/**
 * Customer portal-token helpers.
 *
 * Centralizes creation + reuse of `customer_portal_tokens` rows (the public
 * customer magic-link portal at `/portal/[token]`). Previously this logic was
 * inline in `app/api/admin/portal-links/route.ts`; it is extracted here so the
 * automated customer notifications (en-route / job-complete) reuse the SAME
 * token model instead of duplicating the insert.
 *
 * All DB access uses supabaseAdmin (bypasses RLS) — callers MUST scope by the
 * resolved tenantId themselves.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveAppOrigin } from '@/lib/app-url';

export interface PortalToken {
  id: string;
  token: string;
  expires_at: string;
}

/** Build the public portal URL for a token. */
export function buildPortalUrl(token: string, requestOrigin?: string | null): string {
  return `${resolveAppOrigin(requestOrigin)}/portal/${token}`;
}

/**
 * Create a new portal token row. The DB generates the `token` value via its
 * column DEFAULT (32 random bytes, hex). Returns null on failure (never throws).
 */
export async function createPortalToken(args: {
  tenantId: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  jobOrderId?: string | null;
  createdBy?: string | null;
}): Promise<PortalToken | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_portal_tokens')
      .insert({
        tenant_id: args.tenantId,
        customer_name: args.customerName.trim(),
        customer_email: args.customerEmail?.trim() || null,
        customer_phone: args.customerPhone?.trim() || null,
        job_order_id: args.jobOrderId || null,
        created_by: args.createdBy || null,
      })
      .select('id, token, expires_at')
      .single();

    if (error || !data) {
      console.error('[portal-tokens] createPortalToken failed:', error?.message || error);
      return null;
    }
    return data as PortalToken;
  } catch (err) {
    console.error('[portal-tokens] createPortalToken threw:', err);
    return null;
  }
}

/**
 * Get an existing non-expired portal token for a job (within a tenant), or
 * create one if none exists. Used by automated customer notifications so the
 * customer keeps clicking the same stable link for a given job.
 *
 * Returns null on failure (never throws).
 */
export async function getOrCreatePortalTokenForJob(args: {
  tenantId: string;
  jobOrderId: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  createdBy?: string | null;
}): Promise<PortalToken | null> {
  try {
    // Reuse a still-valid token already issued for this job, if any.
    const { data: existing } = await supabaseAdmin
      .from('customer_portal_tokens')
      .select('id, token, expires_at')
      .eq('tenant_id', args.tenantId)
      .eq('job_order_id', args.jobOrderId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) return existing as PortalToken;
  } catch (err) {
    // Non-fatal — fall through to creating a fresh token.
    console.warn('[portal-tokens] lookup failed, creating new token:', err);
  }

  return createPortalToken({
    tenantId: args.tenantId,
    customerName: args.customerName,
    customerEmail: args.customerEmail,
    customerPhone: args.customerPhone,
    jobOrderId: args.jobOrderId,
    createdBy: args.createdBy,
  });
}
