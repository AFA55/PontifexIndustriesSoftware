export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/timecards/export
 * Batch export timecards for all operators in a given week.
 *
 * Query params:
 *   weekStart — YYYY-MM-DD Monday of the target week (required)
 *   format   — 'pdf' (default) or 'csv'
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { renderToBuffer, Document } from '@react-pdf/renderer';
import { TimecardPage } from '@/components/pdf/TimecardPDF';
import { getTenantTimezone } from '@/lib/tenant-timezone';
import { getTenantPdfBranding, fetchLogoDataUri } from '@/lib/pdf-branding';
import {
  calculateWeekSummary,
  getWeekDates,
  buildWeekDayEntries,
} from '@/lib/timecard-utils';
import type { TimecardEntry } from '@/lib/timecard-utils';

// ── CSV Export ─────────────────────────────────────────────
async function generateCSV(weekStart: string, weekEnd: string, tenantId: string) {
  // Fetch all timecards for the week with user info
  const { data: timecards, error } = await supabaseAdmin
    .from('timecards_with_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('full_name')
    .order('date')
    .order('clock_in_time');

  if (error) {
    throw new Error(`Failed to fetch timecards: ${error.message}`);
  }

  // CSV headers
  const headers = [
    'Employee Name',
    'Date',
    'Day',
    'Clock In',
    'Clock Out',
    'Total Hours',
    'Category',
    'Approved',
  ];

  // Payroll reads this file. The server runs UTC, so without the tenant's zone
  // every clock time in the export is shifted by the UTC offset.
  const tz = await getTenantTimezone(tenantId);

  const rows = (timecards || []).map((tc: Record<string, unknown>) => {
    const date = new Date((tc.date as string) + 'T00:00:00');
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const clockIn = tc.clock_in_time
      ? new Date(tc.clock_in_time as string).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz,
        })
      : '';
    const clockOut = tc.clock_out_time
      ? new Date(tc.clock_out_time as string).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz,
        })
      : '';

    const cats: string[] = [];
    if ((tc.hour_type as string) === 'mandatory_overtime') cats.push('Mandatory OT');
    if (tc.is_night_shift) cats.push('Night');
    if (tc.is_shop_hours) cats.push('Shop');
    if (cats.length === 0) cats.push('Regular');

    return [
      tc.full_name as string || tc.email as string || 'Unknown',
      dateStr,
      dayName,
      clockIn,
      clockOut,
      tc.total_hours != null ? Number(tc.total_hours).toFixed(2) : '0.00',
      cats.join('; '),
      tc.is_approved ? 'Yes' : 'No',
    ];
  });

  // Build CSV string
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(',')
    ),
  ];

  return csvLines.join('\n');
}

// ── PDF Export (multi-page, one page per operator) ────────
async function generateBatchPDF(
  weekStart: string,
  weekEnd: string,
  userId: string | undefined,
  tenantId: string
) {
  const weekDates = getWeekDates(weekStart);

  // Get all timecards this week (tenant-scoped)
  let tcQuery = supabaseAdmin
    .from('timecards')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('user_id')
    .order('date')
    .order('clock_in_time');

  if (userId) {
    tcQuery = tcQuery.eq('user_id', userId);
  }

  const { data: allTimecards, error: tcError } = await tcQuery;

  if (tcError) {
    throw new Error(`Failed to fetch timecards: ${tcError.message}`);
  }

  if (!allTimecards || allTimecards.length === 0) {
    throw new Error('No timecards found for the selected week');
  }

  // Group by user_id
  const byUser = new Map<string, TimecardEntry[]>();
  for (const tc of allTimecards) {
    const existing = byUser.get(tc.user_id) || [];
    existing.push(tc as TimecardEntry);
    byUser.set(tc.user_id, existing);
  }

  // Fetch all profiles for these users
  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('tenant_id', tenantId)
    .in('id', userIds);

  const profileMap = new Map<string, { full_name: string; email: string; role: string }>();
  for (const p of profiles || []) {
    profileMap.set(p.id, p);
  }

  // One branding + logo fetch for the whole batch
  const branding = await getTenantPdfBranding(tenantId);
  branding.logoDataUri = await fetchLogoDataUri(branding.logo_url);

  // The server runs UTC — without this every printed clock time is off.
  const timeZone = await getTenantTimezone(tenantId);

  // One Document, one TimecardPage per operator
  const doc = React.createElement(
    Document,
    null,
    Array.from(byUser.entries()).map(([uid, tcArray]) => {
      const profile = profileMap.get(uid) || {
        full_name: 'Unknown',
        email: '',
        role: 'operator',
      };
      return React.createElement(TimecardPage, {
        key: uid,
        operatorName: profile.full_name || profile.email,
        operatorEmail: profile.email || '',
        operatorRole: profile.role || 'operator',
        employeeId: uid.substring(0, 8).toUpperCase(),
        weekStart,
        weekEnd,
        entries: buildWeekDayEntries(tcArray, weekDates),
        summary: calculateWeekSummary(tcArray),
        branding,
        timeZone,
      });
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await renderToBuffer(doc as any);
  return new Uint8Array(buf);
}

// ── Route Handler ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('weekStart');
    const format = searchParams.get('format') || 'pdf';
    const userId = searchParams.get('userId') || undefined;

    if (!weekStart) {
      return NextResponse.json(
        { error: 'weekStart query parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json(
        { error: 'weekStart must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Week end (Sunday) — local calendar math via lib/dates (never toISOString)
    const weekEnd = getWeekDates(weekStart)[6];

    // Guaranteed non-null tenant (super_admin resolves via ?tenantId= or own profile)
    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    if (format === 'csv') {
      const csvContent = await generateCSV(weekStart, weekEnd, tenantId);
      const filename = `timecards_${weekStart}_to_${weekEnd}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: PDF
    const pdfBytes = await generateBatchPDF(weekStart, weekEnd, userId, tenantId);
    const filename = `timecards_batch_${weekStart}_to_${weekEnd}.pdf`;

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error: unknown) {
    console.error('Error in batch export:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
