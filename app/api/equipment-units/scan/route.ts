/**
 * API Route: GET /api/equipment-units/scan
 * Look up an equipment unit by NFC tag ID or pontifex_id.
 * Creates an 'nfc_scanned' event when a unit is found.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const nfcTagId = searchParams.get('nfc_tag_id');
    const pontifexId = searchParams.get('pontifex_id');
    const genericQuery = searchParams.get('q'); // Smart lookup — tries pontifex_id, then nfc_tag_id, then manufacturer_serial

    if (!nfcTagId && !pontifexId && !genericQuery) {
      return NextResponse.json(
        { error: 'Missing required query parameter: q, nfc_tag_id, or pontifex_id' },
        { status: 400 }
      );
    }

    let unit: any = null;
    let unitError: any = null;

    if (nfcTagId) {
      // Direct NFC tag lookup
      const result = await supabaseAdmin
        .from('equipment_units')
        .select('*')
        .eq('nfc_tag_id', nfcTagId)
        .maybeSingle();
      unit = result.data;
      unitError = result.error;
    } else if (pontifexId) {
      // Direct pontifex_id lookup
      const result = await supabaseAdmin
        .from('equipment_units')
        .select('*')
        .eq('pontifex_id', pontifexId)
        .maybeSingle();
      unit = result.data;
      unitError = result.error;
    } else if (genericQuery) {
      // Smart lookup: try pontifex_id first, then nfc_tag_id, then manufacturer_serial
      const lookupValue = genericQuery.trim();

      // 1. Try pontifex_id (starts with PX-)
      if (lookupValue.startsWith('PX-')) {
        const result = await supabaseAdmin
          .from('equipment_units')
          .select('*')
          .eq('pontifex_id', lookupValue)
          .maybeSingle();
        unit = result.data;
        unitError = result.error;
      }

      // 2. If not found, try nfc_tag_id
      if (!unit && !unitError) {
        const result = await supabaseAdmin
          .from('equipment_units')
          .select('*')
          .eq('nfc_tag_id', lookupValue)
          .maybeSingle();
        unit = result.data;
        unitError = result.error;
      }

      // 3. If still not found, try manufacturer_serial
      if (!unit && !unitError) {
        const result = await supabaseAdmin
          .from('equipment_units')
          .select('*')
          .eq('manufacturer_serial', lookupValue)
          .maybeSingle();
        unit = result.data;
        unitError = result.error;
      }
    }

    if (unitError) {
      console.error('[equipment-units/scan GET] Lookup error:', unitError);
      return NextResponse.json(
        { error: 'Failed to look up equipment unit' },
        { status: 500 }
      );
    }

    if (!unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // Fetch recent events + assignment info in parallel
    const [eventsResult, assigneeResult] = await Promise.all([
      supabaseAdmin
        .from('unit_events')
        .select('*')
        .eq('unit_id', unit.id)
        .order('created_at', { ascending: false })
        .limit(20),
      unit.current_operator_id
        ? supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', unit.current_operator_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const { data: recentEvents, error: eventsError } = eventsResult;
    if (eventsError) {
      console.error('[equipment-units/scan GET] Events fetch error:', eventsError);
    }

    // Enrich events with performed_by_name
    let enrichedEvents = recentEvents || [];
    if (enrichedEvents.length > 0) {
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
    }

    // Build assignment info
    const assignment = assigneeResult.data
      ? {
          operator_name: assigneeResult.data.full_name,
          assigned_since: unit.assigned_at,
        }
      : null;

    // Create an 'nfc_scanned' event
    const scanIdentifier = nfcTagId || pontifexId || genericQuery;
    const scanMethod = nfcTagId ? 'nfc' : (pontifexId || (genericQuery && genericQuery.startsWith('PX-'))) ? 'id' : 'serial';
    const { error: scanEventError } = await supabaseAdmin
      .from('unit_events')
      .insert({
        unit_id: unit.id,
        event_type: 'nfc_scanned',
        performed_by: auth.userId,
        description: `Scanned via ${scanMethod === 'nfc' ? 'NFC tag' : scanMethod === 'id' ? 'Patriot ID' : 'lookup'} "${scanIdentifier}"`,
        metadata: {
          scan_method: scanMethod,
          identifier: scanIdentifier,
        },
      });

    if (scanEventError) {
      console.error('[equipment-units/scan GET] Scan event error:', scanEventError);
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      data: {
        unit,
        recentEvents: enrichedEvents,
        assignment,
      },
    });
  } catch (error: any) {
    console.error('[equipment-units/scan GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
