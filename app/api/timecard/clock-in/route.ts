export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/timecard/clock-in
 * Clock in with NFC verification, GPS fallback, or remote mode
 *
 * Clock-in methods:
 * - NFC:         Scan registered NFC tag (shop, truck, or jobsite) via Web NFC API or URL tap
 * - GPS:         Legacy geolocation check within shop radius
 * - REMOTE:      Out-of-town with selfie photo + GPS (requires admin approval)
 * - GPS_REMOTE:  Out-of-town GPS-only mode; no photo required; requires admin approval
 * - PIN:         Daily shop PIN entered on device without NFC support
 *
 * Hour categorization rules:
 * - REGULAR:          Mon-Fri, clock-in before 3 PM, non-shop
 * - NIGHT SHIFT:      Mon-Fri, clock-in at or after 3 PM, JOB only (NOT shop hours)
 * - MANDATORY OT:     Saturday or Sunday - always overtime regardless of weekly total
 * - WEEKLY OT:        Calculated at display time when Mon-Fri hours exceed 40
 * - SHOP HOURS:       Flagged separately; never classified as night shift
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import { isWithinShopRadius, SHOP_LOCATION, ALLOWED_RADIUS_METERS, ShopOverride } from '@/lib/geolocation';
import { resolveEffectiveStart, computeLate } from '@/lib/timecard-start';
import { endOfDayUTC } from '@/lib/dates';
import { canBeCrewMember } from '@/lib/rbac';
import { pickClockInJob, type ClockInJobCandidate } from '@/lib/clock-in-job';
import { UNCLOCKABLE_INFERRED_JOB_STATUSES, postgrestNotInList } from '@/lib/job-status';
import { jobStartOnDate } from '@/lib/job-day-boundary';

const NIGHT_SHIFT_START_HOUR = 15;

