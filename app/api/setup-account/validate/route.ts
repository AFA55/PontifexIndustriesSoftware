export const dynamic = 'force-dynamic';

/**
 * GET /api/setup-account/validate?token=xxx
 * Public endpoint — validates an invitation token and returns invitation data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const { data: inv, error } = await supabaseAdmin
      .from('user_invitations')
      .select('id, email, role, tenant_id, tenants(name, company_code)')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !inv) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation link. Please contact your administrator.' },
        { status: 404 }
      );
    }

    // Also check if this email already has a completed profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, setup_completed')
      .eq('email', inv.email)
      .eq('tenant_id', inv.tenant_id)
      .single();

    const tenant = inv.tenants as any;

    return NextResponse.json({
      success: true,
      data: {
        email: inv.email,
        role: inv.role,
        tenantId: inv.tenant_id,
        tenantName: tenant?.name || 'Pontifex Industries',
        companyCode: tenant?.company_code || '',
        token,
        alreadySetup: existingProfile?.setup_completed === true,
      },
    });
  } catch (err: any) {
    console.error('[setup-account/validate] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
