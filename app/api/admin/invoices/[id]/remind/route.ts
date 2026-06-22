export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/invoices/[id]/remind
 * Send a payment reminder email for an outstanding invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { Resend } from 'resend';
import {
  DEFAULT_EMAIL_FROM,
  getResendApiKey,
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

    // VERIFIED Resend domain — do not use RESEND_FROM_EMAIL (was misconfigured to the unverified root).
    const fromAddress = DEFAULT_EMAIL_FROM;

    // White-labeled reminder — branding + billing/phone contact from the tenant.
    const branding = await getTenantEmailBranding(invoice.tenant_id);
    let billingEmail: string | null = null;
    let companyPhone: string | null = null;
    try {
      const { data: tb } = await supabaseAdmin
        .from('tenant_branding')
        .select('support_email, support_phone')
        .eq('tenant_id', invoice.tenant_id)
        .maybeSingle();
      billingEmail = tb?.support_email || null;
      companyPhone = tb?.support_phone || null;
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
      variant: 'remind',
      branding,
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      poNumber: invoice.po_number,
      balanceDue,
      isOverdue,
      daysOverdue,
      billingEmail,
      companyPhone,
    });

    const resend = new Resend(getResendApiKey());
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
