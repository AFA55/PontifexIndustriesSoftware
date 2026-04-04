export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/timecard-settings — Get timecard settings for the tenant
 * PUT  /api/admin/timecard-settings — Update timecard settings (admin+)
 *
 * Settings include:
 * - require_nfc:       boolean  — NFC scan required for clock-in
 * - require_gps:       boolean  — GPS verification required
 * - allow_remote:      boolean  — Allow remote clock-in with selfie
 * - overtime_threshold: number  — Weekly hours before OT kicks in (default 40)
 * - night_shift_start:  number  — Hour (0-23) when night shift begins (default 15)
 * - auto_clock_out:    number   — Auto-clock-out after N hours (0 = disabled)
 * - shop_radius_meters: number  — GPS geofence radius in meters
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

// Default settings if no record exists
const DEFAULT_SETTINGS = {
  require_nfc: false,
  require_gps: true,
  allow_remote: true,
  overtime_threshold: 40,
  night_shift_start: 15,
  auto_clock_out: 0,
  shop_radius_meters: 6.1,
  auto_deduct_break: true,
  break_duration_minutes: 30,
  break_threshold_hours: 6,
  break_is_paid: false,
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;

    // Try to fetch existing settings
    let query = supabaseAdmin
      .from('timecard_settings')
      .select('*');
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      if (isTableNotFoundError(error)) {
        // Table doesn't exist yet - return defaults
        return NextResponse.json({
          success: true,
          data: { ...DEFAULT_SETTINGS, tenant_id: tenantId },
          defaults: true,
        });
      }
      console.error('Error fetching timecard settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        data: { ...DEFAULT_SETTINGS, tenant_id: tenantId },
        defaults: true,
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    const body = await request.json();

    // Whitelist updatable fields
    const allowedFields = [
      'require_nfc', 'require_gps', 'allow_remote',
      'overtime_threshold', 'night_shift_start',
      'auto_clock_out', 'shop_radius_meters',
      'auto_deduct_break', 'break_duration_minutes',
      'break_threshold_hours', 'break_is_paid',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();
    updates.updated_by = auth.userId;

    // Try upsert - check if a row exists first
    let existingQuery = supabaseAdmin
      .from('timecard_settings')
      .select('id');
    if (tenantId) {
      existingQuery = existingQuery.eq('tenant_id', tenantId);
    }
    const { data: existing, error: checkError } = await existingQuery.limit(1).maybeSingle();

    if (checkError && isTableNotFoundError(checkError)) {
      return NextResponse.json(
        { error: 'Timecard settings table is not available yet.' },
        { status: 503 }
      );
    }

    let result;

    if (existing) {
      // Update existing
      let updateQuery = supabaseAdmin
        .from('timecard_settings')
        .update(updates)
        .eq('id', existing.id);
      const { data, error } = await updateQuery.select().single();
      if (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
      }
      result = data;
    } else {
      // Insert new
      const insertData = {
        ...DEFAULT_SETTINGS,
        ...updates,
        tenant_id: tenantId || null,
      };
      const { data, error } = await supabaseAdmin
        .from('timecard_settings')
        .insert(insertData)
        .select()
        .single();
      if (error) {
        console.error('Error inserting settings:', error);
        return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 });
      }
      result = data;
    }

    return NextResponse.json({
      success: true,
      message: 'Timecard settings updated',
      data: result,
    });
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
