/**
 * GET /api/admin/schedule-board/settings
 * Fetch schedule settings (capacity, etc.)
 *
 * PATCH /api/admin/schedule-board/settings
 * Update schedule settings (super_admin only)
 *
 * Access: admin, super_admin, salesman (read), super_admin (write)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess, requireSuperAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('schedule_settings')
      .select('*')
      .eq('setting_key', 'capacity')
      .single();

    if (error || !data) {
      // Return defaults if table doesn't exist yet
      return NextResponse.json({
        success: true,
        data: { max_slots: 10, warning_threshold: 8 },
      });
    }

    return NextResponse.json({
      success: true,
      data: data.setting_value,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({
      success: true,
      data: { max_slots: 10, warning_threshold: 8 },
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { max_slots, warning_threshold, shop_notes_enabled, shop_notes_label } = body;

    if (!max_slots || !warning_threshold) {
      return NextResponse.json(
        { error: 'max_slots and warning_threshold are required' },
        { status: 400 }
      );
    }

    if (max_slots < 1 || max_slots > 50) {
      return NextResponse.json(
        { error: 'max_slots must be between 1 and 50' },
        { status: 400 }
      );
    }

    if (warning_threshold < 1 || warning_threshold > max_slots) {
      return NextResponse.json(
        { error: 'warning_threshold must be between 1 and max_slots' },
        { status: 400 }
      );
    }

    // Upsert the capacity setting
    const settingValue: Record<string, unknown> = { max_slots, warning_threshold };
    if (typeof shop_notes_enabled === 'boolean') settingValue.shop_notes_enabled = shop_notes_enabled;
    if (typeof shop_notes_label === 'string') settingValue.shop_notes_label = shop_notes_label;

    const { data: existing } = await supabaseAdmin
      .from('schedule_settings')
      .select('id')
      .eq('setting_key', 'capacity')
      .single();

    if (existing) {
      const { error } = await supabaseAdmin
        .from('schedule_settings')
        .update({
          setting_value: settingValue,
          updated_by: auth.userId,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', 'capacity');

      if (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
      }
    } else {
      const { error } = await supabaseAdmin
        .from('schedule_settings')
        .insert({
          setting_key: 'capacity',
          setting_value: settingValue,
          updated_by: auth.userId,
        });

      if (error) {
        console.error('Error inserting settings:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: settingValue,
      message: `Capacity updated: ${max_slots} slots, warning at ${warning_threshold}`,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
