export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/invoices/[id]/mark-paid
 *
 * Office-admin shortcut to mark an invoice paid (full or partial).
 * Updates: amount_paid, paid_at, paid_by, balance_due, status.
 *
 * Body:
 *   {
 *     paid_amount?: number;  // defaults to total_amount (full payment)
 *     paid_at?: string;      // ISO datetime; defaults to now
 *   }
 *
 * Auth: requireAdmin (admin / super_admin / operations_manager).
 *
 * NOTE: This is intentionally a SEPARATE endpoint from /payment, which writes
 * to the `payments` ledger. This endpoint is the lightweight "office mark paid"
 * action that drives the commission ledger via invoices.paid_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { notifySalesperson } from '@/lib/notify-salesperson';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: invoiceId } = await params;

    const body = await request.json().catch(() => ({} as any));
    const { paid_amount, paid_at } = body ?? {};

    // Fetch invoice (and tenant-scope check).
    const { data: invoice, error: fetchErr } = await supabaseAdmin
      .from('invoices')
      .select('id, total_amount, amount_paid, balance_due, status, tenant_id, invoice_number')
      .eq('id', invoiceId)
      .maybeSingle();

    if (fetchErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Tenant guard: non-super-admins must match.
    if (auth.role !== 'super_admin') {
      if (!auth.tenantId || invoice.tenant_id !== auth.tenantId) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
    }

    const totalAmount = Number(invoice.total_amount ?? 0);

    // Resolve paid_amount — default = total (full payment).
    let resolvedPaid: number;
    if (paid_amount === undefined || paid_amount === null) {
      resolvedPaid = totalAmount;
    } else {
      const parsed = Number(paid_amount);
      if (isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'paid_amount must be a non-negative number' },
          { status: 400 }
        );
      }
      resolvedPaid = parsed;
    }

    // Resolve paid_at — default = now.
    let resolvedPaidAt: string;
    if (paid_at) {
      const d = new Date(paid_at);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'paid_at is not a valid ISO date' }, { status: 400 });
      }
      resolvedPaidAt = d.toISOString();
    } else {
      resolvedPaidAt = new Date().toISOString();
    }

    const newBalanceDue = Math.max(0, totalAmount - resolvedPaid);
    const newStatus = newBalanceDue <= 0 ? 'paid' : 'partial';

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('invoices')
      .update({
        amount_paid: resolvedPaid,
        balance_due: newBalanceDue,
        paid_at: resolvedPaidAt,
        paid_by: auth.userId,
        status: newStatus,
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (updateErr) {
      console.error('[mark-paid] update error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to mark invoice paid' }, { status: 500 });
    }

    // Fire-and-forget audit log.
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        tenant_id: invoice.tenant_id,
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'admin_mark_invoice_paid',
        resource_type: 'invoice',
        resource_id: invoiceId,
        details: {
          invoice_number: invoice.invoice_number,
          paid_amount: resolvedPaid,
          paid_at: resolvedPaidAt,
          new_status: newStatus,
          new_balance_due: newBalanceDue,
        },
      })
    ).then(() => {}).catch(() => {});

    // Fire-and-forget salesperson notification when fully paid.
    if (newStatus === 'paid') {
      (async () => {
        try {
          const { data: lineItem } = await supabaseAdmin
            .from('invoice_line_items')
            .select('job_order_id')
            .eq('invoice_id', invoiceId)
            .not('job_order_id', 'is', null)
            .limit(1)
            .maybeSingle();

          let recipientUserId: string | null = null;
          let jobOrderId: string | null = null;
          if (lineItem?.job_order_id) {
            jobOrderId = lineItem.job_order_id;
            const { data: job } = await supabaseAdmin
              .from('job_orders')
              .select('created_by')
              .eq('id', lineItem.job_order_id)
              .maybeSingle();
            if (job?.created_by) recipientUserId = job.created_by;
          }
          if (!recipientUserId) {
            const { data: inv } = await supabaseAdmin
              .from('invoices')
              .select('created_by')
              .eq('id', invoiceId)
              .maybeSingle();
            if (inv?.created_by) recipientUserId = inv.created_by;
          }
          if (recipientUserId) {
            await notifySalesperson({
              event: 'invoice_paid',
              invoiceId,
              jobOrderId: jobOrderId || undefined,
              recipientUserId,
              tenantId: invoice.tenant_id,
              subjectName: invoice.invoice_number,
            });
          }
        } catch {}
      })().catch(() => {});
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('[mark-paid] unexpected error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
