export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/timecard-settings — Get timecard settings for the tenant
 * PUT  /api/admin/timecard-settings — Update timecard settings (admin+)
 *
 * NOTE: This API reads/writes `timecard_settings_v2` — the FLAT, typed,
 * one-row-per-tenant table that clock-in/out actually read. The legacy
 * key/value `timecard_settings` table is NOT used (flat-column writes to it
 * silently failed — that was the persistence bug this fix closes).
 *
 * The page uses friendly field names; we map them to v2 columns:
 * - require_nfc        ↔ require_nfc_clock_in
 * - overtime_threshold ↔ overtime_threshold_weekly
 * - auto_clock_out     ↔ auto_clock_out_hours
 * - require_gps, auto_deduct_break, break_duration_minutes,
 *   break_threshold_hours, break_is_paid, late_grace_minutes — 1:1
 *
 * Page fields with no v2 column (allow_remote, night_shift_start,
 * shop_radius_meters) are returned from DEFAULT_SETTINGS on GET and silently
 * ignored on PUT (they never persisted before — no regression).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

// Default settings if no record exists (page-facing field names)
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
  late_grace_minutes: 15,
  subsistence_rate: 0,
};

// Sensible defaults for required NOT NULL v2 columns when inserting a fresh row.
const V2_INSERT_DEFAULTS = {
  require_nfc_clock_in: false,
  require_gps: true,
  auto_clock_out_hours: 0,
  break_duration_minutes: 30,
  auto_deduct_break: true,
  break_threshold_hours: 6,
  break_is_paid: false,
  overtime_threshold_weekly: 40,
  late_grace_minutes: 15,
  subsistence_rate: 0,
};

// Map a v2 row → page-facing field names for GET responses.
function v2ToPage(row: Record<string, unknown>) {
  return {
    require_nfc: row.require_nfc_clock_in,
    require_gps: row.require_gps,
    overtime_threshold: row.overtime_threshold_weekly,
    auto_clock_out: row.auto_clock_out_hours,
    auto_deduct_break: row.auto_deduct_break,
    break_duration_minutes: row.break_duration_minutes,
    break_threshold_hours: row.break_threshold_hours,
    break_is_paid: row.break_is_paid,
    late_grace_minutes: row.late_grace_minutes,
    subsistence_rate: row.subsistence_rate ?? 0,
    // Page fields with no v2 column — keep returning defaults so the UI doesn't break.
    allow_remote: DEFAULT_SETTINGS.allow_remote,
    night_shift_start: DEFAULT_SETTINGS.night_shift_start,
    shop_radius_meters: DEFAULT_SETTINGS.shop_radius_meters,
    tenant_id: row.tenant_id,
  };
}

// Map page-facing field name → v2 column name (only fields that persist).
const PAGE_TO_V2_COLUMN: Record<string, string> = {
  require_nfc: 'require_nfc_clock_in',
  require_gps: 'require_gps',
  overtime_threshold: 'overtime_threshold_weekly',
  auto_clock_out: 'auto_clock_out_hours',
  auto_deduct_break: 'auto_deduct_break',
  break_duration_minutes: 'break_duration_minutes',
  break_threshold_hours: 'break_threshold_hours',
  break_is_paid: 'break_is_paid',
  late_grace_minutes: 'late_grace_minutes',
  subsistence_rate: 'subsistence_rate',
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Fetch the tenant's single v2 settings row (the table clock-in/out actually read).
    let query = supabaseAdmin
      .from('timecard_settings_v2')
      .select('*');
    query = query.eq('tenant_id', tenantId);
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

    // Map v2 columns → page-facing field names.
    return NextResponse.json({ success: true, data: v2ToPage(data) });
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

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();

    // Build a v2-column update object from the page's friendly field names.
    // Page fields with no v2 column (allow_remote, night_shift_start,
    // shop_radius_meters) are silently ignored — they never persisted before.
    const updates: Record<string, unknown> = {};
    for (const [pageField, v2Column] of Object.entries(PAGE_TO_V2_COLUMN)) {
      if (body[pageField] !== undefined) {
        updates[v2Column] = body[pageField];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();
    updates.updated_by = auth.userId;

    // Upsert the tenant's single v2 row — check if it exists first.
    let existingQuery = supabaseAdmin
      .from('timecard_settings_v2')
      .select('id');
    existingQuery = existingQuery.eq('tenant_id', tenantId);
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
        .from('timecard_settings_v2')
        .update(updates)
        .eq('id', existing.id);
      const { data, error } = await updateQuery.select().single();
      if (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
      }
      result = data;
    } else {
      // Insert new — seed required NOT NULL columns then apply the mapped updates.
      const insertData = {
        ...V2_INSERT_DEFAULTS,
        ...updates,
        tenant_id: tenantId || null,
      };
      const { data, error } = await supabaseAdmin
        .from('timecard_settings_v2')
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
      data: v2ToPage(result),
    });
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
