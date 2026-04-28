export const dynamic = 'force-dynamic';

/**
 * PATCH /api/profile/commission-rate-default
 *
 * Update a user's default commission rate (profiles.commission_rate_default).
 *
 * - Salesmen / any authed user: may update their OWN default.
 * - Admin / super_admin / operations_manager: may update anyone's via
 *   `?userId=<uuid>` query param.
 * - Other roles attempting to update someone else: 403.
 *
 * Body:
 *   {
 *     commission_rate_default: number;  // 0–100
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, ADMIN_ROLES } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    let targetUserId = auth.userId;
    const isSelf = !requestedUserId || requestedUserId === auth.userId;

    if (!isSelf) {
      // Updating someone else requires admin.
      if (!ADMIN_ROLES.includes(auth.role)) {
        return NextResponse.json(
          { error: 'Forbidden. Admin access required to update another user.' },
          { status: 403 }
        );
      }
      targetUserId = requestedUserId!;
    }

    const body = await request.json().catch(() => ({} as any));
    const { commission_rate_default } = body ?? {};

    const parsed = Number(commission_rate_default);
    if (
      commission_rate_default === undefined ||
      commission_rate_default === null ||
      isNaN(parsed) ||
      parsed < 0 ||
      parsed > 100
    ) {
      return NextResponse.json(
        { error: 'commission_rate_default must be a number between 0 and 100' },
        { status: 400 }
      );
    }

    // Fetch target profile (and tenant-check for non-super-admin admins).
    const { data: target, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, tenant_id, commission_rate_default')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Tenant guard for admins (non-super_admin) updating others.
    if (!isSelf && auth.role !== 'super_admin') {
      if (!auth.tenantId || target.tenant_id !== auth.tenantId) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    const previousRate = target.commission_rate_default;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ commission_rate_default: parsed })
      .eq('id', targetUserId)
      .select('id, full_name, role, commission_rate_default')
      .single();

    if (updateErr) {
      console.error('[profile/commission-rate-default] update error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to update commission rate' }, { status: 500 });
    }

    // Fire-and-forget audit log.
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        tenant_id: target.tenant_id,
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: isSelf
          ? 'user_update_own_commission_rate_default'
          : 'admin_update_user_commission_rate_default',
        resource_type: 'profile',
        resource_id: targetUserId,
        details: {
          target_full_name: target.full_name,
          target_role: target.role,
          previous_rate: previousRate,
          new_rate: parsed,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('[profile/commission-rate-default] unexpected error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
