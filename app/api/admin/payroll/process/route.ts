/**
 * API Route: POST /api/admin/payroll/process
 * Process payroll for a given pay period (admin only)
 *
 * For each operator, calculates regular/overtime hours from completed timecards,
 * applies the correct pay rate, factors in adjustments, and upserts pay_period_entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessPayrollBody {
  pay_period_id: string;
  operator_ids?: string[];
}

interface PayPeriodEntry {
  id?: string;
  pay_period_id: string;
  operator_id: string;
  regular_hours: number;
  overtime_hours: number;
  regular_rate: number;
  overtime_rate: number;
  regular_pay: number;
  overtime_pay: number;
  gross_pay: number;
  adjustments_total: number;
  net_pay: number;
  timecard_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the effective hourly rate for an operator.
 * Prefers `operator_pay_rates` (latest effective_date <= period_end where end_date IS NULL).
 * Falls back to `profiles.hourly_rate`.
 */
async function getOperatorRate(
  operatorId: string,
  periodEnd: string,
  fallbackRate: number | null
): Promise<{ regular_rate: number; overtime_rate: number; double_time_rate: number }> {
  const { data: rateRecord } = await supabaseAdmin
    .from('operator_pay_rates')
    .select('regular_rate, overtime_rate, double_time_rate')
    .eq('operator_id', operatorId)
    .is('end_date', null)
    .lte('effective_date', periodEnd)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rateRecord?.regular_rate != null) {
    return {
      regular_rate: Number(rateRecord.regular_rate),
      overtime_rate: Number(rateRecord.overtime_rate),
      double_time_rate: Number(rateRecord.double_time_rate),
    };
  }

  // Fallback to profiles.hourly_rate with standard multipliers
  const base = fallbackRate != null ? Number(fallbackRate) : 0;
  return {
    regular_rate: base,
    overtime_rate: base * 1.5,
    double_time_rate: base * 2.0,
  };
}

/**
 * Sum total hours from completed timecards for an operator within a date range.
 * Returns the timecards used so we can create links later.
 */
