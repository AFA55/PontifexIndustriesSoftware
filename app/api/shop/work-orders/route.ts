export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/shop/work-orders
 * List and create maintenance work orders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireShopUser } from '@/lib/api-auth';

// GET: List work orders with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopUser(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 100);
    const statusParam = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assigned_to');
    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabaseAdmin
      .from('maintenance_work_orders')
      .select('*', { count: 'exact' });

    // Status filter (can be comma-separated)
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        query = query.eq('status', statuses[0]);
      } else if (statuses.length > 1) {
        query = query.in('status', statuses);
      }
    }

    if (priority) query = query.eq('priority', priority);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    // Sort: critical first, then by created_at DESC
    query = query
      .order('priority', { ascending: true }) // critical comes first alphabetically
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: workOrders, count, error } = await query;

    if (error) {
      console.error('[shop/work-orders GET] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch work orders' }, { status: 500 });
    }

    // Enrich with equipment unit names and assignee names
    let enriched = workOrders || [];
    if (enriched.length > 0) {
      // Get unit info
      const unitIds = [...new Set(enriched.map((wo: any) => wo.unit_id).filter(Boolean))];
      const assigneeIds = [...new Set(enriched.map((wo: any) => wo.assigned_to).filter(Boolean))];

      const [unitsRes, profilesRes] = await Promise.all([
        unitIds.length > 0
          ? supabaseAdmin.from('equipment_units').select('id, name, pontifex_id, category').in('id', unitIds)
          : { data: [] },
        assigneeIds.length > 0
          ? supabaseAdmin.from('profiles').select('id, full_name').in('id', assigneeIds)
          : { data: [] },
      ]);

      const unitMap = new Map((unitsRes.data || []).map((u: any) => [u.id, u]));
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));

      enriched = enriched.map((wo: any) => {
        const unit = unitMap.get(wo.unit_id);
        return {
          ...wo,
          unit_name: unit?.name || null,
          unit_pontifex_id: unit?.pontifex_id || null,
          unit_category: unit?.category || null,
          assigned_to_name: profileMap.get(wo.assigned_to) || null,
        };
      });
    }

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error: any) {
    console.error('[shop/work-orders GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new work order
export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopUser(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { unit_id, title, description, priority, assigned_to, estimated_hours } = body;

    if (!unit_id || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: unit_id, title' },
        { status: 400 }
      );
    }

    // Verify unit exists
    const { data: unit, error: unitError } = await supabaseAdmin
      .from('equipment_units')
      .select('id, name')
      .eq('id', unit_id)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Equipment unit not found' }, { status: 404 });
    }

    const insertData: any = {
      unit_id,
      title,
      description: description || null,
      priority: priority || 'normal',
      status: assigned_to ? 'assigned' : 'pending',
      estimated_hours: estimated_hours || null,
      created_by: auth.userId,
    };

    if (assigned_to) {
      insertData.assigned_to = assigned_to;
      insertData.assigned_by = auth.userId;
      insertData.assigned_at = new Date().toISOString();
    }

    const { data: workOrder, error: insertError } = await supabaseAdmin
      .from('maintenance_work_orders')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('[shop/work-orders POST] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create work order' }, { status: 500 });
    }

    // Update equipment unit status to needs_service
    await supabaseAdmin
      .from('equipment_units')
      .update({ lifecycle_status: 'needs_service' })
      .eq('id', unit_id);

    return NextResponse.json({ success: true, data: workOrder }, { status: 201 });
  } catch (error: any) {
    console.error('[shop/work-orders POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
