export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/invoices/[id]/payment
 * POST - Record a payment against an invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { Resend } from 'resend';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const {
      amount,
      payment_method,
      payment_date,
      reference_number,
      notes,
    } = body;

    // Validate required fields
    if (amount === undefined || amount === null) {
      return NextResponse.json({ error: 'Amount is required' }, { status: 400 });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const validPaymentMethods = ['check', 'cash', 'card', 'ach', 'wire', 'other'];
    if (!payment_method || !validPaymentMethods.includes(payment_method)) {
      return NextResponse.json(
        { error: `payment_method must be one of: ${validPaymentMethods.join(', ')}` },
        { status: 400 }
      );
    }

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // Fetch current invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, balance_due, total_amount, status, customer_name, customer_email, invoice_number, tenant_id')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // P0-3: Cross-tenant FK check
    if (invoice.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const currentBalanceDue = Number(invoice.balance_due);

    if (parsedAmount > currentBalanceDue) {
      return NextResponse.json(
        { error: `Payment amount ($${parsedAmount.toFixed(2)}) exceeds balance due ($${currentBalanceDue.toFixed(2)})` },
        { status: 400 }
      );
    }

    // Determine payment date (default to today)
    const resolvedPaymentDate = payment_date || new Date().toISOString().split('T')[0];

    // Insert payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        invoice_id: id,
        amount: parsedAmount,
        payment_method,
        payment_date: resolvedPaymentDate,
        reference_number: reference_number || null,
        notes: notes || null,
        recorded_by: auth.userId,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Error inserting payment:', paymentError);
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
    }

    // Recalculate balance
    const newBalanceDue = currentBalanceDue - parsedAmount;
    const fullyPaid = newBalanceDue <= 0;

    const invoiceUpdates: any = {
      balance_due: Math.max(0, newBalanceDue),
      updated_at: new Date().toISOString(),
    };

    if (fullyPaid) {
      invoiceUpdates.status = 'paid';
      invoiceUpdates.paid_at = new Date().toISOString();
    }

    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update(invoiceUpdates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating invoice after payment:', updateError);
      return NextResponse.json({ error: 'Payment recorded but failed to update invoice balance' }, { status: 500 });
    }

    // Fire-and-forget: send payment receipt email when fully paid
    if (fullyPaid && invoice.customer_email) {
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Patriot Concrete Cutting <noreply@resend.dev>';
      const fmt$ = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
      const resend = new Resend(process.env.RESEND_API_KEY);
      Promise.resolve(
        resend.emails.send({
          from: fromAddress,
          to: invoice.customer_email,
          subject: `Payment Receipt — Invoice ${invoice.invoice_number}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Payment Received</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0; font-size: 14px;">Thank you for your payment</p>
              </div>
              <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
                <p style="margin: 0 0 16px; font-size: 15px;">Hi ${invoice.customer_name || 'Valued Customer'},</p>
                <p style="margin: 0 0 20px; color: #475569;">We've received your payment and your account is now paid in full.</p>
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr><td style="padding: 6px 0; color: #64748b;">Invoice</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${invoice.invoice_number}</td></tr>
                    <tr><td style="padding: 6px 0; color: #64748b;">Payment Date</td><td style="padding: 6px 0; text-align: right;">${resolvedPaymentDate}</td></tr>
                    <tr><td style="padding: 6px 0; color: #64748b;">Payment Method</td><td style="padding: 6px 0; text-align: right; text-transform: capitalize;">${payment_method}${reference_number ? ` · #${reference_number}` : ''}</td></tr>
                    <tr style="border-top: 1px solid #e2e8f0;"><td style="padding: 10px 0 4px; font-weight: bold; font-size: 15px;">Amount Paid</td><td style="padding: 10px 0 4px; text-align: right; font-weight: bold; font-size: 15px; color: #059669;">${fmt$(parsedAmount)}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">Remaining Balance</td><td style="padding: 4px 0; text-align: right; font-weight: bold; color: #059669;">$0.00 — Paid in Full</td></tr>
                  </table>
                </div>
                <p style="margin: 0; color: #64748b; font-size: 13px;">Thank you for choosing Patriot Concrete Cutting. We look forward to working with you again.</p>
              </div>
            </div>
          `,
        })
      ).catch(() => {});
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'payment_recorded',
        resource_type: 'invoice',
        resource_id: id,
        details: {
          amount: parsedAmount,
          payment_method,
          payment_date: resolvedPaymentDate,
          reference_number: reference_number || null,
          new_balance_due: Math.max(0, newBalanceDue),
          fully_paid: fullyPaid,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        payment,
        invoice: updatedInvoice,
        fullyPaid,
      },
    });
  } catch (error: any) {
    console.error('Error in payment POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
