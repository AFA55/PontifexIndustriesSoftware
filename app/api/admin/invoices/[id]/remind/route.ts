/**
 * API Route: POST /api/admin/invoices/[id]/remind
 * Send a payment reminder email for an outstanding invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!invoice.customer_email) {
      return NextResponse.json(
        { error: `No email address on file for ${invoice.customer_name}.` },
        { status: 400 }
      );
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid.' }, { status: 400 });
    }

    if (invoice.status === 'void') {
      return NextResponse.json({ error: 'Cannot send reminder for a voided invoice.' }, { status: 400 });
    }

    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const balanceDue = Number(invoice.balance_due);
    const isOverdue = invoice.status === 'overdue';

    const today = new Date();
    const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
    const daysOverdue = dueDate
      ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const headerColor = isOverdue ? '#dc2626' : '#d97706';
    const headerBg = isOverdue
      ? 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #dc2626 100%)'
      : 'linear-gradient(135deg, #78350f 0%, #92400e 50%, #d97706 100%)';
    const urgencyLabel = isOverdue ? 'OVERDUE NOTICE' : 'PAYMENT REMINDER';
    const urgencyMsg = isOverdue
      ? `This invoice is <strong>${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</strong>. Please remit payment immediately to avoid service interruption.`
      : `This is a friendly reminder that your invoice is due on <strong>${invoice.due_date}</strong>. Please remit payment at your earliest convenience.`;

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'Patriot Concrete Cutting <noreply@resend.dev>';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Reminder — Invoice ${invoice.invoice_number}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: ${headerBg}; padding: 32px 40px; border-radius: 12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">Patriot Concrete Cutting</p>
                    <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.1em;">${urgencyLabel}</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.1em;">Invoice</p>
                    <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 800; color: #ffffff;">${invoice.invoice_number}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px 40px;">

              <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155;">
                Dear <strong>${invoice.customer_name}</strong>,
              </p>
              <p style="margin: 0 0 28px 0; font-size: 14px; color: #64748b; line-height: 1.6;">
                ${urgencyMsg}
              </p>

              <!-- Amount Due Box -->
              <div style="background: #fef2f2; border: 2px solid ${headerColor}; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
                <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Amount Due</p>
                <p style="margin: 0; font-size: 36px; font-weight: 900; color: ${headerColor};">${formatCurrency(balanceDue)}</p>
                ${dueDate ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #64748b;">Due: <strong>${invoice.due_date}</strong>${isOverdue ? ` &mdash; <span style="color: ${headerColor}; font-weight: 700;">${daysOverdue} days overdue</span>` : ''}</p>` : ''}
              </div>

              <!-- Invoice Reference -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Invoice #</p>
                          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #1e293b;">${invoice.invoice_number}</p>
                        </td>
                        <td width="50%">
                          <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Invoice Date</p>
                          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #1e293b;">${invoice.invoice_date}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${invoice.po_number ? `<tr><td style="padding: 12px 16px;">
                  <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">PO Number</p>
                  <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #1e293b;">${invoice.po_number}</p>
                </td></tr>` : ''}
              </table>

              <!-- Payment Instructions -->
              <div style="padding: 20px; background: #fff7ed; border-radius: 10px; border: 1px solid #fed7aa;">
                <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #9a3412;">Payment Instructions</p>
                <p style="margin: 0; font-size: 13px; color: #7c2d12; line-height: 1.6;">
                  Please remit payment by check, ACH, or credit card. For questions or to arrange payment, contact us at
                  <a href="mailto:billing@patriotconcretecutting.com" style="color: #ea580c; font-weight: 600;">billing@patriotconcretecutting.com</a>
                  or call <strong>(833) 695-4288</strong>.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1e1b4b; padding: 20px 40px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #a78bfa;">Patriot Concrete Cutting &mdash; Thank you for your business</p>
              <p style="margin: 6px 0 0 0; font-size: 11px; color: #6d28d9;">billing@patriotconcretecutting.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: fromAddress,
      to: invoice.customer_email,
      subject: isOverdue
        ? `⚠️ Overdue: Invoice ${invoice.invoice_number} — ${formatCurrency(balanceDue)} Past Due`
        : `Payment Reminder: Invoice ${invoice.invoice_number} — ${formatCurrency(balanceDue)} Due`,
      html,
    });

    // Track last reminder sent (fire-and-forget — column may not exist until migration applied)
    Promise.resolve(
      supabaseAdmin
        .from('invoices')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', id)
    ).then(() => {}).catch(() => {});

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'invoice_reminder_sent',
        resource_type: 'invoice',
        resource_id: id,
        details: {
          invoice_number: invoice.invoice_number,
          customer_email: invoice.customer_email,
          balance_due: balanceDue,
          is_overdue: isOverdue,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${invoice.customer_email}`,
    });
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return NextResponse.json(
      { error: 'Failed to send reminder email. Please try again.' },
      { status: 500 }
    );
  }
}
