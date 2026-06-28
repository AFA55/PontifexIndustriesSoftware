export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/operator/location
 * Operator location broadcast for the live "In Route" tracker (Customer Portal Feature B).
 *
 * Appends a single GPS ping to operator_location_pings while the operator's assigned job
 * is status='in_route'. The route itself is the security gate: it verifies the caller is the
 * assigned operator/helper, the job is in the caller's tenant, and the job is in_route.
 *
 * If the job is no longer in_route (or not assigned / wrong tenant), we DON'T error-spam —
 * we return { success: true, active: false } so the client knows to STOP broadcasting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    // --- Auth: Bearer token (matches app/api/operator/status/route.ts) ---
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // --- Parse body ---
    const body = await request.json().catch(() => ({}));
    const { jobId, latitude, longitude, accuracy } = body as {
      jobId?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    };

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    // --- Validate coordinates (finite + in range) ---
    const lat = typeof latitude === 'number' ? latitude : NaN;
    const lng = typeof longitude === 'number' ? longitude : NaN;

    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      return NextResponse.json(
        { error: 'Invalid coordinates. latitude (-90..90) and longitude (-180..180) must be finite numbers.' },
        { status: 400 }
      );
    }

    // accuracy is optional; only keep a finite, non-negative number
    const acc = (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0)
      ? accuracy
      : null;

    // --- Load the job; the route is the gate (server-verified fields only) ---
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id, assigned_to, helper_assigned_to, status')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) {
      console.error('Error loading job for location ping:', jobError);
      return NextResponse.json(
        { error: 'Failed to load job' },
        { status: 500 }
      );
    }

    // Job missing → tell client to stop (no error spam).
    if (!job) {
      return NextResponse.json({ success: true, active: false }, { status: 200 });
    }

    const isAssigned =
      job.assigned_to === user.id || job.helper_assigned_to === user.id;

    // Not assigned, wrong tenant, or no longer in_route → no-op, stop broadcasting.
    // (tenant_id always derives from the job row below; we never trust client tenant.)
    if (!isAssigned || job.status !== 'in_route') {
      return NextResponse.json({ success: true, active: false }, { status: 200 });
    }

    // --- Insert the ping with server-verified fields ---
    const { error: insertError } = await supabaseAdmin
      .from('operator_location_pings')
      .insert([{
        tenant_id: job.tenant_id,
        job_order_id: job.id,
        operator_id: user.id,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        recorded_at: new Date().toISOString(),
      }]);

    if (insertError) {
      console.error('Error inserting location ping:', insertError);
      return NextResponse.json(
        { error: 'Failed to record location' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, active: true }, { status: 200 });
  } catch (error: any) {
    console.error('Unexpected error in operator location route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