async function getTimecardHours(
  operatorId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ totalHours: number; timecards: { id: string; total_hours: number; date: string }[] }> {
  const { data: timecards, error } = await supabaseAdmin
    .from('timecards')
    .select('id, total_hours, date')
    .eq('user_id', operatorId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .not('clock_out_time', 'is', null);

  if (error || !timecards) {
    return { totalHours: 0, timecards: [] };
  }

  const totalHours = timecards.reduce(
    (sum, tc) => sum + (Number(tc.total_hours) || 0),
    0
  );

  return { totalHours, timecards };
}

/**
 * Fetch pay adjustments for a given operator and pay period entry.
 * Sums the amounts (positive = bonus, negative = deduction).
 */
async function getAdjustments(
  operatorId: string,
  entryId: string | undefined
): Promise<number> {
  // Query adjustments linked either by entry or by operator + period
  let query = supabaseAdmin
    .from('pay_adjustments')
    .select('amount');

  if (entryId) {
    query = query.eq('pay_period_entry_id', entryId);
  } else {
    query = query.eq('operator_id', operatorId);
  }

  const { data: adjustments } = await query;

  if (!adjustments || adjustments.length === 0) return 0;

  return adjustments.reduce(
    (sum, adj) => sum + (Number(adj.amount) || 0),
    0
  );
}

/**
 * Fetch the overtime threshold from payroll_settings.
 * Defaults to 40 hours if the table or setting doesn't exist.
 */
async function getOvertimeThreshold(): Promise<number> {
  const { data: settings } = await supabaseAdmin
    .from('payroll_settings')
    .select('overtime_threshold_weekly')
    .limit(1)
    .maybeSingle();

  if (settings?.overtime_threshold_weekly != null) {
    const parsed = Number(settings.overtime_threshold_weekly);
    return isNaN(parsed) ? 40 : parsed;
  }

  return 40;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ---- Auth ----
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // ---- Parse body ----
    const body: ProcessPayrollBody = await request.json();

    if (!body.pay_period_id) {
      return NextResponse.json(
        { error: 'Missing required field: pay_period_id' },
        { status: 400 }
      );
    }

    // ---- Fetch pay period ----
    const { data: payPeriod, error: periodError } = await supabaseAdmin
      .from('pay_periods')
      .select('*')
      .eq('id', body.pay_period_id)
      .single();

    if (periodError || !payPeriod) {
      return NextResponse.json(
        { error: 'Pay period not found' },
        { status: 404 }
      );
    }

    const periodStart: string = payPeriod.period_start;
    const periodEnd: string = payPeriod.period_end;

    // ---- Resolve operator list ----
    let operators: { id: string; hourly_rate: number | null; full_name: string | null }[];

    if (body.operator_ids && body.operator_ids.length > 0) {
      const { data: selected, error: selError } = await supabaseAdmin
        .from('profiles')
        .select('id, hourly_rate, full_name')
        .in('id', body.operator_ids);

      if (selError || !selected) {
        return NextResponse.json(
          { error: 'Failed to fetch selected operators' },
          { status: 500 }
        );
      }

      operators = selected;
    } else {
      const { data: activeOps, error: opsError } = await supabaseAdmin
        .from('profiles')
        .select('id, hourly_rate, full_name')
        .eq('active', true)
        .eq('role', 'operator');

      if (opsError || !activeOps) {
        return NextResponse.json(
          { error: 'Failed to fetch active operators' },
          { status: 500 }
        );
      }

      operators = activeOps;
    }

    if (operators.length === 0) {
      return NextResponse.json(
        { error: 'No operators found to process' },
        { status: 400 }
      );
    }

    // ---- Get overtime threshold ----
    const overtimeThreshold = await getOvertimeThreshold();

    // ---- Process each operator ----
    const entries: PayPeriodEntry[] = [];
    const errors: { operator_id: string; error: string }[] = [];

    for (const operator of operators) {
      try {
        // 1. Get pay rate (includes computed OT and DT rates from DB)
        const rates = await getOperatorRate(
          operator.id,
          periodEnd,
          operator.hourly_rate
        );

        // 2. Get timecard hours
        const { totalHours, timecards } = await getTimecardHours(
          operator.id,
          periodStart,
          periodEnd
        );

        // 3. Calculate regular vs overtime hours (double-time not yet auto-calculated)
        let regularHours: number;
        let overtimeHours: number;
        const doubleTimeHours = 0; // TODO: daily double-time threshold

        if (totalHours > overtimeThreshold) {
          regularHours = overtimeThreshold;
          overtimeHours = totalHours - overtimeThreshold;
        } else {
          regularHours = totalHours;
          overtimeHours = 0;
        }

        // 4. Calculate pay
        const regularPay = regularHours * rates.regular_rate;
        const overtimePay = overtimeHours * rates.overtime_rate;
        const doubleTimePay = doubleTimeHours * rates.double_time_rate;
        const grossPay = regularPay + overtimePay + doubleTimePay;

        // 5. Upsert pay_period_entry
        const entryData: Record<string, any> = {
          pay_period_id: body.pay_period_id,
          operator_id: operator.id,
          regular_hours: parseFloat(regularHours.toFixed(2)),
          overtime_hours: parseFloat(overtimeHours.toFixed(2)),
          double_time_hours: parseFloat(doubleTimeHours.toFixed(2)),
          regular_rate: parseFloat(rates.regular_rate.toFixed(2)),
          overtime_rate: parseFloat(rates.overtime_rate.toFixed(2)),
          double_time_rate: parseFloat(rates.double_time_rate.toFixed(2)),
          gross_pay: parseFloat(grossPay.toFixed(2)),
          jobs_worked: timecards.length,
          status: 'draft',
        };

        // Check if an entry already exists for this operator + period
        const { data: existingEntry } = await supabaseAdmin
          .from('pay_period_entries')
          .select('id')
          .eq('pay_period_id', body.pay_period_id)
          .eq('operator_id', operator.id)
          .maybeSingle();

        let upsertedEntry: any;

        if (existingEntry) {
          // Update existing entry
          const { data: updated, error: updateErr } = await supabaseAdmin
            .from('pay_period_entries')
            .update(entryData)
            .eq('id', existingEntry.id)
            .select()
            .single();

          if (updateErr) {
            errors.push({
              operator_id: operator.id,
              error: 'Failed to update pay period entry',
            });
            continue;
          }
          upsertedEntry = updated;
        } else {
          // Insert new entry
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('pay_period_entries')
            .insert(entryData)
            .select()
            .single();

          if (insertErr) {
            errors.push({
              operator_id: operator.id,
              error: 'Failed to create pay period entry',
            });
            continue;
          }
          upsertedEntry = inserted;
        }

        const entryId = upsertedEntry?.id;

        // 6. Get adjustments for this entry (positive = additions, negative = deductions)
        const adjustmentsTotal = await getAdjustments(operator.id, entryId);
        const totalAdditions = adjustmentsTotal > 0 ? adjustmentsTotal : 0;
        const totalDeductions = adjustmentsTotal < 0 ? Math.abs(adjustmentsTotal) : 0;
        const netPay = grossPay + adjustmentsTotal;

        // Update with adjustments and net pay
        if (entryId) {
          await supabaseAdmin
            .from('pay_period_entries')
            .update({
              total_additions: parseFloat(totalAdditions.toFixed(2)),
              total_deductions: parseFloat(totalDeductions.toFixed(2)),
              net_pay: parseFloat(netPay.toFixed(2)),
            })
            .eq('id', entryId);
        }

        // 7. Create timecard_pay_links for each timecard used
        if (entryId && timecards.length > 0) {
          // Remove old links for this entry first
          await supabaseAdmin
            .from('timecard_pay_links')
            .delete()
            .eq('pay_period_entry_id', entryId);

          // Insert new links with required columns
          const links = timecards.map((tc) => ({
            pay_period_entry_id: entryId,
            timecard_id: tc.id,
            regular_hours_applied: 0, // Will be refined per-day in future
            overtime_hours_applied: 0,
            double_time_hours_applied: 0,
            work_date: tc.date || periodStart,
          }));

          await supabaseAdmin.from('timecard_pay_links').insert(links);
        }

        entries.push({
          id: entryId,
          pay_period_id: body.pay_period_id,
          operator_id: operator.id,
          regular_hours: parseFloat(regularHours.toFixed(2)),
          overtime_hours: parseFloat(overtimeHours.toFixed(2)),
          regular_rate: parseFloat(rates.regular_rate.toFixed(2)),
          overtime_rate: parseFloat(rates.overtime_rate.toFixed(2)),
          regular_pay: parseFloat(regularPay.toFixed(2)),
          overtime_pay: parseFloat(overtimePay.toFixed(2)),
          gross_pay: parseFloat(grossPay.toFixed(2)),
          adjustments_total: parseFloat(adjustmentsTotal.toFixed(2)),
          net_pay: parseFloat(netPay.toFixed(2)),
          timecard_count: timecards.length,
        });
      } catch (opError) {
        console.error(`Error processing operator ${operator.id}:`, opError);
        errors.push({
          operator_id: operator.id,
          error: 'Unexpected error during processing',
        });
      }
    }

    // ---- Aggregate totals ----
    const totalRegularHours = entries.reduce((s, e) => s + e.regular_hours, 0);
    const totalOvertimeHours = entries.reduce((s, e) => s + e.overtime_hours, 0);
    const totalGrossPay = entries.reduce((s, e) => s + e.gross_pay, 0);
    const totalAdjustments = entries.reduce((s, e) => s + e.adjustments_total, 0);
    const totalNetPay = entries.reduce((s, e) => s + e.net_pay, 0);

    // ---- Update pay_periods record ----
    // Columns: total_regular_hours, total_overtime_hours, total_double_time_hours,
    //          total_gross_pay, total_adjustments, total_deductions, total_net_pay,
    //          operator_count, status, processed_at, processed_by
    const { error: periodUpdateError } = await supabaseAdmin
      .from('pay_periods')
      .update({
        status: 'processing',
        processed_at: new Date().toISOString(),
        processed_by: auth.userId,
        operator_count: entries.length,
        total_regular_hours: parseFloat(totalRegularHours.toFixed(2)),
        total_overtime_hours: parseFloat(totalOvertimeHours.toFixed(2)),
        total_double_time_hours: 0, // TODO: daily double-time calculation
        total_gross_pay: parseFloat(totalGrossPay.toFixed(2)),
        total_adjustments: parseFloat(totalAdjustments.toFixed(2)),
        total_deductions: 0,
        total_net_pay: parseFloat(totalNetPay.toFixed(2)),
      })
      .eq('id', body.pay_period_id);

    if (periodUpdateError) {
      console.error('Error updating pay period totals:', periodUpdateError);
      // Non-fatal: entries were created, just totals failed to save
    }

    // ---- Audit log ----
    const ctx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'create',
      entityType: 'pay_period',
      entityId: body.pay_period_id,
      description: `Processed payroll for period ${periodStart} to ${periodEnd} — ${entries.length} operators`,
      changes: {
        status: { from: payPeriod.status, to: 'processing' },
      },
      metadata: {
        operator_count: entries.length,
        total_gross_pay: parseFloat(totalGrossPay.toFixed(2)),
        total_net_pay: parseFloat(totalNetPay.toFixed(2)),
        errors: errors.length > 0 ? errors : undefined,
      },
      ...ctx,
    });

    // ---- Response ----
    const responseData: Record<string, any> = {
      period_id: body.pay_period_id,
      period_start: periodStart,
      period_end: periodEnd,
      operator_count: entries.length,
      total_regular_hours: parseFloat(totalRegularHours.toFixed(2)),
      total_overtime_hours: parseFloat(totalOvertimeHours.toFixed(2)),
      total_gross_pay: parseFloat(totalGrossPay.toFixed(2)),
      total_adjustments: parseFloat(totalAdjustments.toFixed(2)),
      total_net_pay: parseFloat(totalNetPay.toFixed(2)),
      entries,
    };

    if (errors.length > 0) {
      responseData.errors = errors;
    }

    return NextResponse.json(
      {
        success: true,
        message: `Payroll processed for ${entries.length} operator(s)`,
        data: responseData,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in payroll process route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
