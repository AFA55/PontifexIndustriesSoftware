export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/cron/invoice-30d-reminders
 *
 * Sends a 30-day "invoice unpaid" reminder to the salesperson who created
 * each outstanding invoice's source job. Designed to be triggered by a cron
 * service (Vercel Cron / external scheduler) via:
 *
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * If `CRON_SECRET` is not configured, the route falls back to admin auth so
 * it can be triggered manually for testing.
 *
 * Dedupe: skips invoices that already have an `invoice_unpaid_30d`
 * notification (matching `metadata->>invoiceId`) within the last 7 days.
 *
 * Returns: { success, sent, skipped, scanned }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { notifySalesperson } from '@/lib/notify-salesperson';

export async function POST(request: NextRequest) {
  try {
    // Auth: prefer CRON_SECRET, fall back to admin for manual testing.
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') || '';
    const tokenMatchesCronSecret =
      cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!tokenMatchesCronSecret) {
      if (cronSecret) {
        // Cron secret configured but header didn't match — reject.
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // No cron secret configured — fall back to admin auth for testing.
      const auth = await requireAdmin(request);
      if (!auth.authorized) return auth.response;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Pull candidate invoices.
    const { data: invoices, error: invoicesError } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, customer_name, status, balance_due, invoice_date, tenant_id, created_by')
      .in('status', ['sent', 'overdue', 'partial'])
      .gt('balance_due', 0)
      .lte('invoice_date', thirtyDaysAgo)
      .not('tenant_id', 'is', null);

    if (invoicesError) {
      console.error('Failed to fetch overdue invoices:', invoicesError);
      return NextResponse.json(
        { error: 'Failed to fetch invoices', details: invoicesError.message },
        { status: 500 }
      );
    }

    const candidates = invoices || [];
    let sent = 0;
    let skipped = 0;

    for (const invoice of candidates) {
      try {
        // Dedupe: skip if a reminder for this invoice was sent within the last 7 days.
        const { data: recent } = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('type', 'invoice_unpaid_30d')
          .gte('created_at', sevenDaysAgoIso)
          .filter('metadata->>invoiceId', 'eq', invoice.id)
          .limit(1)
          .maybeSingle();

        if (recent) {
          skipped++;
          continue;
        }

        // Resolve recipient: linked job's created_by, fall back to invoice.created_by.
        let recipientUserId: string | null = null;
        let jobOrderId: string | null = null;

        const { data: lineItem } = await supabaseAdmin
          .from('invoice_line_items')
          .select('job_order_id')
          .eq('invoice_id', invoice.id)
          .not('job_order_id', 'is', null)
          .limit(1)
          .maybeSingle();

        if (lineItem?.job_order_id) {
          jobOrderId = lineItem.job_order_id;
          const { data: job } = await supabaseAdmin
            .from('job_orders')
            .select('created_by')
            .eq('id', lineItem.job_order_id)
            .maybeSingle();
          if (job?.created_by) recipientUserId = job.created_by;
        }

        if (!recipientUserId && invoice.created_by) {
          recipientUserId = invoice.created_by;
        }

        if (!recipientUserId) {
          skipped++;
          continue;
        }

        await notifySalesperson({
          event: 'invoice_unpaid_30d',
          invoiceId: invoice.id,
          jobOrderId: jobOrderId || undefined,
          recipientUserId,
          tenantId: invoice.tenant_id || null,
          subjectName: invoice.invoice_number || invoice.id,
          customerName: invoice.customer_name || undefined,
        });
        sent++;
      } catch (perInvoiceErr) {
        console.error('30d reminder error for invoice', invoice.id, perInvoiceErr);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      scanned: candidates.length,
      sent,
      skipped,
    });
  } catch (error: any) {
    console.error('Error in invoice-30d-reminders cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
