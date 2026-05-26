export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/public/portal/[token]
 * PUBLIC — No auth required.
 * Validates a customer portal magic-link token, returns job history + pending signature info.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Look up the portal token
    const { data: portalToken, error: tokenError } = await supabaseAdmin
      .from('customer_portal_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (tokenError || !portalToken) {
      return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
    }

    // Check expiry
    if (new Date(portalToken.expires_at) < new Date()) {
      return NextResponse.json({ error: 'expired', message: 'This portal link has expired' }, { status: 410 });
    }

    // Update access tracking (fire-and-forget)
    Promise.resolve(
      supabaseAdmin
        .from('customer_portal_tokens')
        .update({
          accessed_at: new Date().toISOString(),
          access_count: (portalToken.access_count || 0) + 1,
        })
        .eq('id', portalToken.id)
    ).then(() => {}).catch(() => {});

    // Fetch tenant branding
    let tenantName = 'Your Service Provider';
    let tenantLogoUrl: string | null = null;
    let tenantPrimaryColor: string | null = null;

    const { data: branding } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name, logo_url, primary_color')
      .eq('tenant_id', portalToken.tenant_id)
      .maybeSingle();

    if (branding) {
      tenantName = branding.company_name || tenantName;
      tenantLogoUrl = branding.logo_url || null;
      tenantPrimaryColor = branding.primary_color || null;
    } else {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name, logo_url, primary_color')
        .eq('id', portalToken.tenant_id)
        .maybeSingle();
      if (tenant) {
        tenantName = tenant.name || tenantName;
        tenantLogoUrl = (tenant as any).logo_url || null;
        tenantPrimaryColor = (tenant as any).primary_color || null;
      }
    }

    // Fetch pending job + signature if a specific job is pinned on the token
    let pendingJob: Record<string, any> | null = null;
    let pendingSignatureToken: string | null = null;

    if (portalToken.job_order_id) {
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select(
          'id, job_number, project_name, scheduled_date, status, address, location, customer_name, customer_email, customer_signature, customer_signed_at, total_cost, completed_at, description, job_type'
        )
        .eq('id', portalToken.job_order_id)
        .eq('tenant_id', portalToken.tenant_id)
        .maybeSingle();

      if (job) {
        pendingJob = job;

        // Look for a pending completion signature request on this job
        const { data: sigRequest } = await supabaseAdmin
          .from('signature_requests')
          .select('token, status, expires_at')
          .eq('job_order_id', portalToken.job_order_id)
          .eq('request_type', 'completion')
          .eq('status', 'sent')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sigRequest && new Date(sigRequest.expires_at) > new Date()) {
          pendingSignatureToken = sigRequest.token;
        }
      }
    }

    // Fetch job history for this customer within this tenant.
    // Match by email OR customer_name (case-insensitive).
    //
    // SECURITY: Do NOT interpolate customer_email / customer_name directly into
    // a PostgREST .or() string — values stored in the DB could contain PostgREST
    // filter syntax and manipulate which rows are returned (query injection).
    // Instead, run two separate parameterised queries and merge in TypeScript.
    const jobSelectColumns =
      'id, job_number, project_name, scheduled_date, status, address, location, customer_signature, customer_signed_at, total_cost, completed_at';

    let jobHistory: Record<string, any>[] = [];

    if (portalToken.customer_email && portalToken.customer_name) {
      // Two strict-parameter queries — no string interpolation of user values.
      const [byEmail, byName] = await Promise.all([
        supabaseAdmin
          .from('job_orders')
          .select(jobSelectColumns)
          .eq('tenant_id', portalToken.tenant_id)
          .eq('customer_email', portalToken.customer_email)
          .order('scheduled_date', { ascending: false })
          .limit(20),
        supabaseAdmin
          .from('job_orders')
          .select(jobSelectColumns)
          .eq('tenant_id', portalToken.tenant_id)
          .ilike('customer_name', portalToken.customer_name)
          .order('scheduled_date', { ascending: false })
          .limit(20),
      ]);

      // Merge and deduplicate by id, then re-sort and cap at 20.
      const seen = new Set<string>();
      const combined = [...(byEmail.data ?? []), ...(byName.data ?? [])].filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      combined.sort(
        (a, b) =>
          new Date(b.scheduled_date ?? 0).getTime() - new Date(a.scheduled_date ?? 0).getTime()
      );
      jobHistory = combined.slice(0, 20);
    } else if (portalToken.customer_email) {
      const { data } = await supabaseAdmin
        .from('job_orders')
        .select(jobSelectColumns)
        .eq('tenant_id', portalToken.tenant_id)
        .eq('customer_email', portalToken.customer_email)
        .order('scheduled_date', { ascending: false })
        .limit(20);
      jobHistory = data ?? [];
    } else if (portalToken.customer_name) {
      const { data } = await supabaseAdmin
        .from('job_orders')
        .select(jobSelectColumns)
        .eq('tenant_id', portalToken.tenant_id)
        .ilike('customer_name', portalToken.customer_name)
        .order('scheduled_date', { ascending: false })
        .limit(20);
      jobHistory = data ?? [];
    }

    return NextResponse.json({
      success: true,
      data: {
        customer_name: portalToken.customer_name,
        tenant_name: tenantName,
        tenant_logo_url: tenantLogoUrl,
        tenant_primary_color: tenantPrimaryColor,
        pending_job: pendingJob,
        pending_signature_token: pendingSignatureToken,
        job_history: jobHistory || [],
        expires_at: portalToken.expires_at,
      },
    });
  } catch (error: any) {
    console.error('Error in public portal GET:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