// Haversine distance in kilometres between two lat/lon points
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const user = { id: auth.userId, email: auth.userEmail };

    // -- Rate limit: reject if last clock-in was < 60 seconds ago --
    const { data: recentEntry } = await supabaseAdmin
      .from('timecards')
      .select('id, clock_in_time')
      .eq('user_id', user.id)
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentEntry) {
      const secondsAgo = (Date.now() - new Date(recentEntry.clock_in_time).getTime()) / 1000;
      if (secondsAgo < 60) {
        return NextResponse.json(
          { error: 'Please wait before clocking in again.', block_type: 'rate_limited' },
          { status: 429 }
        );
      }
    }

    const body = await request.json();
    const {
      latitude,
      longitude,
      accuracy,
      is_shop_hours,
      // Work location for the day — 'field' (default) or 'shop'.
      // Drives whether the user sees operator-style or shop-help dashboard.
      work_location: rawWorkLocation,
      // NFC fields
      clock_in_method = 'gps',   // 'nfc' | 'gps' | 'remote' | 'gps_remote' | 'pin'
      nfc_tag_id,                 // UUID of the verified NFC tag
      nfc_tag_uid,                // raw NFC tag UID (NDEF text or serial)
      nfc_tag_serial,             // hardware serial number from Web NFC API NDEFReader
      // Remote / approval fields
      remote_photo_url,           // selfie URL for remote clock-in
      requires_approval,          // boolean — true for gps_remote clock-ins
      out_of_town,                // boolean — asked on each remote clock-in (overnight per-diem)
    } = body;

    const work_location: 'field' | 'shop' =
      rawWorkLocation === 'shop' ? 'shop' : 'field';

    // Validate clock_in_method to prevent injection of unexpected values
    // 'field' = supervisor/field-worker GPS clock-in anywhere (no shop radius, no approval)
    // PIN/code clock-in removed — clock-in is verified by GPS (on-site) or photo (remote).
    const VALID_CLOCK_METHODS = ['nfc', 'gps', 'remote', 'gps_remote', 'field'] as const;
    if (!VALID_CLOCK_METHODS.includes(clock_in_method as any)) {
      return NextResponse.json(
        { error: 'Invalid clock_in_method. Must be nfc, gps, remote, gps_remote, or field.' },
        { status: 400 }
      );
    }

    // Validation - location required for GPS and remote; optional for NFC and pin
    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';

    if (!hasLocation && clock_in_method !== 'nfc' && clock_in_method !== 'pin') {
      return NextResponse.json(
        { error: 'Invalid location data. Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    // --- Read tenant timecard settings (v2 — the active table clock-in reads) ---
    // Hoisted out of the GPS-only block: late detection runs for ALL clock-in
    // methods, so the late grace period must be available regardless of method.
    let tcSettings: { require_nfc?: boolean; late_grace_minutes?: number } | null = null;
    try {
      if (auth.tenantId) {
        const { data: v2 } = await supabaseAdmin
          .from('timecard_settings_v2')
          // NOTE: the column is `require_nfc_clock_in`; alias it to require_nfc so
          // the downstream check + late_grace_minutes both resolve (the un-aliased
          // name 42703-errors and nulls the whole row — that bug killed both reads).
          .select('require_nfc:require_nfc_clock_in, late_grace_minutes')
          .eq('tenant_id', auth.tenantId)
          .limit(1)
          .maybeSingle();
        tcSettings = v2 ?? null;
      }
    } catch {
      // If settings table doesn't exist, fall back to defaults below
    }
    // Late grace period (minutes past scheduled start before flagged late). Default 15.
    const graceMinutes = tcSettings?.late_grace_minutes ?? 7;

    // --- Server-side bypass_nfc verification ---
    // If NFC is required by settings but user is using GPS method, verify they have
    // an admin-issued bypass notification (prevents manual URL param bypass)
    // gps_remote, pin, and field bypass the NFC requirement by design
    if (clock_in_method === 'gps') {
      try {
        if (tcSettings?.require_nfc) {
          // NFC is required — check for a valid bypass notification from an admin
          const { data: bypassNotification } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('user_id', auth.userId)
            .eq('bypass_nfc', true)
            .eq('is_read', false)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

          if (!bypassNotification) {
            return NextResponse.json(
              { error: 'NFC scan is required to clock in. If you cannot use NFC, ask your supervisor for a bypass.' },
              { status: 403 }
            );
          }

          // Mark the bypass notification as read (single-use)
          Promise.resolve(
            supabaseAdmin
              .from('notifications')
              .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
              .eq('id', bypassNotification.id)
          ).catch(() => {});
        }
      } catch {
        // NFC requirement check is non-critical
      }
    }

    // -- Hour categorization --
    const now = new Date();

    // Fetch tenant timezone + shop GPS fields for accurate date + per-tenant clock-in radius.
    // UTC-based split breaks for eastern-timezone operators clocking in late at night.
    const tenantId = auth.tenantId || null;
    let tenantTz = 'America/New_York';
    let shopOverride: ShopOverride | undefined;
    try {
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('timezone, shop_latitude, shop_longitude, shop_name, clock_in_radius_meters, clock_out_radius_meters')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantRow?.timezone) tenantTz = tenantRow.timezone;
      if (tenantRow?.shop_latitude != null && tenantRow?.shop_longitude != null) {
        shopOverride = {
          latitude: tenantRow.shop_latitude,
          longitude: tenantRow.shop_longitude,
          name: tenantRow.shop_name ?? SHOP_LOCATION.name,
          radius: tenantRow.clock_in_radius_meters ?? undefined,
          clockOutRadius: tenantRow.clock_out_radius_meters ?? undefined,
        };
      }
    } catch {
      // Non-critical — fall back to hardcoded Patriot pin
    }
    const todayDate = now.toLocaleDateString('en-CA', { timeZone: tenantTz }); // YYYY-MM-DD

    // -- Method-specific validation --

    if (clock_in_method === 'nfc') {
      if (!nfc_tag_id && !nfc_tag_uid && !nfc_tag_serial) {
        return NextResponse.json(
          { error: 'NFC tag verification required. Please scan your NFC tag.' },
          { status: 400 }
        );
      }

      // Double-check the tag is valid, active, AND belongs to the operator's tenant.
      // Tenant scoping prevents an attacker from clocking in via another tenant's tag.
      let tagBuilder = nfc_tag_id
        ? supabaseAdmin.from('nfc_tags').select('id, tag_uid, is_active, label, tag_type, tenant_id').eq('id', nfc_tag_id)
        : supabaseAdmin.from('nfc_tags').select('id, tag_uid, is_active, label, tag_type, tenant_id').eq('tag_uid', nfc_tag_uid || nfc_tag_serial);
      if (auth.tenantId) tagBuilder = tagBuilder.eq('tenant_id', auth.tenantId);
      const { data: tag } = await tagBuilder.maybeSingle();

      if (!tag || !tag.is_active) {
        return NextResponse.json(
          { error: 'NFC tag not recognized or deactivated. Contact your supervisor.' },
          { status: 403 }
        );
      }
    } else if (clock_in_method === 'remote') {
      // Require a real uploaded photo path. Reject empty AND the legacy
      // 'photo-upload-failed' sentinel (which used to be written when the
      // client-side upload to a non-existent bucket silently failed).
      if (!remote_photo_url || remote_photo_url === 'photo-upload-failed') {
        return NextResponse.json(
          { error: 'A selfie photo is required for remote clock-in. Please retake the photo and try again.' },
          { status: 400 }
        );
      }
    } else if (clock_in_method === 'gps_remote') {
      // GPS-only out-of-town mode — just needs valid coordinates; requires admin approval
      if (!hasLocation || (latitude === 0 && longitude === 0)) {
        return NextResponse.json(
          { error: 'GPS coordinates are required for out-of-town clock-in. Enable location access and try again.' },
          { status: 400 }
        );
      }
    } else if (clock_in_method === 'pin') {
      // PIN already verified by /api/timecard/verify-pin before this call; no extra check needed here
    } else if (clock_in_method === 'field') {
      // Field GPS clock-in (supervisors and other field workers not based at the shop).
      // Just needs valid coordinates — no shop radius enforcement, no approval required.
      if (!hasLocation || (latitude === 0 && longitude === 0)) {
        return NextResponse.json(
          { error: 'GPS coordinates are required. Enable location access and try again.' },
          { status: 400 }
        );
      }
    } else {
      // GPS clock-in: verify location within shop radius (per-tenant pin when configured)
      const locationCheck = isWithinShopRadius({ latitude, longitude, accuracy }, shopOverride);
      const shopName = shopOverride?.name ?? SHOP_LOCATION.name;
      const allowedRadiusMeters = shopOverride?.radius ?? ALLOWED_RADIUS_METERS;

      if (!locationCheck.isWithinRange) {
        return NextResponse.json(
          {
            error: `You must be at ${shopName} to clock in with GPS.`,
            details: `You are ${locationCheck.distanceFormatted} away. Maximum allowed distance is ${(allowedRadiusMeters * 3.28084).toFixed(0)} feet.`,
            distance: locationCheck.distance,
            distanceFormatted: locationCheck.distanceFormatted,
            allowedRadius: allowedRadiusMeters,
            hint: 'Try scanning an NFC tag or use Remote Clock-In if you are at a jobsite.',
          },
          { status: 403 }
        );
      }
    }

    // -- Check for active clock-in --
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', user.id)
      .single();

    // Auto-close any stale open timecards from previous days before checking today
    const { data: staleTimecards } = await supabaseAdmin
      .from('timecards')
      .select('id, date, clock_in_time')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .lt('date', todayDate);

    for (const stale of staleTimecards ?? []) {
      // End of the OPERATOR's day, not 23:59:59 UTC (= 7:59 PM ET).
      const eod = endOfDayUTC(stale.date, tenantTz);
      await supabaseAdmin
        .from('timecards')
        .update({ clock_out_time: eod, notes: 'Auto-closed: no clock-out recorded' })
        .eq('id', stale.id);
    }

    // -- Global duplicate open timecard guard (any date) --
    // Return 409 with a clear message rather than letting a Postgres constraint violation surface.
    const { data: existingOpen } = await supabaseAdmin
      .from('timecards')
      .select('id, clock_in_time')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .maybeSingle();

    if (existingOpen) {
      return NextResponse.json(
        {
          error: 'You are already clocked in.',
          details: `Active clock-in started at ${new Date(existingOpen.clock_in_time).toLocaleTimeString()}. Clock out first.`,
          block_type: 'already_clocked_in',
        },
        { status: 409 }
      );
    }

    // Check for an active clock-in for TODAY only (legacy path — kept for DB error surfacing)
    const { data: activeTimecard, error: checkError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', todayDate)
      .is('clock_out_time', null)
      .maybeSingle();

    if (checkError && isTableNotFoundError(checkError)) {
      return NextResponse.json(
        { error: 'Timecard system is not available yet.' },
        { status: 503 }
      );
    }

    // Note: the global check above already covers this case with a 409.
    // This branch is now a safety net for any edge-case the global query misses.
    if (activeTimecard) {
      return NextResponse.json(
        {
          error: 'You are already clocked in.',
          details: `You clocked in at ${new Date(activeTimecard.clock_in_time).toLocaleTimeString()}. Please clock out first.`,
          block_type: 'already_clocked_in',
          activeTimecard: { id: activeTimecard.id, clockInTime: activeTimecard.clock_in_time },
        },
        { status: 409 }
      );
    }
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay();

    const isMandatoryOvertime = dayOfWeek === 0 || dayOfWeek === 6;
    const isNightShift = !isMandatoryOvertime && !is_shop_hours && currentHour >= NIGHT_SHIFT_START_HOUR;

    let hourType = 'regular';
    if (isMandatoryOvertime) hourType = 'mandatory_overtime';
    else if (isNightShift) hourType = 'night_shift';

    // -- Build insert data --
    // 'field' clock-in is for supervisors/field workers — no shop radius enforcement, no approval needed
    const needsApproval = (clock_in_method === 'gps_remote' || requires_approval === true) && clock_in_method !== 'field';

    const insertData: Record<string, unknown> = {
      user_id: user.id,
      tenant_id: tenantId,
      clock_in_time: now.toISOString(),
      clock_in_latitude: latitude,
      clock_in_longitude: longitude,
      clock_in_accuracy: accuracy || null,
      date: todayDate,
      is_approved: false,
      is_shop_hours: is_shop_hours === true,
      is_night_shift: isNightShift,
      hour_type: hourType,
      clock_in_method,
      nfc_tag_id: nfc_tag_id || null,
      nfc_tag_uid: nfc_tag_uid || null,
      nfc_tag_serial: nfc_tag_serial || null,
      remote_photo_url: (remote_photo_url && remote_photo_url !== 'photo-upload-failed') ? remote_photo_url : null,
      requires_approval: needsApproval,
      work_location,
      out_of_town: out_of_town === true,
    };

    if (clock_in_method === 'remote' || clock_in_method === 'gps_remote') {
      insertData.remote_verified = null; // null = pending review
    }

    // Associate the job the operator is on today so the timecard shows WHERE
    // they were (job) and WHO they're with (crew is derived from same job+date).
    // Best-effort — never blocks the clock-in.
    //
    // THE GAP (measured Aug 11): this only ever looked at the two job-level
    // slots, so 37 of 90 recent FIELD timecards carried no job at all — roughly
    // 40%. That makes "hours by contractor / by project" (M9) quietly omit
    // nearly half the hours, which is worse than having no number because the
    // founder would trust it. Two more places know where someone is:
    //   - job_crew — extra crew on a job beyond the two slots
    //   - job_daily_assignments — the per-day ledger, which is AUTHORITATIVE for
    //     who is on a job on a given day (the clock-out gate already defers to
    //     it, and the office swaps crew day to day)
    // The ledger is checked FIRST for exactly that reason.
    //
    // THE SECOND GAP (Aug 20, in production): widening the question was right,
    // but the answer was taken on trust. The ledger read had NO STATUS FILTER
    // and `.limit(1)` with NO `ORDER BY`, so Conrade was clocked in to a job he
    // had completed the previous afternoon and the office could not dispatch
    // him. Which candidate wins is now decided by ONE documented, unit-tested
    // rule in lib/clock-in-job.ts — earliest-sequenced OPEN job — and every
    // lookup below feeds it instead of each picking for itself.
    //
    // A holder rather than a bare `let`: the assignment happens inside `settle`
    // below, and TypeScript's flow analysis cannot see through a closure — a
    // plain `let` narrows to `null` at the read site and the job name becomes
    // unreachable code. The box makes the mutation explicit instead of casting
    // the narrowing away at the point of use.
    const jobLink: {
      value: { id: string; job_number: string | null; customer_name: string | null } | null;
    } = { value: null };
    if (tenantId) {
      try {
        /**
         * Turn a set of job ids into scored candidates. ONE indexed read on the
         * primary key, tenant-scoped explicitly because `supabaseAdmin` bypasses
         * RLS. It carries everything three different needs want: the status the
         * rule filters on, the fields it orders by, and the job number the
         * operator is shown — so no surface below costs an extra query.
         */
        const loadCandidates = async (
          ids: string[],
          sequenceByJob?: Map<string, number | null>
        ): Promise<{ candidates: ClockInJobCandidate[]; rows: Map<string, any> }> => {
          const rows = new Map<string, any>();
          const unique = Array.from(new Set(ids.filter(Boolean)));
          if (unique.length === 0) return { candidates: [], rows };
          const { data, error } = await supabaseAdmin
            .from('job_orders')
            .select('id, job_number, customer_name, status, scheduled_date, route_started_at, in_route_at, work_started_at')
            .eq('tenant_id', tenantId)
            .in('id', unique);
          // A dead read must not present as "no job today" — say so and let the
          // clock-in proceed with a null, which is the honest answer.
          if (error) {
            console.error('[clock-in] job candidate read failed', { userId: user.id, tenantId, error });
            return { candidates: [], rows };
          }
          const candidates: ClockInJobCandidate[] = [];
          for (const j of data ?? []) {
            rows.set(j.id, j);
            candidates.push({
              job_order_id: j.id,
              status: j.status ?? null,
              day_sequence: sequenceByJob?.get(j.id) ?? null,
              // Guard (a) from lib/job-day-boundary.ts applies here too: a press
              // recorded on ANOTHER day says nothing about this morning.
              started_at: jobStartOnDate(todayDate, [], j, j.id, tenantTz),
              scheduled_date: j.scheduled_date ?? null,
            });
          }
          return { candidates, rows };
        };

        /** Log the decision once, wherever it came from. Never silent again. */
        const settle = (
          resolution: ReturnType<typeof pickClockInJob>,
          rows: Map<string, any>,
          source: string
        ) => {
          // A ledger row pointing at a finished job is the Aug 20 signature and
          // the ONLY canary for a ledger nothing prunes. It must be loud.
          for (const c of resolution.closed) {
            console.warn(
              `[clock-in] STALE ASSIGNMENT ignored — ${source} placed ${user.id} on job ${c.job_order_id} ` +
                `(${rows.get(c.job_order_id)?.job_number ?? 'unknown'}) for ${todayDate}, but that job is ` +
                `"${c.status}". Not clocking in to a closed job.`,
              { userId: user.id, tenantId, jobOrderId: c.job_order_id, status: c.status, date: todayDate }
            );
          }
          if (resolution.jobOrderId) {
            const row = rows.get(resolution.jobOrderId);
            jobLink.value = {
              id: resolution.jobOrderId,
              job_number: row?.job_number ?? null,
              customer_name: row?.customer_name ?? null,
            };
            console.log(
              `[clock-in] job resolved via ${source}: ${row?.job_number ?? resolution.jobOrderId}` +
                (resolution.contested ? ' (several open jobs today — earliest in the day\'s sequence won)' : ''),
              { userId: user.id, jobOrderId: resolution.jobOrderId, source, contested: resolution.contested }
            );
          }
          return resolution.jobOrderId != null;
        };

        // 1. Today's ledger entry — the most specific answer there is. EVERY row
        //    is read, not an arbitrary one, so a day with two placements is
        //    decided by the board's own sequence rather than by Postgres.
        const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
          .from('job_daily_assignments')
          .select('job_order_id, day_sequence')
          .eq('tenant_id', tenantId)
          .eq('assignment_date', todayDate)
          .or(`operator_id.eq.${user.id},helper_id.eq.${user.id}`)
          .limit(20);
        if (ledgerError) {
          console.error('[clock-in] daily-assignment read failed', { userId: user.id, tenantId, error: ledgerError });
        }
        const sequenceByJob = new Map<string, number | null>();
        for (const r of ledgerRows ?? []) {
          if (!r?.job_order_id) continue;
          const prev = sequenceByJob.get(r.job_order_id);
          const next = r.day_sequence ?? null;
          if (prev == null || (next != null && next < prev)) sequenceByJob.set(r.job_order_id, next);
        }

        let done = false;
        if (sequenceByJob.size > 0) {
          const { candidates, rows } = await loadCandidates(Array.from(sequenceByJob.keys()), sequenceByJob);
          // CLOSED-ONLY refusal here: the ledger is the office naming a person,
          // a job and a DATE. It outranks a status flag nobody cleared — on Aug
          // 20 Conrade's real job had been `on_hold` since the 14th and the
          // office placed him on it regardless. See job-status.ts.
          done = settle(pickClockInJob(candidates), rows, 'the day ledger');
        }

        // 2. A job-level slot on a job running today. The status exclusion is
        //    kept in SQL (it is indexed and cheap) AND re-applied in the rule,
        //    so neither one alone is load-bearing.
        if (!done) {
          const { data: slotJobs } = await supabaseAdmin
            .from('job_orders')
            .select('id')
            .eq('tenant_id', tenantId)
            .or(`assigned_to.eq.${user.id},helper_assigned_to.eq.${user.id}`)
            .lte('scheduled_date', todayDate)
            .or(`scheduled_date.eq.${todayDate},end_date.gte.${todayDate}`)
            .not('status', 'in', postgrestNotInList(UNCLOCKABLE_INFERRED_JOB_STATUSES))
            .not('dispatched_at', 'is', null)
            .order('scheduled_date', { ascending: false })
            .limit(10);
          const slotIds = (slotJobs ?? []).map((j: { id: string }) => j.id).filter(Boolean);
          if (slotIds.length > 0) {
            const { candidates, rows } = await loadCandidates(slotIds);
            done = settle(
              pickClockInJob(candidates, { refuse: UNCLOCKABLE_INFERRED_JOB_STATUSES }),
              rows,
              'the job crew slots'
            );
          }
        }

        // 3. Crewed on a job running today (neither slot, but on the crew).
        if (!done) {
          const { data: crewRows } = await supabaseAdmin
            .from('job_crew')
            .select('job_order_id')
            .eq('user_id', user.id);
          const crewJobIds = (crewRows ?? [])
            .map((c: { job_order_id: string }) => c.job_order_id)
            .filter(Boolean);
          if (crewJobIds.length > 0) {
            const { data: crewJobs } = await supabaseAdmin
              .from('job_orders')
              .select('id')
              .eq('tenant_id', tenantId)
              .in('id', crewJobIds)
              .lte('scheduled_date', todayDate)
              .or(`scheduled_date.eq.${todayDate},end_date.gte.${todayDate}`)
              .not('status', 'in', postgrestNotInList(UNCLOCKABLE_INFERRED_JOB_STATUSES))
              .order('scheduled_date', { ascending: false })
              .limit(10);
            const ids = (crewJobs ?? []).map((j: { id: string }) => j.id).filter(Boolean);
            if (ids.length > 0) {
              const { candidates, rows } = await loadCandidates(ids);
              done = settle(
                pickClockInJob(candidates, { refuse: UNCLOCKABLE_INFERRED_JOB_STATUSES }),
                rows,
                'the job crew list'
              );
            }
          }
        }

        // NOTHING RESOLVED = NULL, NOT THE CLOSEST THING WE FOUND. The read-time
        // deriver (lib/timecard-job-context.ts) renders this as "not recorded",
        // which the office can see and fix. A guess written into a payroll row
        // is indistinguishable from something the operator actually did.
        if (!done) {
          console.log('[clock-in] no open job resolved — leaving job_order_id null', {
            userId: user.id,
            tenantId,
            date: todayDate,
          });
        }

        if (jobLink.value) insertData.job_order_id = jobLink.value.id;
      } catch (jobLinkError) {
        // Job link is best-effort and must NEVER fail a clock-in — but it is no
        // longer allowed to fail invisibly either.
        console.error('[clock-in] job resolution threw; clocking in with no job', jobLinkError);
      }
    }

    const { data: timecard, error: insertError } = await supabaseAdmin
      .from('timecards')
      .insert([insertData])
      .select()
      .single();

    if (insertError) {
      if (isTableNotFoundError(insertError)) {
        return NextResponse.json(
          { error: 'Timecard system is not available yet.' },
          { status: 503 }
        );
      }
      console.error('Error creating timecard:', insertError);
      return NextResponse.json(
        { error: 'Failed to clock in' },
        { status: 500 }
      );
    }

    // -- Subsistence (out-of-town overnight) — fire-and-forget side effect --
    // Recorded on a REMOTE clock-in when the operator says they're working out
    // of town overnight. One night per operator per calendar date (idempotent on
    // the unique (operator_id, night_date) constraint). night_date uses the same
    // tenant-tz local date the timecard row already uses (todayDate). This MUST
    // NEVER block the clock-in — mirrors daily-log/route.ts.
    const isRemoteMethod = clock_in_method === 'remote' || clock_in_method === 'gps_remote';
    if (out_of_town === true && isRemoteMethod) {
      Promise.resolve(
        supabaseAdmin.from('subsistence_nights').upsert(
          {
            tenant_id: tenantId,
            operator_id: user.id,
            night_date: todayDate,
            job_order_id: null,
            source: 'operator',
          },
          { onConflict: 'operator_id,night_date' }
        )
      ).then(() => {}).catch(() => {});
    }

    // -- GPS suspicious jump detection (fire-and-forget audit log) --
    // If the user's last clock-out location is > 80 km (50 miles) away and the
    // time gap is < 2 hours, log a suspicious_gps_jump event for admin review.
    // This never blocks the clock-in.
    if (hasLocation) {
      try {
        const { data: lastClosed } = await supabaseAdmin
          .from('timecards')
          .select('id, clock_out_time, clock_out_latitude, clock_out_longitude')
          .eq('user_id', user.id)
          .not('clock_out_time', 'is', null)
          .not('clock_out_latitude', 'is', null)
          .not('clock_out_longitude', 'is', null)
          .order('clock_out_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastClosed?.clock_out_latitude && lastClosed?.clock_out_longitude) {
          const prev_clock_out_lat: number = lastClosed.clock_out_latitude;
          const prev_clock_out_lon: number = lastClosed.clock_out_longitude;
          const distanceKm = haversineKm(prev_clock_out_lat, prev_clock_out_lon, latitude, longitude);
          const gapMinutes =
            (now.getTime() - new Date(lastClosed.clock_out_time).getTime()) / 60000;

          if (distanceKm > 80 && gapMinutes < 120) {
            Promise.resolve(
              supabaseAdmin.from('audit_logs').insert({
                action: 'suspicious_gps_jump',
                actor_id: user.id,
                resource_type: 'timecard',
                resource_id: timecard.id,
                details: {
                  prev_clock_out_lat,
                  prev_clock_out_lon,
                  new_clock_in_lat: latitude,
                  new_clock_in_lon: longitude,
                  distance_km: distanceKm.toFixed(1),
                  time_gap_minutes: gapMinutes.toFixed(0),
                },
                tenant_id: tenantId,
              })
            ).catch(() => {});
          }
        }
      } catch {
        // GPS jump detection is non-critical; never block a successful clock-in
      }
    }

    // -- Late detection --
    // Look up the operator's job for today and flag a late arrival when the
    // clock-in is at least `graceMinutes` (default 7) past the scheduled start,
    // computed in the TENANT'S timezone (not the server's — Vercel runs UTC).
    try {
      // Resolve the operator's effective scheduled start via the precedence chain
      // (job ticket > per-day override > tenant standard). Previously this only
      // looked at an assigned job, so operators with no job today were never
      // late-checked — the "clocked in at 8 but not flagged" bug.
      const eff = await resolveEffectiveStart({
        supabaseAdmin,
        tenantId: tenantId || '',
        operatorId: user.id,
        role: profile?.role ?? null,
        localDate: todayDate,
        isShopHours: is_shop_hours,
      });

      {
        const expectedTimeStr: string | null = eff.startTime;
        const job = eff.job;

        if (expectedTimeStr) {
          // Shared late computation (tenant-tz aware, strict `>` grace). Identical
          // logic is used by the admin edit routes so a corrected time recomputes
          // the same way the original clock-in did.
          const late = computeLate({
            clockInIso: now.toISOString(),
            effectiveStart: { startTime: eff.startTime, source: eff.source },
            graceMinutes,
            tenantTz,
            localDate: todayDate,
          });
          const lateMinutes = late.lateMinutes;

          if (late.isLate) {
            // Mark the timecard as late
            await supabaseAdmin
              .from('timecards')
              .update({
                is_late: true,
                late_minutes: lateMinutes,
                scheduled_start_time: expectedTimeStr,
                late_source: eff.source,
                late_notified_at: now.toISOString(),
              })
              .eq('id', timecard.id);

            // Notify all admins / ops managers in this tenant
            const { data: adminProfiles } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .in('role', ['super_admin', 'operations_manager', 'admin'])
              .eq('tenant_id', tenantId || '');

            const operatorName = profile?.full_name || user.email;
            const actualTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            // Job context only exists when the baseline came from an assigned job;
            // a per-day-override / standard-start late arrival has no job.
            const jobLabel = job?.customer_name ? ` — Job: ${job.customer_name}` : '';

            const notifications = (adminProfiles || []).map((p: { id: string }) => ({
              recipient_id: p.id,
              type: 'late_arrival',
              title: 'Late Clock-In',
              message: `${operatorName} clocked in ${lateMinutes} min late (scheduled: ${expectedTimeStr}, actual: ${actualTimeStr})${jobLabel}`,
              tenant_id: tenantId,
              job_order_id: job?.id ?? null,
              read: false,
              metadata: {
                operator_id: user.id,
                operator_name: operatorName,
                minutes_late: lateMinutes,
                scheduled_start: expectedTimeStr,
                actual_clock_in: actualTimeStr,
                start_source: eff.source,
              },
            }));

            if (notifications.length > 0) {
              Promise.resolve(
                supabaseAdmin.from('schedule_notifications').insert(notifications)
              ).catch(() => {});
            }
          }
        }
      }
    } catch {
      // Late detection is non-critical; never block a successful clock-in
    }

    const flags = [];
    if (is_shop_hours) flags.push('Shop Hours');
    if (isNightShift) flags.push('Night Shift');
    if (isMandatoryOvertime) flags.push('Mandatory OT (Weekend)');
    if (needsApproval) flags.push('Needs Approval');
    flags.push(`Method: ${clock_in_method.toUpperCase()}`);

    const locationCheck = hasLocation
      ? isWithinShopRadius({ latitude, longitude, accuracy }, shopOverride)
      : { isWithinRange: false, distance: 0, distanceFormatted: 'N/A' };

    // ── Morning unfinished-ticket REMINDER (was a gate until Aug 16) ────────
    // If they clocked out with an open ticket from a previous day, clock-in
    // surfaces it so they remember. It is now only a reminder: the server-side
    // enforcement in /api/job-orders/[id]/status was removed (founder, Aug 16 —
    // "if they forget to complete tickets, allow them to continue on their
    // current ticket"). Filing late is fine; work items carry their own
    // work_date, so a day entered later books to the day it was worked.
    let overdueTickets: Array<{ id: string; job_number: string; customer_name: string; scheduled_date: string }> = [];
    // Anyone who can lead a job can carry an overdue ticket into the next day.
    if (canBeCrewMember(profile?.role)) {
      try {
        const { data: overdueCandidates } = await supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name, scheduled_date, end_date')
          .eq('assigned_to', user.id)
          .lt('scheduled_date', todayDate)
          .not('dispatched_at', 'is', null)
          .is('work_completed_at', null)
          .not('status', 'in', '("cancelled","completed","pending_completion")');
        // A multi-day job still running today (end_date >= today) is NOT
        // overdue — "Done for Today" logs keep it legitimately open.
        overdueTickets = (overdueCandidates ?? [])
          .filter((j: any) => !(j.end_date && j.end_date >= todayDate))
          .map((j: any) => ({
            id: j.id,
            job_number: j.job_number,
            customer_name: j.customer_name,
            scheduled_date: j.scheduled_date,
          }));
      } catch {
        // Non-critical — never block a successful clock-in
      }
    }

    console.log(`Clock in: ${profile?.full_name || user.email} at ${now.toLocaleTimeString()} [${flags.join(', ')}]`);

    // TELL THE OPERATOR WHICH JOB THEY WERE PUT ON. Conrade was clocked in to a
    // job he had finished the day before and had no way to see it — the office
    // found out when it could not dispatch him. The job the server chose now
    // rides on the confirmation message every client already displays, so a
    // wrong answer is visible to the one person standing there who knows better.
    const linkedJob = jobLink.value;
    const jobSuffix = linkedJob
      ? ` — ${[linkedJob.job_number, linkedJob.customer_name].filter(Boolean).join(' · ') || 'job linked'}`
      : '';

    return NextResponse.json(
      {
        success: true,
        message: clock_in_method === 'remote' || clock_in_method === 'gps_remote'
          ? `Remote clock-in recorded. Pending admin approval.${jobSuffix}`
          : `Clocked in successfully at ${now.toLocaleTimeString()}${jobSuffix}`,
        data: {
          id: timecard.id,
          clockInTime: timecard.clock_in_time,
          isShopHours: timecard.is_shop_hours,
          isNightShift: timecard.is_night_shift,
          hourType: timecard.hour_type,
          clockInMethod: timecard.clock_in_method,
          needsVerification: clock_in_method === 'remote',
          requiresApproval: needsApproval,
          location: {
            latitude: timecard.clock_in_latitude,
            longitude: timecard.clock_in_longitude,
            accuracy: timecard.clock_in_accuracy,
          },
          distanceFromShop: locationCheck.distanceFormatted,
          // null = no open job could be tied to this clock-in. That is a real
          // answer, not a missing one — never render it as a blank job name.
          job: linkedJob,
          overdueTickets,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Unexpected error in clock-in route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
