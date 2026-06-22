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
      const eod = `${stale.date}T23:59:59`;
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
    };

    if (clock_in_method === 'remote' || clock_in_method === 'gps_remote') {
      insertData.remote_verified = null; // null = pending review
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

    console.log(`Clock in: ${profile?.full_name || user.email} at ${now.toLocaleTimeString()} [${flags.join(', ')}]`);

    return NextResponse.json(
      {
        success: true,
        message: clock_in_method === 'remote' || clock_in_method === 'gps_remote'
          ? 'Remote clock-in recorded. Pending admin approval.'
          : `Clocked in successfully at ${now.toLocaleTimeString()}`,
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
