export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/notification-settings
 * Fetch auto-notification settings.
 *
 * PUT /api/admin/notification-settings
 * Update auto-notification settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Fetch settings scoped by tenant
    const tenantId = auth.tenantId;
    let query = supabaseAdmin
      .from('notification_settings')
      .select('*');
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    let { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching notification settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    // If no settings exist, return defaults
    if (!data) {
      data = {
        auto_clock_in_reminder: true,
        clock_in_reminder_time: '07:30',
        auto_overtime_alert: false,
        overtime_alert_threshold: 40,
        auto_timecard_approval_reminder: true,
      };
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in notification-settings GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const {
      auto_clock_in_reminder,
      clock_in_reminder_time,
      auto_overtime_alert,
      overtime_alert_threshold,
      auto_timecard_approval_reminder,
    } = body;

    // Check if a settings row already exists (scoped to tenant)
    const tenantId = auth.tenantId;
    let existingQuery = supabaseAdmin
      .from('notification_settings')
      .select('id');
    if (tenantId) existingQuery = existingQuery.eq('tenant_id', tenantId);
    const { data: existing } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const settingsData = {
      auto_clock_in_reminder: auto_clock_in_reminder ?? true,
      clock_in_reminder_time: clock_in_reminder_time ?? '07:30',
      auto_overtime_alert: auto_overtime_alert ?? false,
      overtime_alert_threshold: overtime_alert_threshold ?? 40,
      auto_timecard_approval_reminder: auto_timecard_approval_reminder ?? true,
      updated_by: auth.userId,
      tenant_id: auth.tenantId || null,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing?.id) {
      // Update existing
      result = await supabaseAdmin
        .from('notification_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabaseAdmin
        .from('notification_settings')
        .insert(settingsData)
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error saving notification settings:', result.error);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Unexpected error in notification-settings PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
