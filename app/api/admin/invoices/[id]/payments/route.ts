/**
 * API Route: GET/POST /api/admin/invoices/[id]/payments
 * Manage payments on a specific invoice (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

// GET: Fetch all payments for a specific invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Verify the invoice exists
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Fetch payments for this invoice
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false });

    if (paymentsError) {
      console.error('Error fetching invoice payments:', paymentsError);
      return NextResponse.json(
        { error: 'Failed to fetch payments' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: payments || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in invoice payments GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Record a payment against an invoice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { amount, payment_method, payment_date, reference_number, notes } = body;

    // Validate required fields
    if (amount === undefined || amount === null || !payment_method) {
      return NextResponse.json(
        { error: 'Missing required fields: amount, payment_method' },
        { status: 400 }
      );
    }

    // Validate amount is positive
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Fetch the invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Prevent payments on voided invoices
    if (invoice.status === 'void') {
      return NextResponse.json(
        { error: 'Cannot record payment on a voided invoice' },
        { status: 400 }
      );
    }

    // Insert the payment record
    const paymentData: Record<string, any> = {
      invoice_id: id,
      amount: paymentAmount,
      payment_method,
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      created_by: auth.userId,
    };

    if (reference_number) {
      paymentData.reference_number = reference_number;
    }

    if (notes) {
      paymentData.notes = notes;
    }

    const { data: payment, error: insertError } = await supabaseAdmin
      .from('payments')
      .insert(paymentData)
      .select()
      .single();

    if (insertError) {
      console.error('Error recording payment:', insertError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // Update the invoice: increment amount_paid and determine new status
    const currentAmountPaid = parseFloat(invoice.amount_paid || '0');
    const newAmountPaid = currentAmountPaid + paymentAmount;
    const totalAmount = parseFloat(invoice.total_amount || invoice.amount || '0');

    let newStatus = invoice.status;
    if (newAmountPaid >= totalAmount) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partial';
    }

    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating invoice after payment:', updateError);
      // Payment was recorded but invoice update failed -- log but don't fail the request
    }

    // Audit log
    const ctx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'payment',
      entityType: 'invoice',
      entityId: id,
      description: `Recorded payment of $${paymentAmount.toFixed(2)} on invoice`,
      changes: {
        amount_paid: { from: currentAmountPaid, to: newAmountPaid },
        status: { from: invoice.status, to: newStatus },
      },
      metadata: {
        payment_id: payment?.id,
        payment_method,
        payment_amount: paymentAmount,
        reference_number: reference_number || null,
      },
      ...ctx,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Payment recorded successfully',
        data: payment,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in invoice payments POST route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
