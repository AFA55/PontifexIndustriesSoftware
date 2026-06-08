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

    interface InvRow {
      id: string;
      email: string;
      role: string;
      tenant_id: string;
      invited_name?: string | null;
      tenants?: { name?: string; company_code?: string } | { name?: string; company_code?: string }[] | null;
    }

    let inv: InvRow | null = null;

    const full = await supabaseAdmin
      .from('user_invitations')
      .select('id, email, role, tenant_id, invited_name, tenants(name, company_code)')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (full.error && full.error.code === '42703') {
      // invited_name column not present yet — retry without it.
      const fallback = await supabaseAdmin
        .from('user_invitations')
        .select('id, email, role, tenant_id, tenants(name, company_code)')
        .eq('token', token)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();
      inv = (fallback.data as unknown as InvRow) ?? null;
    } else {
      inv = (full.data as unknown as InvRow) ?? null;
    }

    if (!inv) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation link. Please contact your administrator.' },
        { status: 404 }
      );
    }

    // Also check if this email already has a completed profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, setup_completed')
      .ilike('email', inv.email)
      .eq('tenant_id', inv.tenant_id)
      .maybeSingle();

    const tenant = Array.isArray(inv.tenants) ? inv.tenants[0] : inv.tenants;

    return NextResponse.json({
      success: true,
      data: {
        email: inv.email,
        name: inv.invited_name ?? null,
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
