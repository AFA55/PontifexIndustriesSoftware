export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/timecards/entries/[entryId]
 * Admin edits a single timecard entry:
 *   - clock_in / clock_out times
 *   - pay_category override
 *   - is_shop_time flag
 *   - admin_notes
 * Sets clock_in_edited / clock_out_edited = true when times change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import type { PayCategory } from '@/lib/pay-calculator';

const VALID_PAY_CATEGORIES: PayCategory[] = ['regular', 'night_shift', 'shop', 'overtime'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { entryId } = await params;
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const body = await request.json();
    const { clock_in, clock_out, pay_category, is_shop_time, admin_notes } = body;

    // Validate pay category if provided
    if (pay_category !== undefined && !VALID_PAY_CATEGORIES.includes(pay_category)) {
      return NextResponse.json(
        { error: `pay_category must be one of: ${VALID_PAY_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Determine which table to update — check timecard_entries first, then timecards
    const { data: entryRow } = await supabaseAdmin
      .from('timecard_entries')
      .select('id, tenant_id, clock_in, clock_out')
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (entryRow) {
      // Update timecard_entries (new-style)
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (clock_in !== undefined) {
        updates.clock_in = clock_in;
        updates.clock_in_edited = true;
      }
      if (clock_out !== undefined) {
        updates.clock_out = clock_out;
        updates.clock_out_edited = true;
      }
      if (pay_category !== undefined) updates.pay_category = pay_category;
      if (is_shop_time !== undefined) updates.is_shop_time = is_shop_time;
      if (admin_notes !== undefined) updates.admin_notes = admin_notes;

      // Recalculate total_hours if times changed
      if (clock_in !== undefined || clock_out !== undefined) {
        const newIn = new Date(clock_in ?? entryRow.clock_in);
        const newOut = clock_out !== undefined
          ? (clock_out ? new Date(clock_out) : null)
          : (entryRow.clock_out ? new Date(entryRow.clock_out) : null);
        if (newOut) {
          const diffMs = newOut.getTime() - newIn.getTime();
          updates.total_hours = parseFloat((diffMs / 3_600_000).toFixed(4));
        }
      }

      const { data, error } = await supabaseAdmin
        .from('timecard_entries')
        .update(updates)
        .eq('id', entryId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        console.error('Error updating timecard_entries:', error);
        return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
      }

      // Audit log (fire-and-forget)
      Promise.resolve(
        supabaseAdmin.from('audit_logs').insert({
          action: 'admin_edit_timecard_entry',
          actor_id: auth.userId,
          resource_type: 'timecard_entry',
          resource_id: entryId,
          details: { updates, table: 'timecard_entries' },
          tenant_id: tenantId,
        })
      ).catch(() => {});

      return NextResponse.json({ success: true, data });
    }

    // Fall back to legacy timecards table
    const { data: legacyRow } = await supabaseAdmin
      .from('timecards')
      .select('id, tenant_id, clock_in_time, clock_out_time')
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!legacyRow) {
      return NextResponse.json({ error: 'Timecard entry not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (clock_in !== undefined) {
      updates.clock_in_time = clock_in;
      updates.clock_in_edited = true;
    }
    if (clock_out !== undefined) {
      updates.clock_out_time = clock_out;
      updates.clock_out_edited = true;
    }
    if (pay_category !== undefined) updates.pay_category = pay_category;
    if (is_shop_time !== undefined) {
      updates.is_shop_time = is_shop_time;
      // Keep is_shop_hours in sync with legacy column
      updates.is_shop_hours = is_shop_time;
    }
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;

    // Recalculate total_hours
    if (clock_in !== undefined || clock_out !== undefined) {
      const newIn = new Date(clock_in ?? legacyRow.clock_in_time);
      const newOut = clock_out !== undefined
        ? (clock_out ? new Date(clock_out) : null)
        : (legacyRow.clock_out_time ? new Date(legacyRow.clock_out_time) : null);
      if (newOut) {
        const diffMs = newOut.getTime() - newIn.getTime();
        updates.total_hours = parseFloat((diffMs / 3_600_000).toFixed(4));
      }
    }

    const { data, error } = await supabaseAdmin
      .from('timecards')
      .update(updates)
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating timecards:', error);
      return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
    }

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        action: 'admin_edit_timecard_entry',
        actor_id: auth.userId,
        resource_type: 'timecard',
        resource_id: entryId,
        details: { updates, table: 'timecards' },
        tenant_id: tenantId,
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/timecards/entries/[entryId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
