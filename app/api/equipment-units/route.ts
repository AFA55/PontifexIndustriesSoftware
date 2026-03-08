/**
 * API Route: GET/POST /api/equipment-units
 * List equipment units (paginated, filterable) and create new units.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireAdmin } from '@/lib/api-auth';

// GET: Paginated list of equipment units (any authenticated user)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)));
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const operatorId = searchParams.get('operator_id');
    const search = searchParams.get('search');

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Count query with same filters
    let countQuery = supabaseAdmin
      .from('equipment_units')
      .select('*', { count: 'exact', head: true });

    if (category) countQuery = countQuery.eq('category', category);
    if (status) countQuery = countQuery.eq('lifecycle_status', status);
    if (operatorId) countQuery = countQuery.eq('current_operator_id', operatorId);
    if (search) countQuery = countQuery.ilike('name', `%${search}%`);

    const { count: total, error: countError } = await countQuery;

    if (countError) {
      console.error('[equipment-units GET] Count error:', countError);
      return NextResponse.json(
        { error: 'Failed to fetch equipment units' },
        { status: 500 }
      );
    }

    // Data query
    let query = supabaseAdmin
      .from('equipment_units')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('lifecycle_status', status);
    if (operatorId) query = query.eq('current_operator_id', operatorId);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data: units, error: fetchError } = await query;

    if (fetchError) {
      console.error('[equipment-units GET] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch equipment units' },
        { status: 500 }
      );
    }

    const totalCount = total ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Enrich units with operator names
    let enrichedUnits = units || [];
    const operatorIds = [...new Set(
      enrichedUnits
        .map((u: any) => u.current_operator_id)
        .filter(Boolean)
    )];

    if (operatorIds.length > 0) {
      const { data: operators } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds);

      const operatorMap = new Map(
        (operators || []).map((op: any) => [op.id, op.full_name])
      );

      enrichedUnits = enrichedUnits.map((u: any) => ({
        ...u,
        operator_name: operatorMap.get(u.current_operator_id) || null,
        assigned_since: u.assigned_at || null,
      }));
    }

    // Compute aggregate stats (unfiltered totals for dashboard cards)
    const [
      { count: totalAll },
      { count: activeCount },
      { count: needsServiceCount },
      { count: retiredCount },
    ] = await Promise.all([
      supabaseAdmin
        .from('equipment_units')
        .select('*', { count: 'exact', head: true }),
      supabaseAdmin
        .from('equipment_units')
        .select('*', { count: 'exact', head: true })
        .in('lifecycle_status', ['active', 'in_use']),
      supabaseAdmin
        .from('equipment_units')
        .select('*', { count: 'exact', head: true })
        .in('lifecycle_status', ['needs_service', 'in_maintenance', 'damaged']),
      supabaseAdmin
        .from('equipment_units')
        .select('*', { count: 'exact', head: true })
        .eq('lifecycle_status', 'retired'),
    ]);

    return NextResponse.json({
      data: enrichedUnits,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
      },
      stats: {
        total: totalAll ?? 0,
        active: activeCount ?? 0,
        needsService: needsServiceCount ?? 0,
        retired: retiredCount ?? 0,
      },
    });
  } catch (error: any) {
    console.error('[equipment-units GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new equipment unit (admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    // Validate required fields
    const required = ['name', 'category', 'equipment_type', 'manufacturer', 'model_number', 'size', 'manufacturer_serial'];
    const missing = required.filter((f) => !body[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const unitData: Record<string, any> = {
      name: body.name,
      category: body.category,
      equipment_type: body.equipment_type,
      manufacturer: body.manufacturer,
      model_number: body.model_number,
      size: body.size,
      manufacturer_serial: body.manufacturer_serial,
      purchase_price: body.purchase_price ?? null,
      purchase_date: body.purchase_date ?? null,
      inventory_id: body.inventory_id ?? null,
      estimated_life_linear_feet: body.estimated_life_linear_feet ?? null,
      notes: body.notes ?? null,
      photo_url: body.photo_url ?? null,
      lifecycle_status: 'available',
      created_by: auth.userId,
    };

    // Insert the unit (pontifex_id auto-generated by DB trigger)
    const { data: unit, error: insertError } = await supabaseAdmin
      .from('equipment_units')
      .insert(unitData)
      .select()
      .single();

    if (insertError) {
      console.error('[equipment-units POST] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create equipment unit' },
        { status: 500 }
      );
    }

    // Create a 'created' unit_event
    const { error: eventError } = await supabaseAdmin
      .from('unit_events')
      .insert({
        unit_id: unit.id,
        event_type: 'created',
        performed_by: auth.userId,
        description: `Unit "${unit.name}" created`,
      });

    if (eventError) {
      console.error('[equipment-units POST] Event creation error:', eventError);
      // Non-fatal: unit was created, event logging failed
    }

    return NextResponse.json(
      { success: true, data: unit },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[equipment-units POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
