export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/invoices/[id]/confirm
 *
 * Salesperson (or admin) confirms a draft invoice as ready to send.
 * Transitions status: draft → confirmed
 * Records confirmed_by, confirmed_at, confirm_notes.
 * Fire-and-forget notifies all admins in the tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

const CONFIRM_ROLES = ['salesman', 'admin', 'super_admin', 'operations_manager'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    // Only salesperson + management can confirm invoices
    if (!CONFIRM_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden. Salesperson or admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { notes } = body as { notes?: string };

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId && auth.role !== 'super_admin') {
      return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });
    }

    // Fetch the invoice — validate it exists and belongs to caller's tenant
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, status, tenant_id, created_by')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    // Tenant isolation (super_admin bypasses)
    if (auth.role !== 'super_admin' && invoice.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    if (invoice.status !== 'draft') {
      return NextResponse.json(
        { error: `Invoice is already ${invoice.status}. Only draft invoices can be confirmed.` },
        { status: 422 }
      );
    }

    // Perform the status transition
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'confirmed',
        confirmed_by: auth.userId,
        confirmed_at: now,
        confirm_notes: notes?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('Error confirming invoice:', updateError);
      return NextResponse.json({ error: 'Failed to confirm invoice.' }, { status: 500 });
    }

    // Fire-and-forget: notify all admin/operations_manager users in this tenant
    const tenantId = callerTenantId || invoice.tenant_id;
    if (tenantId) {
      Promise.resolve(
        (async () => {
          try {
            // Resolve the confirming user's name
            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('full_name')
              .eq('id', auth.userId)
              .single();
            const confirmerName = profile?.full_name || auth.userEmail || 'Someone';

            // Find all admin/ops_manager users in the tenant
            const { data: adminProfiles } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('tenant_id', tenantId)
              .in('role', ['admin', 'super_admin', 'operations_manager']);

            if (!adminProfiles?.length) return;

            const notifications = adminProfiles
              // Don't double-notify if confirmer is also admin
              .filter(p => p.id !== auth.userId)
              .map(p => ({
                user_id: p.id,
                sender_id: auth.userId,
                tenant_id: tenantId,
                type: 'invoice_confirmed',
                notification_type: 'invoice_confirmed',
                title: `Invoice ${invoice.invoice_number} confirmed — ready to send`,
                message: `${confirmerName} has confirmed ${invoice.invoice_number} and marked it ready to send to the customer.`,
                action_url: '/dashboard/admin/billing',
                is_read: false,
                read: false,
                is_email_sent: false,
                metadata: {
                  event: 'invoice_confirmed',
                  invoiceId: invoice.id,
                  confirmedBy: auth.userId,
                },
              }));

            if (notifications.length > 0) {
              await supabaseAdmin.from('notifications').insert(notifications);
            }
          } catch {
            // swallow — fire-and-forget
          }
        })()
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Invoice ${invoice.invoice_number} confirmed and ready to send.`,
    });
  } catch (error: any) {
    console.error('Error in confirm invoice PATCH:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
