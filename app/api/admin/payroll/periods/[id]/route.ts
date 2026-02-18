/**
 * API Route: GET/PATCH /api/admin/payroll/periods/[id]
 * View and manage a specific pay period (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

// Valid status transitions: open -> locked -> processing -> approved -> paid
const VALID_TRANSITIONS: Record<string, string> = {
  open: 'locked',
  locked: 'processing',
  processing: 'approved',
  approved: 'paid',
};

// GET: Fetch a specific pay period with its entries
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Fetch the pay period
    const { data: period, error: periodError } = await supabaseAdmin
      .from('pay_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (periodError || !period) {
      return NextResponse.json(
        { error: 'Pay period not found' },
        { status: 404 }
      );
    }

    // Fetch all entries for this period, joined with profiles for operator name
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from('pay_period_entries')
      .select('*, profiles:operator_id(id, full_name, email)')
      .eq('pay_period_id', id)
      .order('created_at', { ascending: true });

    if (entriesError) {
      console.error('Error fetching pay period entries:', entriesError);
      return NextResponse.json(
        { error: 'Failed to fetch pay period entries' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          period,
          entries: entries || [],
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in pay period GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update a pay period (status transitions, pay_date, notes)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { status, pay_date, notes } = body;

    // Fetch the current period
    const { data: currentPeriod, error: fetchError } = await supabaseAdmin
      .from('pay_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentPeriod) {
      return NextResponse.json(
        { error: 'Pay period not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Handle status transition
    if (status && status !== currentPeriod.status) {
      const expectedNext = VALID_TRANSITIONS[currentPeriod.status];

      if (!expectedNext) {
        return NextResponse.json(
          { error: `Pay period in '${currentPeriod.status}' status cannot be transitioned further` },
          { status: 400 }
        );
      }

      if (status !== expectedNext) {
        return NextResponse.json(
          {
            error: `Invalid status transition. '${currentPeriod.status}' can only transition to '${expectedNext}'`,
          },
          { status: 400 }
        );
      }

      updateFields.status = status;

      const now = new Date().toISOString();

      // Handle side effects for each transition
      if (status === 'locked') {
        updateFields.locked_at = now;
        updateFields.locked_by = auth.userId;
      } else if (status === 'approved') {
        updateFields.approved_at = now;
        updateFields.approved_by = auth.userId;
      } else if (status === 'paid') {
        updateFields.paid_at = now;
      }
    }

    // Handle optional field updates
    if (pay_date !== undefined) {
      updateFields.pay_date = pay_date;
    }

    if (notes !== undefined) {
      updateFields.notes = notes;
    }

    // Update the pay period
    const { data: updatedPeriod, error: updateError } = await supabaseAdmin
      .from('pay_periods')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating pay period:', updateError);
      return NextResponse.json(
        { error: 'Failed to update pay period' },
        { status: 500 }
      );
    }

    // Handle bulk entry updates on certain status transitions
    if (status === 'approved') {
      const { error: approveEntriesError } = await supabaseAdmin
        .from('pay_period_entries')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('pay_period_id', id);

      if (approveEntriesError) {
        console.error('Error approving pay period entries:', approveEntriesError);
        // Non-blocking: period was updated, but entries failed
      }
    } else if (status === 'paid') {
      const { error: paidEntriesError } = await supabaseAdmin
        .from('pay_period_entries')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('pay_period_id', id);

      if (paidEntriesError) {
        console.error('Error marking pay period entries as paid:', paidEntriesError);
        // Non-blocking: period was updated, but entries failed
      }
    }

    // Audit log
    const ctx = getRequestContext(request);
    const changes: Record<string, { from?: any; to?: any }> = {};

    if (status && status !== currentPeriod.status) {
      changes.status = { from: currentPeriod.status, to: status };
    }
    if (pay_date !== undefined) {
      changes.pay_date = { from: currentPeriod.pay_date, to: pay_date };
    }
    if (notes !== undefined) {
      changes.notes = { from: currentPeriod.notes, to: notes };
    }

    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: status ? 'status_change' : 'update',
      entityType: 'pay_period',
      entityId: id,
      description: status
        ? `Pay period status changed from '${currentPeriod.status}' to '${status}'`
        : `Pay period updated`,
      changes,
      ...ctx,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Pay period updated successfully',
        data: updatedPeriod,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in pay period PATCH route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
