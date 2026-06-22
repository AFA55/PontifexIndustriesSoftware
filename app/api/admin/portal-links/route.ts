export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/portal-links
 * ADMIN — Requires admin auth.
 * Creates a customer portal magic-link token, optionally sends email + SMS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { sendEmail, getTenantEmailBranding, generatePortalAccessEmail } from '@/lib/email';
import { sendSMSAny } from '@/lib/sms';
import { resolveAppOrigin } from '@/lib/app-url';

const APP_URL = resolveAppOrigin(); // hardened: trim + validate + origin-only

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const { tenantId } = scope;

    const body = await request.json();
    const { customer_name, customer_email, customer_phone, job_order_id } = body;

    if (!customer_name || typeof customer_name !== 'string' || !customer_name.trim()) {
      return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
    }

    // Validate job_order_id belongs to this tenant if provided
    if (job_order_id) {
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('id')
        .eq('id', job_order_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!job) {
        return NextResponse.json({ error: 'Job not found or does not belong to this tenant' }, { status: 404 });
      }
    }

    // Create the portal token row (DB generates the token via DEFAULT)
    const { data: portalToken, error: insertError } = await supabaseAdmin
      .from('customer_portal_tokens')
      .insert({
        tenant_id: tenantId,
        customer_name: customer_name.trim(),
        customer_email: customer_email?.trim() || null,
        customer_phone: customer_phone?.trim() || null,
        job_order_id: job_order_id || null,
        created_by: auth.userId,
      })
      .select('id, token, expires_at')
      .single();

    if (insertError || !portalToken) {
      console.error('Error creating portal token:', insertError);
      return NextResponse.json({ error: 'Failed to create portal link' }, { status: 500 });
    }

    const portalUrl = `${APP_URL}/portal/${portalToken.token}`;

    // Fetch tenant company name for the SMS line (email uses getTenantEmailBranding).
    let companyName = 'Your Service Provider';

    const { data: branding } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (branding) {
      companyName = branding.company_name || companyName;
    } else {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenant?.name) companyName = tenant.name;
    }

    // Send email if provided — white-labeled from the tenant's full branding.
    let emailSent = false;
    if (customer_email?.trim()) {
      const branding = await getTenantEmailBranding(tenantId);
      const expiryDate = new Date(portalToken.expires_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const html = await generatePortalAccessEmail({
        branding,
        customerName: customer_name.trim(),
        portalUrl,
        expiryDate,
      });
      emailSent = await sendEmail({
        to: customer_email.trim(),
        subject: `View your jobs & documents — ${branding.companyName}`,
        html,
      });
    }

    // Send SMS if provided
    let smsSent = false;
    if (customer_phone?.trim()) {
      const smsResult = await sendSMSAny({
        to: customer_phone.trim(),
        message: `${companyName}: Hi ${customer_name.trim()}, view your job history and sign documents here: ${portalUrl}`,
      });
      smsSent = smsResult.success;
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'create_portal_link',
        resource_type: 'customer_portal_token',
        resource_id: portalToken.id,
        metadata: {
          customer_name: customer_name.trim(),
          customer_email: customer_email?.trim() || null,
          customer_phone: customer_phone?.trim() || null,
          job_order_id: job_order_id || null,
          email_sent: emailSent,
          sms_sent: smsSent,
        },
        tenant_id: tenantId,
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        token: portalToken.token,
        portal_url: portalUrl,
        expires_at: portalToken.expires_at,
        email_sent: emailSent,
        sms_sent: smsSent,
      },
    });
  } catch (error: any) {
    console.error('Error in portal-links POST:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const { tenantId } = scope;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const customerEmail = searchParams.get('customer_email');

    let query = supabaseAdmin
      .from('customer_portal_tokens')
      .select('id, token, customer_name, customer_email, customer_phone, job_order_id, expires_at, accessed_at, access_count, created_at, created_by')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (customerEmail) {
      query = query.eq('customer_email', customerEmail);
    }

    const { data: tokens, error } = await query;

    if (error) {
      console.error('Error fetching portal tokens:', error);
      return NextResponse.json({ error: 'Failed to fetch portal links' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: tokens || [] });
  } catch (error: any) {
    console.error('Error in portal-links GET:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

