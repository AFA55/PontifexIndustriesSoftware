export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/portal-links
 * ADMIN — Requires admin auth.
 * Creates a customer portal magic-link token, optionally sends email + SMS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { sendEmail } from '@/lib/email';
import { sendSMSAny } from '@/lib/sms';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pontifexindustries.com';

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

    // Fetch tenant branding for email
    let companyName = 'Your Service Provider';
    let primaryColor = '#7c3aed';
    let logoUrl: string | null = null;

    const { data: branding } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name, primary_color, logo_url')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (branding) {
      companyName = branding.company_name || companyName;
      primaryColor = branding.primary_color || primaryColor;
      logoUrl = branding.logo_url || null;
    } else {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenant?.name) companyName = tenant.name;
    }

    // Send email if provided
    let emailSent = false;
    if (customer_email?.trim()) {
      const html = buildPortalEmail({
        customerName: customer_name.trim(),
        companyName,
        primaryColor,
        logoUrl,
        portalUrl,
        expiresAt: portalToken.expires_at,
      });
      emailSent = await sendEmail({
        to: customer_email.trim(),
        subject: `View your jobs & documents — ${companyName}`,
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

/* ─── Email template ────────────────────────────────────────── */

function buildPortalEmail({
  customerName,
  companyName,
  primaryColor,
  logoUrl,
  portalUrl,
  expiresAt,
}: {
  customerName: string;
  companyName: string;
  primaryColor: string;
  logoUrl: string | null;
  portalUrl: string;
  expiresAt: string;
}): string {
  const escape = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>View Your Jobs &amp; Documents — ${escape(companyName)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td style="padding:48px 20px;">
        <table role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${escape(primaryColor)} 0%,${escape(primaryColor)}cc 100%);padding:40px;text-align:center;">
              ${logoUrl ? `<img src="${escape(logoUrl)}" alt="${escape(companyName)}" style="height:48px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">` : ''}
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.3px;">${escape(companyName)}</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Customer Job Portal</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">
                Hi <strong style="color:#0f172a;">${escape(customerName)}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">
                You can now view your complete job history with ${escape(companyName)}, including job status, completed work, and any documents that need your signature.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 32px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${escape(portalUrl)}"
                       style="display:inline-block;padding:16px 48px;background-color:${escape(primaryColor)};color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                      View Your Jobs &amp; Sign Documents
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <div style="background-color:#f8fafc;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 8px;color:#0f172a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Portal access</p>
                <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.8;">
                  <li>No account or password needed</li>
                  <li>View all your past and current jobs</li>
                  <li>Sign documents electronically</li>
                  <li>Link expires on ${escape(expiryDate)}</li>
                </ul>
              </div>

              <!-- Fallback link -->
              <div style="background-color:#f1f5f9;border-radius:6px;padding:16px 20px;">
                <p style="margin:0 0 6px;color:#64748b;font-size:12px;font-weight:600;">Button not working? Copy this link:</p>
                <p style="margin:0;color:#2563eb;font-size:12px;word-break:break-all;line-height:1.5;">${escape(portalUrl)}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                This link was sent by ${escape(companyName)}. If you didn't request it, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
