export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/timecard/pdf
 * Generate a weekly timecard PDF for the currently authenticated user.
 * Requires any authenticated user (operator, etc.).
 *
 * Query params:
 *   weekStart — YYYY-MM-DD Monday of the target week (defaults to current week)
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const userId = auth.userId;

    // Parse week start, default to current Monday
    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('weekStart') || getMondayOfWeek();

    // Week end (Sunday) — local calendar math via lib/dates (never toISOString)
    const weekEnd = getWeekDates(weekStart)[6];

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Fetch timecards for the week
    const { data: timecards, error: tcError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', userId)
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

    // Tenant-scoped branding (+ logo pre-fetched as a data URI; null on failure
    // renders the text-only header — a logo problem never fails the download)
    const branding = await getTenantPdfBranding(auth.tenantId);
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
      employeeId: userId.substring(0, 8).toUpperCase(),
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
