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
import { requireAdmin } from '@/lib/api-auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import TimecardPDF from '@/components/pdf/TimecardPDF';
import type { TimecardPDFEntry } from '@/components/pdf/TimecardPDF';
import {
  calculateWeekSummary,
  getWeekDates,
  getMondayOfWeek,
} from '@/lib/timecard-utils';
import type { TimecardEntry } from '@/lib/timecard-utils';

// ── CSV Export ─────────────────────────────────────────────
async function generateCSV(weekStart: string, weekEnd: string, tenantId?: string) {
  // Fetch all timecards for the week with user info
  let query = supabaseAdmin
    .from('timecards_with_users')
    .select('*')
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('full_name')
    .order('date')
    .order('clock_in_time');

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data: timecards, error } = await query;

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
        })
      : '';
    const clockOut = tc.clock_out_time
      ? new Date(tc.clock_out_time as string).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
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
async function generateBatchPDF(weekStart: string, weekEnd: string, userId?: string, tenantId?: string) {
  const weekDates = getWeekDates(weekStart);

  // Get all distinct operators who have timecards this week
  let tcQuery = supabaseAdmin
    .from('timecards')
    .select('*')
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('user_id')
    .order('date')
    .order('clock_in_time');

  if (userId) {
    tcQuery = tcQuery.eq('user_id', userId);
  }

  if (tenantId) {
    tcQuery = tcQuery.eq('tenant_id', tenantId);
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
    .in('id', userIds);

  const profileMap = new Map<string, { full_name: string; email: string; role: string }>();
  for (const p of profiles || []) {
    profileMap.set(p.id, p);
  }

  // Fetch branding
  let branding: Record<string, string | null> = {};
  try {
    const { data: brandingRow } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name, company_address, support_phone, primary_color, logo_url')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (brandingRow) {
      branding = {
        company_name: brandingRow.company_name,
        company_address: brandingRow.company_address || '',
        company_phone: brandingRow.support_phone || '',
        primary_color: brandingRow.primary_color,
        logo_url: brandingRow.logo_url,
      };
    }
  } catch {
    // Use defaults
  }

  // Build PDF pages array — one TimecardPDF per operator
  const pages: React.ReactElement[] = [];

  for (const [userId, tcArray] of byUser.entries()) {
    const profile = profileMap.get(userId) || {
      full_name: 'Unknown',
      email: '',
      role: 'operator',
    };

    const entries: TimecardPDFEntry[] = weekDates.map((date) => {
      const dayEntries = tcArray.filter((tc) => tc.date === date);

      if (dayEntries.length === 0) {
        return {
          date,
          clockIn: null,
          clockOut: null,
          totalHours: 0,
          category: '\u2014',
          isApproved: false,
        };
      }

      const firstEntry = dayEntries[0];
      const lastEntry = dayEntries[dayEntries.length - 1];
      const totalHours = dayEntries.reduce(
        (sum, e) => sum + (e.total_hours || 0),
        0
      );

      const cats: string[] = [];
      if (dayEntries.some((e) => e.hour_type === 'mandatory_overtime'))
        cats.push('Mandatory OT');
      if (dayEntries.some((e) => e.is_night_shift)) cats.push('Night');
      if (dayEntries.some((e) => e.is_shop_hours)) cats.push('Shop');
      if (cats.length === 0) cats.push('Regular');

      return {
        date,
        clockIn: firstEntry.clock_in_time,
        clockOut: lastEntry.clock_out_time,
        totalHours: Number(totalHours.toFixed(2)),
        category: cats.join(', '),
        isApproved: dayEntries.every((e) => e.is_approved),
      };
    });

    const summary = calculateWeekSummary(tcArray);

    // Each TimecardPDF is a <Document> with its own <Page>.
    // We need the inner page content, so we call the component function directly.
    pages.push(
      TimecardPDF({
        operatorName: profile.full_name || profile.email,
        operatorEmail: profile.email || '',
        operatorRole: profile.role || 'operator',
        employeeId: userId.substring(0, 8).toUpperCase(),
        weekStart,
        weekEnd,
        entries,
        summary,
        branding: branding as any,
      }) as React.ReactElement
    );
  }

  // For batch, we render each TimecardPDF as its own document and combine buffers.
  // Since @react-pdf/renderer Document wraps Page, each TimecardPDF is already a full document.
  // We'll render the first one, then for the rest, render separately and merge.
  // Unfortunately, react-pdf does not natively support merging PDFs.
  // The simplest approach: render each operator's PDF independently and return the first one
  // if we only have one, or render a combined document.

  // Better approach: Build a single Document with multiple Pages
  // We need to extract the Page content from each TimecardPDF component.
  // Since TimecardPDF returns <Document><Page>...</Page></Document>,
  // we can build our own wrapper document.

  // Actually, the cleanest approach is to render each individually.
  // For now, if there's only one operator, return that PDF directly.
  // For multiple operators, render each and concatenate.

  // Simplest working approach: render first operator's PDF (most common use case)
  // and for batch, render individually.

  // Since we can't easily merge PDFs without a library, let's render the first one
  // as a single multi-operator document by creating the pages inline.

  // The TimecardPDF component returns a Document. We need to call it differently.
  // Let's just render individual PDFs and return the first one for now,
  // OR build a combined document ourselves.

  // Build combined document with separator pages
  if (pages.length === 1) {
    const buf = await renderToBuffer(pages[0] as any);
    return new Uint8Array(buf);
  }

  // For multiple operators, render each separately and return the first as a combined batch
  // (react-pdf limitation: can't easily merge Document elements)
  // Best approach: render each one individually and concatenate using pdf-lib if available
  // Fallback: render just the first operator

  // Actually, let's build a single Document with multiple Pages manually
  const combinedDoc = React.createElement(
    Document,
    null,
    ...Array.from(byUser.entries()).map(([userId, tcArray]) => {
      const profile = profileMap.get(userId) || {
        full_name: 'Unknown',
        email: '',
        role: 'operator',
      };

      const entries: TimecardPDFEntry[] = weekDates.map((date) => {
        const dayEntries = tcArray.filter((tc) => tc.date === date);
        if (dayEntries.length === 0) {
          return {
            date,
            clockIn: null,
            clockOut: null,
            totalHours: 0,
            category: '\u2014',
            isApproved: false,
          };
        }
        const firstEntry = dayEntries[0];
        const lastEntry = dayEntries[dayEntries.length - 1];
        const totalHours = dayEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
        const cats: string[] = [];
        if (dayEntries.some((e) => e.hour_type === 'mandatory_overtime')) cats.push('Mandatory OT');
        if (dayEntries.some((e) => e.is_night_shift)) cats.push('Night');
        if (dayEntries.some((e) => e.is_shop_hours)) cats.push('Shop');
        if (cats.length === 0) cats.push('Regular');
        return {
          date,
          clockIn: firstEntry.clock_in_time,
          clockOut: lastEntry.clock_out_time,
          totalHours: Number(totalHours.toFixed(2)),
          category: cats.join(', '),
          isApproved: dayEntries.every((e) => e.is_approved),
        };
      });

      const summary = calculateWeekSummary(tcArray);
      const primaryColor = (branding.primary_color as string) || '#1E40AF';
      const companyName = (branding.company_name as string) || 'Patriot Concrete Cutting';

      // Inline the page content (simplified version matching TimecardPDF layout)
      return React.createElement(
        Page,
        { key: userId, size: 'LETTER', style: { padding: 40, fontSize: 9, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' } },
        // Header
        React.createElement(
          View,
          { style: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 14, borderBottom: `2 solid ${primaryColor}` } },
          React.createElement(
            View,
            { style: { flex: 1 } },
            React.createElement(Text, { style: { fontSize: 16, fontWeight: 'bold', color: primaryColor } }, companyName.toUpperCase()),
            branding.company_address ? React.createElement(Text, { style: { fontSize: 8, color: '#64748B' } }, branding.company_address) : null,
            branding.company_phone ? React.createElement(Text, { style: { fontSize: 8, color: '#64748B' } }, branding.company_phone) : null,
          ),
          React.createElement(
            View,
            { style: { alignItems: 'flex-end' as const } },
            React.createElement(Text, { style: { fontSize: 22, fontWeight: 'bold', color: primaryColor, textAlign: 'right' } }, 'WEEKLY TIMECARD'),
            React.createElement(Text, { style: { fontSize: 10, color: '#475569', textAlign: 'right', marginTop: 3 } }, `${weekStart} to ${weekEnd}`),
          ),
        ),
        // Employee Info
        React.createElement(
          View,
          { style: { flexDirection: 'row', gap: 30, marginBottom: 18 } },
          React.createElement(
            View,
            { style: { flex: 1 } },
            React.createElement(Text, { style: { fontSize: 8, fontWeight: 'bold', color: primaryColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 } }, 'Employee Information'),
            React.createElement(
              View,
              { style: { flexDirection: 'row', marginBottom: 3 } },
              React.createElement(Text, { style: { fontSize: 8, fontWeight: 'bold', color: '#64748B', width: 80 } }, 'Name'),
              React.createElement(Text, { style: { fontSize: 9, color: '#1E293B', flex: 1 } }, profile.full_name || profile.email),
            ),
            React.createElement(
              View,
              { style: { flexDirection: 'row', marginBottom: 3 } },
              React.createElement(Text, { style: { fontSize: 8, fontWeight: 'bold', color: '#64748B', width: 80 } }, 'Role'),
              React.createElement(Text, { style: { fontSize: 9, color: '#1E293B', flex: 1 } }, profile.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())),
            ),
          ),
        ),
        // Table Header
        React.createElement(
          View,
          { style: { flexDirection: 'row', backgroundColor: primaryColor, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingVertical: 7, paddingHorizontal: 8 } },
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', width: 90 } }, 'DATE'),
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', width: 60 } }, 'DAY'),
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', width: 70 } }, 'CLOCK IN'),
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', width: 70 } }, 'CLOCK OUT'),
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', width: 55, textAlign: 'right' } }, 'HOURS'),
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', width: 80 } }, 'CATEGORY'),
          React.createElement(Text, { style: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', flex: 1, textAlign: 'center' } }, 'APPROVED'),
        ),
        // Table Rows
        ...entries.map((entry, idx) => {
          const hasData = entry.totalHours > 0 || entry.clockIn !== null;
          const cellColor = hasData ? '#334155' : '#94A3B8';
          const bgColor = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          const d = new Date(entry.date + 'T00:00:00');
          const dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const dayDisplay = d.toLocaleDateString('en-US', { weekday: 'short' });
          const clockInDisplay = entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '\u2014';
          const clockOutDisplay = entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '\u2014';

          return React.createElement(
            View,
            { key: `${userId}-${idx}`, style: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderBottom: '0.5 solid #E2E8F0', backgroundColor: bgColor } },
            React.createElement(Text, { style: { fontSize: 9, color: cellColor, width: 90 } }, dateDisplay),
            React.createElement(Text, { style: { fontSize: 9, color: cellColor, width: 60 } }, dayDisplay),
            React.createElement(Text, { style: { fontSize: 9, color: cellColor, width: 70 } }, clockInDisplay),
            React.createElement(Text, { style: { fontSize: 9, color: cellColor, width: 70 } }, clockOutDisplay),
            React.createElement(Text, { style: { fontSize: 9, color: hasData ? '#1E293B' : '#94A3B8', fontWeight: hasData ? 'bold' : 'normal', width: 55, textAlign: 'right' } }, hasData ? entry.totalHours.toFixed(2) : '\u2014'),
            React.createElement(Text, { style: { fontSize: 9, color: cellColor, width: 80 } }, hasData ? entry.category : '\u2014'),
            React.createElement(Text, { style: { fontSize: 9, color: cellColor, flex: 1, textAlign: 'center' } }, hasData ? (entry.isApproved ? 'Yes' : 'Pending') : '\u2014'),
          );
        }),
        // Totals Row
        React.createElement(
          View,
          { style: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: '#F1F5F9', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } },
          React.createElement(Text, { style: { fontSize: 9, fontWeight: 'bold', color: '#1E293B', width: 90 } }, 'WEEKLY TOTALS'),
          React.createElement(Text, { style: { fontSize: 9, width: 60 } }, ''),
          React.createElement(Text, { style: { fontSize: 9, width: 70 } }, ''),
          React.createElement(Text, { style: { fontSize: 9, width: 70 } }, ''),
          React.createElement(Text, { style: { fontSize: 9, fontWeight: 'bold', color: '#1E293B', width: 55, textAlign: 'right' } }, summary.totalHours.toFixed(2)),
          React.createElement(Text, { style: { fontSize: 9, color: '#334155', width: 80 } }, `${summary.daysWorked} days`),
          React.createElement(Text, { style: { fontSize: 9, flex: 1 } }, ''),
        ),
        // Hour Breakdown
        React.createElement(
          View,
          { style: { marginTop: 18, marginBottom: 18 } },
          React.createElement(Text, { style: { fontSize: 8, fontWeight: 'bold', color: primaryColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 } }, 'Hour Breakdown'),
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 12 } },
            ...[
              { label: 'Regular', value: summary.regularHours },
              { label: 'Weekly OT', value: summary.weeklyOvertimeHours },
              { label: 'Mandatory OT', value: summary.mandatoryOvertimeHours },
              { label: 'Night Shift', value: summary.nightShiftHours },
              { label: 'Shop Hours', value: summary.shopHours },
            ].map((item, i) =>
              React.createElement(
                View,
                { key: i, style: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 4, padding: 10, borderLeft: `3 solid ${primaryColor}` } },
                React.createElement(Text, { style: { fontSize: 7, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: 3 } }, item.label),
                React.createElement(Text, { style: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' } }, `${item.value.toFixed(2)} hrs`),
              )
            ),
          ),
        ),
        // Footer
        React.createElement(
          View,
          { style: { marginTop: 'auto', borderTop: '1 solid #E2E8F0', paddingTop: 10, alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 7.5, color: '#94A3B8' } }, `Generated on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} by ${companyName}`),
        ),
      );
    })
  );

  const buf = await renderToBuffer(combinedDoc as any);
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

    // Calculate week end
    const startDate = new Date(weekStart + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    const tenantId = auth.tenantId || undefined;

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
