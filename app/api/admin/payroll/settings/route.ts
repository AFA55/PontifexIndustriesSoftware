/**
 * API Route: GET/PUT /api/admin/payroll/settings
 * Manage payroll settings (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

/** Fields that admins are allowed to update */
const ALLOWED_FIELDS = [
  'pay_frequency',
  'week_start_day',
  'overtime_threshold_weekly',
  'overtime_multiplier',
  'double_time_threshold_daily',
  'double_time_multiplier',
  'default_per_diem_rate',
  'per_diem_taxable',
  'auto_lock_days_after_period',
  'require_timecard_approval',
  'company_name',
  'company_ein',
  'company_address',
  'company_state',
] as const;

// GET: Fetch the current payroll settings
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { data: settings, error: fetchError } = await supabaseAdmin
      .from('payroll_settings')
      .select('*')
      .limit(1)
      .single();

    if (fetchError) {
      console.error('Error fetching payroll settings:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch payroll settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: settings },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in payroll settings GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Update payroll settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    // Whitelist: only pick allowed fields from the body
    const updates: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided to update' },
        { status: 400 }
      );
    }

    // Fetch current settings so we can log old vs new values
    const { data: oldSettings, error: fetchError } = await supabaseAdmin
      .from('payroll_settings')
      .select('*')
      .limit(1)
      .single();

    if (fetchError) {
      console.error('Error fetching current payroll settings:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch current settings' },
        { status: 500 }
      );
    }

    // Add audit metadata to the update
    updates.updated_by = auth.userId;
    updates.updated_at = new Date().toISOString();

    // Update the single settings row
    const { data: updatedSettings, error: updateError } = await supabaseAdmin
      .from('payroll_settings')
      .update(updates)
      .eq('id', oldSettings.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating payroll settings:', updateError);
      return NextResponse.json(
        { error: 'Failed to update payroll settings' },
        { status: 500 }
      );
    }

    // Build changes object (old vs new) for audit trail
    const changes: Record<string, { from: any; to: any }> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in updates) {
        changes[field] = {
          from: oldSettings[field],
          to: updates[field],
        };
      }
    }

    // Audit log
    const ctx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'update',
      entityType: 'system',
      entityId: oldSettings.id,
      description: `Updated payroll settings: ${Object.keys(changes).join(', ')}`,
      changes,
      ...ctx,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Payroll settings updated successfully',
        data: updatedSettings,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in payroll settings PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
