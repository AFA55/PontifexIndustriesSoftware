export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/shop/scheduled-maintenance
 * List and create scheduled maintenance entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireShopUser, requireShopManager } from '@/lib/api-auth';

// GET: List scheduled maintenance
export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopUser(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get('unit_id');
    const category = searchParams.get('category');
    const activeParam = searchParams.get('active');

    let query = supabaseAdmin
      .from('scheduled_maintenance')
      .select('*')
      .order('next_due_at', { ascending: true, nullsFirst: false });

    if (unitId) query = query.eq('unit_id', unitId);
    if (category) query = query.eq('category', category);
    if (activeParam !== null) query = query.eq('active', activeParam === 'true');

    const { data: schedules, error } = await query;

    if (error) {
      console.error('[shop/scheduled-maintenance GET] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch scheduled maintenance' }, { status: 500 });
    }

    // Enrich with unit names
    let enriched = schedules || [];
    const unitIds = [...new Set(enriched.filter((s: any) => s.unit_id).map((s: any) => s.unit_id))];
    if (unitIds.length > 0) {
      const { data: units } = await supabaseAdmin
        .from('equipment_units')
        .select('id, name, pontifex_id')
        .in('id', unitIds);

      const unitMap = new Map((units || []).map((u: any) => [u.id, u]));
      enriched = enriched.map((s: any) => ({
        ...s,
        unit_name: s.unit_id ? unitMap.get(s.unit_id)?.name || null : null,
        unit_pontifex_id: s.unit_id ? unitMap.get(s.unit_id)?.pontifex_id || null : null,
      }));
    }

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error('[shop/scheduled-maintenance GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create scheduled maintenance (shop_manager or admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopManager(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { unit_id, category, equipment_type, name, description, interval_hours, interval_days, interval_linear_feet, priority, checklist } = body;

    if (!name) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }

    if (!unit_id && !category) {
      return NextResponse.json(
        { error: 'Must provide either unit_id or category' },
        { status: 400 }
      );
    }

    // Calculate next_due_at if interval_days is set
    let nextDueAt = null;
    if (interval_days) {
      const next = new Date();
      next.setDate(next.getDate() + interval_days);
      nextDueAt = next.toISOString();
    }

    const insertData: any = {
      unit_id: unit_id || null,
      category: category || null,
      equipment_type: equipment_type || null,
      name,
      description: description || null,
      interval_hours: interval_hours || null,
      interval_days: interval_days || null,
      interval_linear_feet: interval_linear_feet || null,
      priority: priority || 'normal',
      checklist: checklist || [],
      next_due_at: nextDueAt,
      active: true,
      created_by: auth.userId,
    };

    const { data: schedule, error: insertError } = await supabaseAdmin
      .from('scheduled_maintenance')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('[shop/scheduled-maintenance POST] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create scheduled maintenance' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: schedule }, { status: 201 });
  } catch (error: any) {
    console.error('[shop/scheduled-maintenance POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
