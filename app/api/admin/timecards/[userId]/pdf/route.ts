/**
 * API Route: GET /api/admin/timecards/[userId]/pdf
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
import type { TimecardPDFEntry } from '@/components/pdf/TimecardPDF';
import {
  calculateWeekSummary,
  getWeekDates,
  formatTime,
  getMondayOfWeek,
} from '@/lib/timecard-utils';
import type { TimecardEntry } from '@/lib/timecard-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { userId } = await params;

    // Parse week start, default to current Monday
    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('weekStart') || getMondayOfWeek();

    // Calculate week end (Sunday)
    const startDate = new Date(weekStart + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', userId)
      .single();

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

    // Fetch branding
    let branding: Record<string, any> = {};
    try {
      const { data: brandingRow } = await supabaseAdmin
        .from('tenant_branding')
        .select(
          'company_name, company_address, support_phone, primary_color, logo_url'
        )
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
      // Use defaults if branding fetch fails
    }

    // Build 7-day entries array (Mon through Sun)
    const weekDates = getWeekDates(weekStart);
    const tcArray = (timecards || []) as TimecardEntry[];

    const entries: TimecardPDFEntry[] = weekDates.map((date) => {
      // Find all timecards for this date
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

      // Aggregate: take first clock-in, last clock-out, sum hours
      const firstEntry = dayEntries[0];
      const lastEntry = dayEntries[dayEntries.length - 1];
      const totalHours = dayEntries.reduce(
        (sum, e) => sum + (e.total_hours || 0),
        0
      );

      // Build category label
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

    // Calculate summary
    const summary = calculateWeekSummary(tcArray);

    // Generate PDF
    const pdfElement = TimecardPDF({
      operatorName: profile.full_name || profile.email,
      operatorEmail: profile.email || '',
      operatorRole: profile.role || 'operator',
      employeeId: userId.substring(0, 8).toUpperCase(),
      weekStart,
      weekEnd,
      entries,
      summary,
      branding: branding as any,
    });

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
  } catch (error: any) {
    console.error('Error generating timecard PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate timecard PDF' },
      { status: 500 }
    );
  }
}
