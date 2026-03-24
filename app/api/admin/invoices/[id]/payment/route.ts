/**
 * API Route: /api/admin/invoices/[id]/payment
 * POST - Record a payment against an invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
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

    // Fetch current invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, balance_due, total_amount, status')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
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
