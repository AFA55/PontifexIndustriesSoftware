export const dynamic = 'force-dynamic';

/**
 * API Route: POST/GET /api/operator/maintenance-requests
 * Operators submit and view equipment maintenance requests.
 */

import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { userId, tenantId } = auth;

  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant associated with your account' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { equipment_id, equipment_number, photo_url, what_happened, whats_wrong } = body;

  if (!equipment_id || !what_happened || !whats_wrong) {
    return NextResponse.json(
      { error: 'equipment_id, what_happened, and whats_wrong are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('equipment_maintenance_requests')
    .insert({
      tenant_id: tenantId,
      operator_id: userId,
      equipment_id,
      equipment_number: equipment_number ?? null,
      photo_url: photo_url ?? null,
      what_happened,
      whats_wrong,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error inserting maintenance request:', error);
    return NextResponse.json({ error: 'Failed to submit maintenance request' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { id: data.id } }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { userId } = auth;

  const { data, error } = await supabaseAdmin
    .from('equipment_maintenance_requests')
    .select('*')
    .eq('operator_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching maintenance requests:', error);
    return NextResponse.json({ error: 'Failed to fetch maintenance requests' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data }, { status: 200 });
}
