export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/invoices/[id]/send
 * Send invoice via email to the customer using Resend
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { Resend } from 'resend';
import {
  DEFAULT_EMAIL_FROM,
  getResendApiKey,
  isEmailConfigured,
  getTenantEmailBranding,
  generateInvoiceEmail,
} from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // 1. Fetch invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // P0-3: Cross-tenant FK check
    if (invoice.tenant_id !== callerTenantId) {
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

    // 4. Build the white-labeled invoice email from the tenant's branding.
    const branding = await getTenantEmailBranding(invoice.tenant_id);
    // Tenant billing/reply contact — never a hardcoded Patriot address.
    let billingEmail: string | null = null;
    try {
      const { data: tb } = await supabaseAdmin
        .from('tenant_branding')
        .select('support_email')
        .eq('tenant_id', invoice.tenant_id)
        .maybeSingle();
      billingEmail = tb?.support_email || null;
      if (!billingEmail) {
        const { data: tRow } = await supabaseAdmin
          .from('tenants')
          .select('billing_email')
          .eq('id', invoice.tenant_id)
          .maybeSingle();
        billingEmail = tRow?.billing_email || null;
      }
    } catch {
      // optional contact — leave null
    }
    const html = await generateInvoiceEmail({
      variant: 'send',
      branding,
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      poNumber: invoice.po_number,
      lineItems: (lineItems || []).map((item: any) => ({
        description: item.description || '',
        quantity: Number(item.quantity),
        unit: item.unit || null,
        unitRate: Number(item.unit_rate),
        amount: Number(item.amount),
      })),
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.tax_amount),
      discountAmount: Number(invoice.discount_amount),
      totalAmount: Number(invoice.total_amount),
      balanceDue: Number(invoice.balance_due),
      status: invoice.status,
      notes: invoice.notes,
      billingEmail,
    });

    // 5. Guard: Resend API key must be configured
    if (!isEmailConfigured()) {
      console.error('RESEND_API_KEY is not configured.');
      return NextResponse.json(
        { error: 'Email delivery is not configured. Please contact your administrator.' },
        { status: 503 }
      );
    }

    // 6. Send email via Resend
    const resend = new Resend(getResendApiKey());
    // VERIFIED Resend domain — do not use RESEND_FROM_EMAIL (was misconfigured to the unverified root).
    const fromAddress = DEFAULT_EMAIL_FROM;

    let sendResult: { data: any; error: any };
    try {
      sendResult = await resend.emails.send({
        from: fromAddress,
        to: invoice.customer_email,
        subject: `Invoice ${invoice.invoice_number} from ${branding.companyName}`,
        html,
      });
    } catch (emailErr: any) {
      console.error('Resend SDK threw during email send:', emailErr);
      return NextResponse.json(
        { error: 'Failed to send invoice email. Please try again.' },
        { status: 500 }
      );
    }

    // Resend returns { data, error } — a non-null error means delivery was rejected
    if (sendResult.error) {
      console.error('Resend rejected the email:', sendResult.error);
      return NextResponse.json(
        {
          error: `Email delivery failed: ${sendResult.error.message || 'Unknown error from email provider.'}`,
        },
        { status: 502 }
      );
    }

    // 7. Update invoice status to 'sent' — email is out, update must succeed
    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: auth.userId,
      })
      .eq('id', id);

    if (updateError) {
      // Email was sent but status update failed — log it but return success so
      // the caller knows the email went out. Admin can manually flip status.
      console.error(
        `Invoice ${invoice.invoice_number} email sent but status update failed:`,
        updateError
      );
    }

    // 8. Fire-and-forget audit log
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
          status_update_failed: !!updateError,
        },
      })
    )
      .then(() => {})
      .catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${invoice.customer_email}`,
      ...(updateError ? { warning: 'Invoice sent but status update failed — please refresh billing page.' } : {}),
    });
  } catch (error: any) {
    console.error('Error sending invoice email:', error);
    return NextResponse.json(
      { error: 'Failed to send invoice email. Please try again.' },
      { status: 500 }
    );
  }
}
