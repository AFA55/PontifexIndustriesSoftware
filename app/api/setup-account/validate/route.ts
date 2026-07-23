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
      phone_number?: string | null;
      date_of_birth?: string | null;
      tenants?: { name?: string; company_code?: string } | { name?: string; company_code?: string }[] | null;
    }

    let inv: InvRow | null = null;

    // Optional columns (invited_name / phone_number / date_of_birth) are stamped
    // on the invitation at approve/invite time so the setup form can prefill what
    // the user already provided. If the migration adding them hasn't run, the
    // SELECT returns 42703 — degrade to the guaranteed base columns (those
    // prefill fields simply come back null, never a 500).
    const full = await supabaseAdmin
      .from('user_invitations')
      .select('id, email, role, tenant_id, invited_name, phone_number, date_of_birth, tenants(name, company_code)')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (full.error && full.error.code === '42703') {
      // One or more prefill columns not present yet — retry with base columns only.
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
      // Distinguish "already used" from "expired/garbage" (founder Jul 23:
      // re-clicking an old accept link read as a dead end — the system KNOWS
      // this invite completed, so say that and route to the real sign-in).
      const { data: usedInv } = await supabaseAdmin
        .from('user_invitations')
        .select('email, tenant_id, used_at, accepted_at, tenants(name, company_code)')
        .eq('token', token)
        .not('accepted_at', 'is', null)
        .maybeSingle();
      if (usedInv) {
        const usedTenant = Array.isArray(usedInv.tenants) ? usedInv.tenants[0] : usedInv.tenants;
        return NextResponse.json(
          {
            error: 'This invitation was already used — your account is set up.',
            already_used: true,
            tenant_id: usedInv.tenant_id,
            tenant_name: (usedTenant as any)?.name ?? null,
            accepted_on: usedInv.accepted_at,
          },
          { status: 410 }
        );
      }
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
        phoneNumber: inv.phone_number ?? null,
        dateOfBirth: inv.date_of_birth ?? null,
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
