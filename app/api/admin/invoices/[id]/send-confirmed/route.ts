export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/invoices/[id]/send-confirmed
 *
 * Admin finalizes a confirmed invoice and marks it as sent.
 * Transitions status: confirmed → sent
 * Sets sent_at to now.
 * Admin-only — salesperson cannot directly send invoices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId && auth.role !== 'super_admin') {
      return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });
    }

    // Fetch the invoice — validate it exists and belongs to caller's tenant
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, status, tenant_id, created_by, customer_email')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    // Tenant isolation (super_admin bypasses)
    if (auth.role !== 'super_admin' && invoice.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    if (invoice.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Invoice is ${invoice.status}. Only confirmed invoices can be sent via this endpoint.` },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('Error marking invoice as sent:', updateError);
      return NextResponse.json({ error: 'Failed to mark invoice as sent.' }, { status: 500 });
    }

    // Best-effort: notify the invoice creator that admin has sent it
    if (invoice.created_by) {
      Promise.resolve(
        supabaseAdmin.from('notifications').insert({
          user_id: invoice.created_by,
          sender_id: auth.userId,
          tenant_id: callerTenantId || invoice.tenant_id,
          type: 'invoice_sent',
          notification_type: 'invoice_sent',
          title: `Invoice ${invoice.invoice_number} sent to customer`,
          message: `${invoice.invoice_number} has been finalized and sent to the customer.`,
          action_url: '/dashboard/admin/billing',
          is_read: false,
          read: false,
          is_email_sent: false,
          metadata: {
            event: 'invoice_sent',
            invoiceId: invoice.id,
          },
        })
      ).then(() => {}).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Invoice ${invoice.invoice_number} marked as sent.`,
    });
  } catch (error: any) {
    console.error('Error in send-confirmed invoice PATCH:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
