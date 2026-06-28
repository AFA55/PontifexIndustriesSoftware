export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/public/portal/[token]/location?jobId=
 * PUBLIC — No auth required (customers have NO RLS path; uses the service-role client).
 *
 * PRIVACY-CRITICAL. This exposes an operator's live GPS to an unauthenticated,
 * token-gated customer. The contract is intentionally strict:
 *
 *   1. SAME token + job authorization gate as the comments endpoint
 *      (token length >= 16, customer_portal_tokens lookup, expires_at check,
 *      job scoped by tenant_id, then isPinnedJob || emailMatch || nameMatch).
 *   2. HARD privacy cutoff: if the job's status !== 'in_route', return ONLY
 *      { active: false } and nothing else. No coords are ever read or returned
 *      after arrival/completion.
 *   3. When active, return ONLY a strict whitelist — operator coords + timestamp
 *      + stale flag, the destination coords, and the operator's FIRST name.
 *      NEVER operator email/full name/phone/user_id/accuracy or any other job field.
 *
 * The token + job gate is copied VERBATIM from
 * app/api/public/portal/[token]/comments/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Pings older than this are flagged stale (operator may have lost signal).
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

type PortalGateResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      portalToken: {
        id: string;
        tenant_id: string;
        customer_name: string | null;
        customer_email: string | null;
        expires_at: string;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobRow: any;
    };

/**
 * Token + job authorization gate.
 * COPIED VERBATIM from app/api/public/portal/[token]/comments/route.ts —
 * the ONLY difference is the job_orders SELECT column list (this endpoint needs
 * status / in_route_at / route_start_* / assigned_to instead of comment fields).
 * The authorization logic (token length, token lookup, expiry, tenant scope,
 * isPinnedJob || emailMatch || nameMatch) is unchanged. Do NOT weaken.
 */
