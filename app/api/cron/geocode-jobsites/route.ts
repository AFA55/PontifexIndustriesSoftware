export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/geocode-jobsites
 *
 * Backfills job_orders.jobsite_latitude/longitude by geocoding the job address
 * (Nominatim). Phase C groundwork — the persisted coordinates are what a future
 * geofence auto-arrival / shop-reminder checks against, and they sharpen the
 * existing distance/drive-time features today.
 *
 * Processes a small batch per run (Nominatim ~1 req/sec) — new jobs get
 * coordinates within a cron cycle. Each job is ATTEMPTED once (jobsite_geocoded_at
 * is stamped every attempt) so unresolvable addresses don't get re-hammered;
 * a successful attempt also writes the coordinates.
 *
 * Authorization: Bearer ${CRON_SECRET} (fail-closed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { geocodeAddress } from '@/lib/geocode-server';

const BATCH = 8;           // jobs per run
const SPACING_MS = 1200;   // polite gap between Nominatim calls

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Jobs not yet attempted, with an address to geocode. Newest first (upcoming
  // work matters most for geofencing).
  const { data: jobs, error } = await supabaseAdmin
    .from('job_orders')
    .select('id, address, location, tenant_id')
    .is('jobsite_geocoded_at', null)
    .not('address', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH);

  if (error) {
    console.error('[geocode-jobsites] fetch error:', error);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ success: true, processed: 0, geocoded: 0 });
  }

  let geocoded = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const addr = (job.address || job.location || '').trim();
    const point = addr ? await geocodeAddress(addr) : null;

    const update: Record<string, unknown> = { jobsite_geocoded_at: new Date().toISOString() };
    if (point) {
      update.jobsite_latitude = point.lat;
      update.jobsite_longitude = point.lng;
      geocoded++;
    }
    const { error: uErr } = await supabaseAdmin.from('job_orders').update(update).eq('id', job.id);
    if (uErr) console.error('[geocode-jobsites] update error:', job.id, uErr);

    if (i < jobs.length - 1) await sleep(SPACING_MS); // rate-limit Nominatim
  }

  console.log(`[geocode-jobsites] processed ${jobs.length}, geocoded ${geocoded}`);
  return NextResponse.json({ success: true, processed: jobs.length, geocoded });
}
