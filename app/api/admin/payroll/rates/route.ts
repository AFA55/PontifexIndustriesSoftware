/**
 * API Route: /api/admin/payroll/rates
 * GET  - List operator pay rates (optionally filtered by operator, active-only)
 * POST - Create a new pay rate for an operator (closes the previous active rate)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAudit, getRequestContext } from '@/lib/audit';

// ---------------------------------------------------------------------------
// GET /api/admin/payroll/rates
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get('operator_id');
    const activeOnly = searchParams.get('active_only') !== 'false'; // default true

    // If we want current rates for all operators, use the view
    if (!operatorId && activeOnly) {
      const { data: rates, error } = await supabaseAdmin
        .from('current_operator_rates')
        .select('*')
        .order('effective_date', { ascending: false });

      if (error) {
        console.error('Error fetching current operator rates:', error);
        return NextResponse.json(
          { error: 'Failed to fetch pay rates' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: true, data: rates || [] },
        { status: 200 }
      );
    }

    // Otherwise query operator_pay_rates directly with optional filters
    let query = supabaseAdmin
      .from('operator_pay_rates')
      .select(`
        *,
        profiles:operator_id ( id, full_name, email )
      `)
      .order('effective_date', { ascending: false });

    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }

    if (activeOnly) {
      query = query.is('end_date', null);
    }

    const { data: rates, error } = await query;

    if (error) {
      console.error('Error fetching operator pay rates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pay rates' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: rates || [] },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in GET /api/admin/payroll/rates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/payroll/rates
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const {
      operator_id,
      regular_rate,
      rate_type = 'hourly',
      effective_date,
      reason,
      notes,
    } = body;

    // --- Validation ---
    if (!operator_id) {
      return NextResponse.json(
        { error: 'operator_id is required' },
        { status: 400 }
      );
    }

    if (regular_rate === undefined || regular_rate === null) {
      return NextResponse.json(
        { error: 'regular_rate is required' },
        { status: 400 }
      );
    }

    const parsedRate = Number(regular_rate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      return NextResponse.json(
        { error: 'regular_rate must be a positive number' },
        { status: 400 }
      );
    }

    // Verify operator exists
    const { data: operator, error: operatorError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, hourly_rate')
      .eq('id', operator_id)
      .single();

    if (operatorError || !operator) {
      return NextResponse.json(
        { error: 'Operator not found' },
        { status: 404 }
      );
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const effectiveDate = effective_date || today;

    // --- Close existing active rate ---
    let oldRate: number | null = null;

    const { data: activeRate } = await supabaseAdmin
      .from('operator_pay_rates')
      .select('id, regular_rate')
      .eq('operator_id', operator_id)
      .is('end_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeRate) {
      oldRate = activeRate.regular_rate;

      // End the previous rate the day before the new one takes effect
      const dayBefore = new Date(effectiveDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const endDate = dayBefore.toISOString().split('T')[0];

      const { error: closeError } = await supabaseAdmin
        .from('operator_pay_rates')
        .update({ end_date: endDate })
        .eq('id', activeRate.id);

      if (closeError) {
        console.error('Error closing previous pay rate:', closeError);
        return NextResponse.json(
          { error: 'Failed to close previous pay rate' },
          { status: 500 }
        );
      }
    }

    // --- Insert new rate record ---
    const { data: newRate, error: insertError } = await supabaseAdmin
      .from('operator_pay_rates')
      .insert({
        operator_id,
        regular_rate: parsedRate,
        rate_type,
        effective_date: effectiveDate,
        reason: reason || null,
        notes: notes || null,
        approved_by: auth.userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting pay rate:', insertError);
      return NextResponse.json(
        { error: 'Failed to create pay rate' },
        { status: 500 }
      );
    }

    // --- Update profiles.hourly_rate for backward compatibility ---
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ hourly_rate: parsedRate })
      .eq('id', operator_id);

    if (profileUpdateError) {
      console.error('Error updating profile hourly_rate:', profileUpdateError);
      // Non-blocking: the rate record was already created
    }

    // --- Audit log ---
    const reqCtx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'update',
      entityType: 'profile',
      entityId: operator_id,
      description: `Set pay rate for ${operator.full_name} to $${parsedRate}/${rate_type}`,
      changes: {
        regular_rate: { from: oldRate, to: parsedRate },
      },
      metadata: {
        rate_record_id: newRate.id,
        rate_type,
        effective_date: effectiveDate,
        reason: reason || null,
      },
      ipAddress: reqCtx.ipAddress,
      userAgent: reqCtx.userAgent,
    });

    return NextResponse.json(
      { success: true, data: newRate },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in POST /api/admin/payroll/rates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
