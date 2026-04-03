export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/invoices/[id]
 * GET - Get invoice with line items
 * PATCH - Update invoice (status, amounts, line items)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;

    let invoiceQuery = supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id);
    if (tenantId) { invoiceQuery = invoiceQuery.eq('tenant_id', tenantId); }
    const { data: invoice, error } = await invoiceQuery.single();

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get line items
    const { data: lineItems } = await supabaseAdmin
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true });

    // Get payments
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: true });

    return NextResponse.json({
      success: true,
      data: {
        ...invoice,
        line_items: lineItems || [],
        payments: payments || [],
      },
    });
  } catch (error: any) {
    console.error('Error in invoice GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;
    const body = await request.json();

    // Allowed update fields
    const allowedFields = [
      'customer_name', 'customer_email', 'billing_address',
      'due_date', 'subtotal', 'tax_rate', 'tax_amount',
      'discount_amount', 'discount_description', 'total_amount',
      'amount_paid', 'status', 'payment_terms', 'po_number',
      'contract_number', 'notes', 'internal_notes',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Handle status transitions
    if (updates.status) {
      const now = new Date().toISOString();
      switch (updates.status) {
        case 'sent':
          if (!body.sent_at) {
            updates.sent_at = now;
            updates.sent_by = auth.userId;
          }
          break;
        case 'paid':
          if (!body.paid_date) {
            updates.paid_date = now.split('T')[0];
          }
          // Set amount_paid = total_amount so balance_due (generated) becomes 0
          if (body.amount_paid === undefined) {
            // Fetch current invoice to get total_amount
            const { data: currentInvoice } = await supabaseAdmin
              .from('invoices')
              .select('total_amount')
              .eq('id', id)
              .single();
            if (currentInvoice) {
              updates.amount_paid = currentInvoice.total_amount;
            }
          }
          break;
        case 'overdue':
          // No extra fields needed
          break;
        case 'void':
          if (!body.void_reason) {
            updates.internal_notes = (body.internal_notes || '') + `\nVoided on ${now.split('T')[0]} by user ${auth.userId}`;
          }
          break;
      }
    }

    updates.updated_at = new Date().toISOString();

    let updateQuery = supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', id);
    if (tenantId) { updateQuery = updateQuery.eq('tenant_id', tenantId); }
    const { data: invoice, error } = await updateQuery.select().single();

    if (error) {
      console.error('Error updating invoice:', error);
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    // Update line items if provided
    if (body.line_items && Array.isArray(body.line_items)) {
      // Delete existing and re-insert
      await supabaseAdmin
        .from('invoice_line_items')
        .delete()
        .eq('invoice_id', id);

      if (body.line_items.length > 0) {
        const items = body.line_items.map((item: any, idx: number) => ({
          invoice_id: id,
          line_number: idx + 1,
          description: item.description,
          billing_type: item.billing_type || 'labor',
          quantity: item.quantity || 1,
          unit: item.unit || 'each',
          unit_rate: item.unit_rate || 0,
          job_order_id: item.job_order_id || null,
          operator_id: item.operator_id || null,
          taxable: item.taxable !== false,
        }));

        await supabaseAdmin
          .from('invoice_line_items')
          .insert(items);
      }
    }

    return NextResponse.json({
      success: true,
      data: invoice,
    });
  } catch (error: any) {
    console.error('Error in invoice PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
