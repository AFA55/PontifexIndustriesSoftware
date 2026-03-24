/**
 * API Route: POST /api/admin/invoices/[id]/send
 * Send invoice via email to the customer using Resend
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

    // 1. Fetch invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 2. Check customer email
    if (!invoice.customer_email) {
      return NextResponse.json(
        {
          error: `No email address on file for ${invoice.customer_name}. Please update the invoice with a customer email before sending.`,
        },
        { status: 400 }
      );
    }

    // 3. Fetch line items
    const { data: lineItems } = await supabaseAdmin
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true });

    // 4. Build professional HTML email
    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const lineItemsHtml = (lineItems || [])
      .map(
        (item: any) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${item.description || ''}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #64748b; font-size: 14px;">${Number(item.quantity)} ${item.unit || ''}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #64748b; font-size: 14px;">${formatCurrency(Number(item.unit_rate))}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #1e293b; font-weight: 600; font-size: 14px;">${formatCurrency(Number(item.amount))}</td>
        </tr>`
      )
      .join('');

    const taxRowHtml =
      Number(invoice.tax_amount) > 0
        ? `<tr>
            <td colspan="3" style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 14px;">Tax</td>
            <td style="padding: 8px 12px; text-align: right; color: #1e293b; font-size: 14px;">${formatCurrency(Number(invoice.tax_amount))}</td>
          </tr>`
        : '';

    const discountRowHtml =
      Number(invoice.discount_amount) > 0
        ? `<tr>
            <td colspan="3" style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 14px;">Discount</td>
            <td style="padding: 8px 12px; text-align: right; color: #16a34a; font-size: 14px;">-${formatCurrency(Number(invoice.discount_amount))}</td>
          </tr>`
        : '';

    const balanceDueHtml =
      Number(invoice.balance_due) > 0 && invoice.status !== 'paid'
        ? `<tr>
            <td colspan="3" style="padding: 8px 12px; text-align: right; color: #d97706; font-size: 14px; font-weight: 600;">Balance Due</td>
            <td style="padding: 8px 12px; text-align: right; color: #d97706; font-size: 14px; font-weight: 700;">${formatCurrency(Number(invoice.balance_due))}</td>
          </tr>`
        : '';

    const notesHtml = invoice.notes
      ? `<div style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border-radius: 8px; border-left: 3px solid #7c3aed;">
          <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Notes</p>
          <p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-line;">${invoice.notes}</p>
        </div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoice.invoice_number} — Patriot Concrete Cutting</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #7c3aed 100%); padding: 32px 40px; border-radius: 12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Patriot Concrete Cutting</p>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #c4b5fd;">Professional Concrete Solutions</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.1em;">Invoice</p>
                    <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 800; color: #ffffff;">${invoice.invoice_number}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px 40px;">

              <!-- Greeting -->
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #334155;">
                Dear <strong>${invoice.customer_name}</strong>,
              </p>
              <p style="margin: 0 0 28px 0; font-size: 14px; color: #64748b; line-height: 1.6;">
                Please find your invoice details below. Payment is due by the date listed below. We appreciate your prompt attention and thank you for choosing Patriot Concrete Cutting.
              </p>

              <!-- Invoice Meta -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px; background-color: #f8fafc; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Invoice Date</p>
                          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #1e293b;">${invoice.invoice_date}</p>
                        </td>
                        <td width="50%">
                          <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Due Date</p>
                          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: ${invoice.due_date ? '#dc2626' : '#1e293b'};">${invoice.due_date || 'Upon Receipt'}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  invoice.po_number
                    ? `<tr>
                        <td style="padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">
                          <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">PO Number</p>
                          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #1e293b;">${invoice.po_number}</p>
                        </td>
                      </tr>`
                    : ''
                }
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Amount Due</p>
                    <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: 800; color: #7c3aed;">${formatCurrency(Number(invoice.total_amount))}</p>
                  </td>
                </tr>
              </table>

              <!-- Line Items -->
              <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Line Items</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 28px;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;">Description</th>
                    <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;">Qty</th>
                    <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;">Rate</th>
                    <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsHtml || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #94a3b8; font-size: 14px;">No line items</td></tr>'}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3" style="padding: 10px 12px; text-align: right; color: #64748b; font-size: 14px; border-top: 2px solid #e2e8f0;">Subtotal</td>
                    <td style="padding: 10px 12px; text-align: right; color: #1e293b; font-size: 14px; border-top: 2px solid #e2e8f0;">${formatCurrency(Number(invoice.subtotal))}</td>
                  </tr>
                  ${taxRowHtml}
                  ${discountRowHtml}
                  <tr>
                    <td colspan="3" style="padding: 12px 12px; text-align: right; color: #1e293b; font-size: 16px; font-weight: 800; border-top: 2px solid #e2e8f0;">Total</td>
                    <td style="padding: 12px 12px; text-align: right; color: #1e293b; font-size: 16px; font-weight: 800; border-top: 2px solid #e2e8f0;">${formatCurrency(Number(invoice.total_amount))}</td>
                  </tr>
                  ${balanceDueHtml}
                </tfoot>
              </table>

              ${notesHtml}

              <!-- Payment Instructions -->
              <div style="margin-top: 28px; padding: 20px; background: linear-gradient(135deg, #ede9fe, #ddd6fe); border-radius: 10px; border: 1px solid #c4b5fd;">
                <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #4c1d95;">Payment Instructions</p>
                <p style="margin: 0; font-size: 13px; color: #5b21b6; line-height: 1.6;">
                  Please remit payment by the due date listed above. If you have any questions regarding this invoice, contact us at
                  <a href="mailto:billing@patriotconcretecutting.com" style="color: #7c3aed; font-weight: 600;">billing@patriotconcretecutting.com</a>.
                  We accept check, ACH, and credit card.
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

    // 5. Send email via Resend
    await resend.emails.send({
      from: 'billing@patriotconcretecutting.com',
      to: invoice.customer_email,
      subject: `Invoice ${invoice.invoice_number} from Patriot Concrete Cutting`,
      html,
    });

    // 6. Update invoice status to 'sent'
    await supabaseAdmin
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: auth.userId,
      })
      .eq('id', id);

    // 7. Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'invoice_sent',
        resource_type: 'invoice',
        resource_id: id,
        details: {
          invoice_number: invoice.invoice_number,
          customer_email: invoice.customer_email,
          customer_name: invoice.customer_name,
        },
      })
    )
      .then(() => {})
      .catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${invoice.customer_email}`,
    });
  } catch (error: any) {
    console.error('Error sending invoice email:', error);
    return NextResponse.json(
      { error: 'Failed to send invoice email. Please try again.' },
      { status: 500 }
    );
  }
}
