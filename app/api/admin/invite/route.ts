export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/invite
 * Send an invitation email to a new user so they can complete account setup.
 * Only super_admin and operations_manager can invite.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const getResend = () => new Resend(process.env.RESEND_API_KEY || 're_placeholder');

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Only super_admin or operations_manager can invite
    if (!['super_admin', 'operations_manager'].includes(auth.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json() as {
      email: string;
      name: string;
      role: string;
      phone_number?: string | null;
      date_of_birth?: string | null;
      adminType?: string | null;
      initialFlags?: Record<string, boolean>;
    };

    if (!body.email?.trim() || !body.name?.trim() || !body.role?.trim()) {
      return NextResponse.json({ error: 'email, name, and role are required' }, { status: 400 });
    }

    // Get tenant info
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name, company_code')
      .eq('id', auth.tenantId)
      .single();

    // Get inviter's full name from profile
    const { data: inviterProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const inviterName = inviterProfile?.full_name || auth.userEmail;

    // Check if invitation already exists (pending) for this email+tenant
    const { data: existingInv } = await supabaseAdmin
      .from('user_invitations')
      .select('id, token, expires_at')
      .eq('tenant_id', auth.tenantId)
      .eq('email', body.email.trim().toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    let token: string;

    if (existingInv) {
      // Re-use the existing token (update metadata in case role/name changed)
      token = existingInv.token;
      await supabaseAdmin
        .from('user_invitations')
        .update({
          role:          body.role,
          admin_type:    body.adminType ?? null,
          initial_flags: body.initialFlags ?? {},
          invited_name:  body.name.trim(),
          phone_number:  body.phone_number ?? null,
          date_of_birth: body.date_of_birth ?? null,
        })
        .eq('id', existingInv.id);
    } else {
      // Create a new invitation token
      token = Buffer.from(`${Date.now()}-${Math.random()}-${body.email}`).toString('base64url').substring(0, 48);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertError } = await supabaseAdmin.from('user_invitations').insert({
        tenant_id:     auth.tenantId,
        email:         body.email.trim().toLowerCase(),
        role:          body.role,
        admin_type:    body.adminType ?? null,
        invited_by:    auth.userId,
        invited_name:  body.name.trim(),
        phone_number:  body.phone_number ?? null,
        date_of_birth: body.date_of_birth ?? null,
        token,
        expires_at:    expiresAt,
        initial_flags: body.initialFlags ?? {},
      });

      if (insertError) {
        // Gracefully handle missing columns by falling back without optional fields
        if (insertError.code === '42703') {
          // Column doesn't exist yet — insert without new optional fields
          const { error: fallbackError } = await supabaseAdmin.from('user_invitations').insert({
            tenant_id:     auth.tenantId,
            email:         body.email.trim().toLowerCase(),
            role:          body.role,
            admin_type:    body.adminType ?? null,
            invited_by:    auth.userId,
            token,
            expires_at:    expiresAt,
            initial_flags: body.initialFlags ?? {},
          });
          if (fallbackError) {
            console.error('[invite] Fallback insert error:', fallbackError);
            return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
          }
        } else {
          console.error('[invite] Error inserting invitation:', insertError);
          return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
        }
      }
    }

    const origin = request.headers.get('origin') || 'https://platform.pontifexindustries.com';
    const setupUrl = `${origin}/setup-account?token=${token}`;
    const tenantName = tenant?.name || 'Pontifex Industries';
    const companyCode = tenant?.company_code || '';

    // Send invitation email
    const { error: emailError } = await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@admin.pontifexindustries.com',
      to: body.email.trim(),
      subject: `You're invited to join ${tenantName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #fff; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #fff;">Welcome to ${tenantName}</h1>
      <p style="margin: 12px 0 0; color: rgba(255,255,255,0.8); font-size: 16px;">You've been invited to join the team</p>
    </div>

    <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px; color: #a78bfa; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Hello, ${body.name}</p>
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #fff;">Complete your account setup</h2>
      <p style="margin: 0 0 24px; color: #9ca3af; line-height: 1.6;">
        ${inviterName} has created an account for you on the ${tenantName} operations platform.
        Click the button below to finish setting up your account — it only takes 2 minutes.
      </p>

      <a href="${setupUrl}" style="display: block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; border-radius: 8px; padding: 14px 28px; text-align: center; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Complete Account Setup &rarr;
      </a>

      <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
        This link expires in 7 days.${companyCode ? ` Company code: <strong style="color: #9ca3af;">${companyCode}</strong>` : ''}
      </p>
    </div>

    <div style="background: #1a1a2e; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px; font-size: 14px; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.05em;">What happens next</h3>
      <div style="color: #d1d5db; font-size: 14px; line-height: 2;">
        <div>Add your profile photo</div>
        <div>Review and sign the platform agreement</div>
        <div>Confirm your communication preferences</div>
        <div>Access your dashboard</div>
      </div>
    </div>

    <p style="color: #4b5563; font-size: 12px; text-align: center; line-height: 1.6;">
      If you weren't expecting this invitation, you can safely ignore this email.<br>
      &copy; ${new Date().getFullYear()} ${tenantName} &mdash; Powered by Pontifex Platform
    </p>
  </div>
</body>
</html>`,
    });

    if (emailError) {
      console.error('[invite] Resend error:', emailError);
      return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Invitation sent successfully' });
  } catch (err: unknown) {
    console.error('[invite] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