async function authorizeTokenAndJob(
  token: string,
  jobId: string
): Promise<PortalGateResult> {
  if (!token || typeof token !== 'string' || token.length < 16) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 400 }) };
  }

  if (!jobId || typeof jobId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Invalid job ID' }, { status: 400 }) };
  }

  // Validate the portal token
  const { data: portalToken, error: tokenError } = await supabaseAdmin
    .from('customer_portal_tokens')
    .select('id, tenant_id, customer_name, customer_email, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenError || !portalToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 }),
    };
  }

  if (new Date(portalToken.expires_at) < new Date()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'expired', message: 'This portal link has expired' },
        { status: 410 }
      ),
    };
  }

  // Fetch the job — must belong to the same tenant.
  // Strict column list: status drives the privacy cutoff; in_route_at + the
  // route_start_* coords serve as the destination + a pre-ping fallback;
  // assigned_to resolves the operator's first name. NEVER select('*').
  const { data: job, error: jobError } = await supabaseAdmin
    .from('job_orders')
    .select(
      'id, status, in_route_at, assigned_to, customer_name, customer_email, tenant_id, ' +
      'route_start_latitude, route_start_longitude'
    )
    .eq('id', jobId)
    .eq('tenant_id', portalToken.tenant_id)
    .maybeSingle();

  if (jobError || !job) {
    return { ok: false, response: NextResponse.json({ error: 'Job not found' }, { status: 404 }) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobRow = job as any;

  // Verify this customer can access the job
  // Allow if: customer_email matches token OR customer_name matches token (case-insensitive)
  // OR the token itself was pinned to this job_order_id
  const { data: tokenRow } = await supabaseAdmin
    .from('customer_portal_tokens')
    .select('job_order_id')
    .eq('token', token)
    .maybeSingle();

  const isPinnedJob = tokenRow?.job_order_id === jobId;
  const emailMatch =
    portalToken.customer_email &&
    jobRow.customer_email &&
    portalToken.customer_email.toLowerCase() === jobRow.customer_email.toLowerCase();
  const nameMatch =
    portalToken.customer_name &&
    jobRow.customer_name &&
    portalToken.customer_name.toLowerCase() === (jobRow.customer_name as string).toLowerCase();

  if (!isPinnedJob && !emailMatch && !nameMatch) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Access denied to this job' }, { status: 403 }),
    };
  }

  return { ok: true, portalToken, jobRow };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const jobId = request.nextUrl.searchParams.get('jobId') || '';

    // --- Token + job gate (copied verbatim) ---
    const gate = await authorizeTokenAndJob(token, jobId);
    if (!gate.ok) return gate.response;
    const { portalToken, jobRow } = gate;

    // --- HARD privacy cutoff -------------------------------------------------
    // Location is exposed ONLY while the job is actively in_route. After arrival
    // or completion we return ONLY { active: false } — no coords, no name, no
    // timestamps, nothing else. This is the load-bearing privacy gate.
    if (jobRow.status !== 'in_route') {
      return NextResponse.json({ active: false });
    }

    // --- Latest operator ping for this job ----------------------------------
    const { data: latestPing } = await supabaseAdmin
      .from('operator_location_pings')
      .select('latitude, longitude, recorded_at')
      .eq('job_order_id', jobId)
      .eq('tenant_id', portalToken.tenant_id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Operator position: newest ping, else fall back to the in_route GPS snapshot
    // (route_start_*) so the tracker shows *something* before the first ping.
    let operatorLat: number | null = null;
    let operatorLng: number | null = null;
    let recordedAt: string | null = null;

    if (latestPing && latestPing.latitude != null && latestPing.longitude != null) {
      operatorLat = Number(latestPing.latitude);
      operatorLng = Number(latestPing.longitude);
      recordedAt = latestPing.recorded_at ?? null;
    } else if (jobRow.route_start_latitude != null && jobRow.route_start_longitude != null) {
      operatorLat = Number(jobRow.route_start_latitude);
      operatorLng = Number(jobRow.route_start_longitude);
      recordedAt = jobRow.in_route_at ?? null;
    }

    // No coords available at all — active, but nothing to show yet.
    if (operatorLat == null || operatorLng == null) {
      return NextResponse.json({
        active: true,
        operator: null,
        destination: null,
        operator_first_name: resolveFirstName(await fetchOperatorFullName(jobRow.assigned_to)),
      });
    }

    // --- Staleness flag ------------------------------------------------------
    let stale = true;
    if (recordedAt) {
      const ageMs = Date.now() - new Date(recordedAt).getTime();
      stale = ageMs > STALE_AFTER_MS;
    }

    // --- Destination ---------------------------------------------------------
    // job_orders has NO geocoded jobsite coords. route_start_* is the OPERATOR's
    // location when they tapped In Route (their start point) — NOT the destination —
    // so using it as the destination would yield a misleading "distance/ETA". v1
    // returns null (tracker shows "on the way" + last-updated, no false ETA). v2:
    // geocode the job address to a real destination, then enable distance/ETA + a map.
    const destination = null;

    // --- Operator FIRST name only -------------------------------------------
    const fullName = await fetchOperatorFullName(jobRow.assigned_to);

    // --- Strict whitelist response ------------------------------------------
    // NEVER include operator email / full name / phone / user_id / accuracy or
    // any other job field.
    return NextResponse.json({
      active: true,
      operator: {
        latitude: operatorLat,
        longitude: operatorLng,
        recorded_at: recordedAt,
        stale,
      },
      destination,
      operator_first_name: resolveFirstName(fullName),
    });
  } catch (error) {
    console.error('Error in public portal location GET:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

/** Look up the operator's full_name (assigned_to is an auth.users id). */
async function fetchOperatorFullName(assignedTo: string | null): Promise<string | null> {
  if (!assignedTo) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', assignedTo)
    .maybeSingle();
  return profile?.full_name ?? null;
}

/** Reduce a full name to its first token; null if unavailable. */
function resolveFirstName(fullName: string | null): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}
