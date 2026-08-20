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
import { normalizeWeekStart } from '@/lib/payroll-week';
import { requireAdmin } from '@/lib/api-auth';
import { renderToBuffer } from '@react-pdf/renderer';
import TimecardPDF from '@/components/pdf/TimecardPDF';
import { getTenantPdfBranding, fetchLogoDataUri } from '@/lib/pdf-branding';
import {
  calculateWeekSummary,
  getWeekDates,
  buildWeekDayEntries,
} from '@/lib/timecard-utils';
import type { TimecardEntry } from '@/lib/timecard-utils';
import { getTenantTimezone } from '@/lib/tenant-timezone';
import { loadTimecardDayJobs } from '@/lib/timecard-job-context';

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
    const weekStart = await normalizeWeekStart(
      auth.tenantId ?? null,
      searchParams.get('weekStart')
    );

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

    // THE TENANT THIS SHEET BELONGS TO — resolved once, non-null, and used for
    // every scoped read below.
    //
    // For an admin it is their own tenant (the profile query above already
    // proved the employee is in it). For a super_admin, whose `auth.tenantId`
    // is null by design, it is the EMPLOYEE's tenant — which is the correct
    // scope for a document about that employee, and tighter than what a null
    // used to produce.
    //
    // Neither available means a tenant-less profile, and the answer is a
    // REFUSAL. The job reads are service-role with RLS bypassed; passing null
    // used to silently drop the tenant filter and could put another company's
    // job names on this company's payroll sheet. A visible 400 is the right
    // outcome — a payroll document is the last place for a quiet degrade.
    const scopeTenantId = profile.tenant_id ?? auth.tenantId ?? null;
    if (!scopeTenantId) {
      return NextResponse.json(
        {
          error:
            'This employee is not assigned to a company, so a company-scoped timecard cannot be generated. Assign them to a company and try again.',
        },
        { status: 400 }
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
    const branding = await getTenantPdfBranding(scopeTenantId);
    branding.logoDataUri = await fetchLogoDataUri(branding.logo_url);

    // WHERE WAS THIS PERSON, EACH DAY (founder + Amanda, Aug 20). Amanda ran
    // payroll off a printout that named times and totals and nothing about where
    // anyone was. Resolved at READ time from the schedule board, the filed work
    // logs and the clock-in tag, in that order (lib/timecard-job-context.ts).
    //
    // Names only. `buildWeekDayEntries` still totals the whole clocked day and
    // never apportions it between the jobs listed beside it — that split belongs
    // to the work ticket.
    const { byPersonDay, error: jobsError } = await loadTimecardDayJobs(
      (timecards || []).map((tc: { id: string; date: string; job_order_id?: string | null }) => ({
        id: tc.id,
        user_id: id,
        date: tc.date,
        job_order_id: tc.job_order_id ?? null,
      })),
      scopeTenantId
    );
    if (jobsError) console.error('[timecard pdf] job lookup failed —', jobsError);
    const jobsByDate = new Map(
      [...byPersonDay.values()].map((d) => [d.date, d])
    );

    // Build 7-day entries array (Mon through Sun)
    const weekDates = getWeekDates(weekStart);
    const tcArray = (timecards || []) as TimecardEntry[];
    const entries = buildWeekDayEntries(tcArray, weekDates, jobsByDate, !!jobsError);
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
      // The EMPLOYEE's tenant, not the reader's: identical for an admin, and
      // for a super_admin it prints the crew's local times instead of a default.
      timeZone: await getTenantTimezone(scopeTenantId),
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
