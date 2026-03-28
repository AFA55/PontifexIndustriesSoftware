/**
 * API Route: GET/POST /api/equipment-units/[id]/events
 * View paginated event history and create new events for a specific unit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

// Event types operators are allowed to create
const OPERATOR_ALLOWED_EVENTS = [
  'usage_logged',
  'maintenance_requested',
  'nfc_scanned',
  'damaged_reported',
  'notes_added',
];

// GET: Paginated event history for a unit
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)));
    const eventType = searchParams.get('event_type');

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Verify unit exists (tenant-scoped)
    let unitQuery = supabaseAdmin.from('equipment_units').select('id').eq('id', id);
    if (tenantId) unitQuery = unitQuery.eq('tenant_id', tenantId);
    const { data: unit, error: unitError } = await unitQuery.single();

    if (unitError || !unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // Count query
    let countQuery = supabaseAdmin
      .from('unit_events')
      .select('*', { count: 'exact', head: true })
      .eq('unit_id', id);

    if (eventType) countQuery = countQuery.eq('event_type', eventType);

    const { count: total, error: countError } = await countQuery;

    if (countError) {
      console.error('[equipment-units/:id/events GET] Count error:', countError);
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      );
    }

    // Data query
    let query = supabaseAdmin
      .from('unit_events')
      .select('*')
      .eq('unit_id', id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (eventType) query = query.eq('event_type', eventType);

    const { data: events, error: fetchError } = await query;

    if (fetchError) {
      console.error('[equipment-units/:id/events GET] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      );
    }

    const totalCount = total ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Enrich events with performed_by_name
    let enrichedEvents = events || [];
    const performerIds = [...new Set(
      enrichedEvents
        .map((e: any) => e.performed_by)
        .filter(Boolean)
    )];

    if (performerIds.length > 0) {
      const { data: performers } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', performerIds);

      const performerMap = new Map(
        (performers || []).map((p: any) => [p.id, p.full_name])
      );

      enrichedEvents = enrichedEvents.map((event: any) => ({
        ...event,
        performed_by_name: performerMap.get(event.performed_by) || null,
      }));
    }

    return NextResponse.json({
      data: enrichedEvents,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('[equipment-units/:id/events GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new event on a unit (operators can log certain events, admins can log any)
// Supports both JSON body and FormData (for photo uploads from NFC scan page)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const tenantIdPost = await getTenantId(auth.userId);

    const { id } = await params;

    // Parse body — support both JSON and FormData
    let body: Record<string, any> = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body.event_type = formData.get('event_type') as string;
      body.description = formData.get('description') as string || formData.get('title') as string || null;
      body.linear_feet = formData.get('linear_feet') ? parseFloat(formData.get('linear_feet') as string) : null;

      // Build metadata from form fields
      const title = formData.get('title') as string;
      const urgency = formData.get('urgency') as string;
      body.metadata = {};
      if (title) body.metadata.title = title;
      if (urgency) body.metadata.urgency = urgency;
      if (body.description && title) {
        body.description = `${title}: ${body.description}`;
      } else if (title) {
        body.description = title;
      }

      // Handle photo files — store file names in metadata for now
      // (actual file upload to storage would be a separate enhancement)
      const photos = formData.getAll('photos');
      if (photos && photos.length > 0) {
        body.metadata.photo_count = photos.length;
        body.metadata.photo_names = photos
          .filter((p): p is File => p instanceof File)
          .map((p) => p.name);
      }
    } else {
      body = await request.json();
    }

    if (!body.event_type) {
      return NextResponse.json(
        { error: 'Missing required field: event_type' },
        { status: 400 }
      );
    }

    // Check permissions: operators can only create certain event types
    const isAdmin = ['admin', 'super_admin'].includes(auth.role);
    if (!isAdmin && !OPERATOR_ALLOWED_EVENTS.includes(body.event_type)) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have permission to create this event type.' },
        { status: 403 }
      );
    }

    // Verify unit exists (tenant-scoped)
    let postUnitQuery = supabaseAdmin.from('equipment_units').select('id, lifecycle_status').eq('id', id);
    if (tenantIdPost) postUnitQuery = postUnitQuery.eq('tenant_id', tenantIdPost);
    const { data: unit, error: unitError } = await postUnitQuery.single();

    if (unitError || !unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // Create the event
    const eventData: Record<string, any> = {
      unit_id: id,
      event_type: body.event_type,
      performed_by: auth.userId,
      description: body.description ?? null,
      linear_feet: body.linear_feet ?? null,
      photo_urls: body.photo_urls ?? null,
      metadata: body.metadata && Object.keys(body.metadata).length > 0 ? body.metadata : null,
    };

    const { data: event, error: eventError } = await supabaseAdmin
      .from('unit_events')
      .insert(eventData)
      .select()
      .single();

    if (eventError) {
      console.error('[equipment-units/:id/events POST] Insert error:', eventError);
      return NextResponse.json(
        { error: 'Failed to create event' },
        { status: 500 }
      );
    }

    // If maintenance_requested, update unit lifecycle_status to 'needs_service'
    if (body.event_type === 'maintenance_requested') {
      const { error: updateError } = await supabaseAdmin
        .from('equipment_units')
        .update({
          lifecycle_status: 'needs_service',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        console.error('[equipment-units/:id/events POST] Status update error:', updateError);
        // Non-fatal: event was created, status update failed
      }
    }

    return NextResponse.json(
      { success: true, data: event },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[equipment-units/:id/events POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
