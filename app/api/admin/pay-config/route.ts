export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/pay-config — fetch tenant pay config (or defaults if not yet set)
 * PUT  /api/admin/pay-config — upsert tenant pay config
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { DEFAULT_PAY_CONFIG } from '@/lib/pay-calculator';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('pay_category_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching pay config:', error);
      return NextResponse.json({ error: 'Failed to fetch pay config' }, { status: 500 });
    }

    // Return defaults if not configured yet
    const config = data ?? {
      ...DEFAULT_PAY_CONFIG,
      tenant_id: tenantId,
      id: null,
    };

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/pay-config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const body = await request.json();
    const {
      overtime_threshold_hours,
      night_shift_start_hour,
      night_shift_premium_rate,
      overtime_rate,
    } = body;

    // Validate
    if (
      typeof overtime_threshold_hours !== 'number' ||
      typeof night_shift_start_hour !== 'number' ||
      typeof night_shift_premium_rate !== 'number' ||
      typeof overtime_rate !== 'number'
    ) {
      return NextResponse.json({ error: 'All fields are required and must be numbers' }, { status: 400 });
    }

    if (night_shift_start_hour < 0 || night_shift_start_hour > 23) {
      return NextResponse.json({ error: 'night_shift_start_hour must be 0–23' }, { status: 400 });
    }

    if (overtime_threshold_hours < 1) {
      return NextResponse.json({ error: 'overtime_threshold_hours must be >= 1' }, { status: 400 });
    }

    if (night_shift_premium_rate < 1 || overtime_rate < 1) {
      return NextResponse.json({ error: 'Rate multipliers must be >= 1' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('pay_category_config')
      .upsert(
        {
          tenant_id: tenantId,
          overtime_threshold_hours,
          night_shift_start_hour,
          night_shift_premium_rate,
          overtime_rate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving pay config:', error);
      return NextResponse.json({ error: 'Failed to save pay config' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in PUT /api/admin/pay-config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
