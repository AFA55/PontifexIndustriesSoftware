export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/timecards/[id]/pdf
 * Generate a weekly timecard PDF for a specific employee.
 * Requires admin role.
 *
 * Query params:
 *   weekStart — YYYY-MM-DD Monday of the target week (defaults to current week)
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { renderToBuffer } from '@react-pdf/renderer';
import TimecardPDF from '@/components/pdf/TimecardPDF';
import { getTenantPdfBranding, fetchLogoDataUri } from '@/lib/pdf-branding';
import {
  calculateWeekSummary,
  getWeekDates,
  getMondayOfWeek,
  buildWeekDayEntries,
} from '@/lib/timecard-utils';
import type { TimecardEntry } from '@/lib/timecard-utils';
import { getTenantTimezone } from '@/lib/tenant-timezone';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Parse week start, default to current Monday
    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('weekStart') || getMondayOfWeek();

    // Week end (Sunday) — local calendar math via lib/dates (never toISOString)
    const weekEnd = getWeekDates(weekStart)[6];

    // Fetch user profile — SCOPED to the admin's tenant. Without the tenant
    // filter, an admin could pull ANY employee's timecard PDF by user id
    // across tenants (security audit H2 IDOR). super_admin (null tenantId)
    // is intentionally unrestricted.
    let profileQuery = supabaseAdmin
      .from('profiles')
      .select('full_name, email, role, tenant_id')
      .eq('id', id);
    if (auth.tenantId) profileQuery = profileQuery.eq('tenant_id', auth.tenantId);
    const { data: profile, error: profileError } = await profileQuery.single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Fetch timecards for the week
    const { data: timecards, error: tcError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', id)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')
      .order('clock_in_time');

    if (tcError) {
      console.error('Error fetching timecards:', tcError);
      return NextResponse.json(
        { error: 'Failed to fetch timecards' },
        { status: 500 }
      );
    }

    // Branding scoped to the EMPLOYEE's tenant (== admin's tenant for
    // non-super-admins; lets a super_admin pull correctly-branded sheets).
    const branding = await getTenantPdfBranding(profile.tenant_id ?? auth.tenantId);
    branding.logoDataUri = await fetchLogoDataUri(branding.logo_url);

    // Build 7-day entries array (Mon through Sun)
    const weekDates = getWeekDates(weekStart);
    const tcArray = (timecards || []) as TimecardEntry[];
    const entries = buildWeekDayEntries(tcArray, weekDates);
    const summary = calculateWeekSummary(tcArray);

    // Generate PDF
    const pdfElement = React.createElement(TimecardPDF, {
      operatorName: profile.full_name || profile.email,
      operatorEmail: profile.email || '',
      operatorRole: profile.role || 'operator',
      employeeId: id.substring(0, 8).toUpperCase(),
      weekStart,
      weekEnd,
      entries,
      summary,
      branding,
      // The server runs UTC — without this every printed clock time is off.
      timeZone: await getTenantTimezone(auth.tenantId),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(pdfElement as any);
    const uint8 = new Uint8Array(pdfBuffer);

    const safeName = (profile.full_name || 'employee')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const filename = `timecard_${safeName}_${weekStart}.pdf`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error: unknown) {
    console.error('Error generating timecard PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate timecard PDF' },
      { status: 500 }
    );
  }
}
