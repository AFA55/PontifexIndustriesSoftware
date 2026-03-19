/**
 * API Route: POST /api/admin/invoices/create
 * Create a standalone invoice (not tied to a specific job order)
 * Supports custom line items, customer info, and all invoice fields
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const {
      customer_name,
      customer_id,
      customer_email,
      billing_address,
      invoice_date,
      due_date,
      po_number,
      payment_terms,
      notes,
      subtotal,
      tax_rate,
      tax_amount,
      total_amount,
      balance_due,
      status,
      line_items,
    } = body;

    if (!customer_name || !customer_name.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    // Generate invoice number: INV-{year}-{6 digits}
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const invoiceNumber = `INV-${year}-${randomNum}`;

    // Create the invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        customer_name: customer_name.trim(),
        customer_email: customer_email || null,
        billing_address: billing_address || null,
        invoice_date: invoice_date || new Date().toISOString().split('T')[0],
        due_date: due_date || null,
        subtotal: subtotal || 0,
        tax_rate: tax_rate || 0,
        tax_amount: tax_amount || 0,
        total_amount: total_amount || 0,
        balance_due: balance_due || total_amount || 0,
        status: status || 'draft',
        payment_terms: payment_terms || 30,
        po_number: po_number || null,
        notes: notes || null,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    // Insert line items
    if (line_items && Array.isArray(line_items) && line_items.length > 0) {
      const items = line_items.map((item: any, idx: number) => ({
        invoice_id: invoice.id,
        line_number: item.line_number || idx + 1,
        description: item.description || '',
        billing_type: item.billing_type || 'flat_rate',
        quantity: item.quantity || 1,
        unit: item.unit || 'each',
        unit_rate: item.unit_rate || item.rate || 0,
        amount: item.amount || 0,
        job_order_id: item.job_order_id || null,
        operator_id: item.operator_id || null,
        taxable: item.taxable !== false,
      }));

      const { error: lineError } = await supabaseAdmin
        .from('invoice_line_items')
        .insert(items);

      if (lineError) {
        console.error('Error creating line items:', lineError);
        // Invoice was created but line items failed - don't fail the whole request
      }
    }

    return NextResponse.json({
      success: true,
      data: invoice,
      message: `Invoice ${invoiceNumber} created as draft`,
    });
  } catch (error: any) {
    console.error('Error in invoices/create POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
