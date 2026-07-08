export const dynamic = 'force-dynamic';

/**
 * Photo GPS locations (founder ask Jul 8 — "photos must be taken on the spot").
 *
 * POST — record the coordinates captured when a photo was taken. Called by
 *        PhotoUploader right after a successful upload. requireAuth; tenant
 *        comes from the CALLER's profile, never the body.
 * GET  — ?urls=a,b,c → { locations: { [url]: {lat,lng,accuracy_m,captured_at} } }
 *        tenant-scoped, used by photo viewers to show the 📍 stamp.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  try {
    const body = await request.json();
    const photoUrl = typeof body?.photo_url === 'string' ? body.photo_url.slice(0, 1000) : '';
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const accuracy = body?.accuracy_m != null ? Number(body.accuracy_m) : null;
    const jobId = typeof body?.job_id === 'string' && body.job_id ? body.job_id : null;

    if (!photoUrl || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'photo_url, lat, lng required' }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // If a job id is supplied it must belong to the caller's tenant.
    if (jobId) {
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('id')
        .eq('id', jobId)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.from('photo_locations').upsert(
      {
        tenant_id: auth.tenantId,
        photo_url: photoUrl,
        job_id: jobId,
        lat,
        lng,
        accuracy_m: Number.isFinite(accuracy as number) ? accuracy : null,
        taken_by: auth.userId,
        captured_at: new Date().toISOString(),
      },
      { onConflict: 'photo_url' }
    );
    if (error) {
      return NextResponse.json({ error: 'Failed to record location' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  const urlsParam = request.nextUrl.searchParams.get('urls') || '';
  const urls = urlsParam.split(',').map((u) => u.trim()).filter(Boolean).slice(0, 50);
  if (urls.length === 0) return NextResponse.json({ success: true, data: { locations: {} } });

  const { data, error } = await supabaseAdmin
    .from('photo_locations')
    .select('photo_url, lat, lng, accuracy_m, captured_at')
    .eq('tenant_id', auth.tenantId)
    .in('photo_url', urls);
  if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });

  const locations: Record<string, { lat: number; lng: number; accuracy_m: number | null; captured_at: string }> = {};
  for (const row of data ?? []) {
    locations[row.photo_url] = {
      lat: row.lat, lng: row.lng, accuracy_m: row.accuracy_m, captured_at: row.captured_at,
    };
  }
  return NextResponse.json({ success: true, data: { locations } });
}
