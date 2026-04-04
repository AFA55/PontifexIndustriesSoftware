export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface CapacitySettings {
  // Skill-based limits (max simultaneous jobs per skill type)
  skill_wall_saw: number;
  skill_brokk: number;
  skill_precision_dfs: number;
  skill_core_drilling: number;
  skill_slab_sawing: number;
  skill_flat_sawing: number;
  skill_wire_sawing: number;
  // High-priority job limit
  max_high_difficulty_jobs: number;
  high_difficulty_threshold: number;
  // Crew size limits
  max_operators_per_job: number;
  min_operators_high_difficulty: number;
  // General capacity
  max_slots: number;
  warning_threshold: number;
}

const DEFAULT_SETTINGS: CapacitySettings = {
  skill_wall_saw: 3,
  skill_brokk: 2,
  skill_precision_dfs: 2,
  skill_core_drilling: 4,
  skill_slab_sawing: 3,
  skill_flat_sawing: 3,
  skill_wire_sawing: 2,
  max_high_difficulty_jobs: 2,
  high_difficulty_threshold: 7,
  max_operators_per_job: 4,
  min_operators_high_difficulty: 2,
  max_slots: 10,
  warning_threshold: 8,
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('schedule_settings')
      .select('setting_value')
      .eq('setting_key', 'capacity')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching capacity settings:', error);
      return NextResponse.json({ error: 'Failed to fetch capacity settings' }, { status: 500 });
    }

    const settings = data?.setting_value
      ? { ...DEFAULT_SETTINGS, ...(data.setting_value as Partial<CapacitySettings>) }
      : DEFAULT_SETTINGS;

    return NextResponse.json({ success: true, data: settings });
  } catch (err) {
    console.error('Unexpected error in capacity-settings GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    // Validate all values are non-negative numbers
    const sanitized: Partial<CapacitySettings> = {};
    const numericKeys: (keyof CapacitySettings)[] = [
      'skill_wall_saw', 'skill_brokk', 'skill_precision_dfs',
      'skill_core_drilling', 'skill_slab_sawing', 'skill_flat_sawing', 'skill_wire_sawing',
      'max_high_difficulty_jobs', 'high_difficulty_threshold',
      'max_operators_per_job', 'min_operators_high_difficulty',
      'max_slots', 'warning_threshold',
    ];

    for (const key of numericKeys) {
      if (body[key] !== undefined) {
        const val = Number(body[key]);
        if (!isNaN(val) && val >= 0) {
          (sanitized as any)[key] = Math.round(val);
        }
      }
    }

    const merged = { ...DEFAULT_SETTINGS, ...sanitized };

    const { error } = await supabaseAdmin
      .from('schedule_settings')
      .upsert(
        {
          setting_key: 'capacity',
          setting_value: merged,
          updated_by: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'setting_key' }
      );

    if (error) {
      console.error('Error saving capacity settings:', error);
      return NextResponse.json({ error: 'Failed to save capacity settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: merged });
  } catch (err) {
    console.error('Unexpected error in capacity-settings PUT:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
