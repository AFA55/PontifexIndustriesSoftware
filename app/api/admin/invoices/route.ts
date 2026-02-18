/**
 * API Route: GET/POST /api/admin/invoices
 * Retrieve invoices with filtering/summary and create new invoices (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

// ── Types ────────────────────────────────────────────────────────────────────

interface LineItemInput {
  description: string;
  billing_type: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  job_order_id?: string;
  operator_id?: string;
  taxable?: boolean;
}

interface CreateInvoiceRequest {
  customer_name: string;
  customer_id?: string;
  customer_email?: string;
  billing_address?: string;
  invoice_date?: string;
  payment_terms?: number;
  po_number?: string;
  tax_rate?: number;
  discount_amount?: number;
  discount_description?: string;
  notes?: string;
  internal_notes?: string;
  line_items: LineItemInput[];
}

// ── GET: Fetch invoices with optional filters and summary ────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customer_id');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Build query
    let query = supabaseAdmin
      .from('invoices')
      .select('*')
      .order('invoice_date', { ascending: false })
      .limit(limit);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    if (startDate) {
      query = query.gte('invoice_date', startDate);
    }

    if (endDate) {
      query = query.lte('invoice_date', endDate);
    }

    const { data: invoices, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching invoices:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch invoices' },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const invoiceList = invoices || [];
    const totalCount = invoiceList.length;
    const totalAmount = invoiceList.reduce(
      (sum, inv) => sum + (parseFloat(inv.total_amount) || 0),
      0
    );
    const totalPaid = invoiceList.reduce(
      (sum, inv) => sum + (parseFloat(inv.amount_paid) || 0),
      0
    );
    const totalOutstanding = totalAmount - totalPaid;

    const statusCounts = invoiceList.reduce(
      (acc: Record<string, number>, inv) => {
        const s = inv.status || 'unknown';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      },
      {}
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          invoices: invoiceList,
          summary: {
            totalCount,
            totalAmount: Math.round(totalAmount * 100) / 100,
            totalPaid: Math.round(totalPaid * 100) / 100,
            totalOutstanding: Math.round(totalOutstanding * 100) / 100,
            statusCounts,
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in invoices GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── POST: Create a new invoice with line items ───────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body: CreateInvoiceRequest = await request.json();

    // ── Validate required fields ──────────────────────────────────────────

    if (!body.customer_name || typeof body.customer_name !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: customer_name' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      );
    }

    // Validate each line item
    for (let i = 0; i < body.line_items.length; i++) {
      const item = body.line_items[i];
      if (
        !item.description ||
        !item.billing_type ||
        item.quantity == null ||
        !item.unit ||
        item.unit_rate == null
      ) {
        return NextResponse.json(
          {
            error: `Line item ${i + 1} is missing required fields (description, billing_type, quantity, unit, unit_rate)`,
          },
          { status: 400 }
        );
      }
    }

    // ── Generate invoice number ───────────────────────────────────────────

    const { data: invoiceNumber, error: rpcError } = await supabaseAdmin.rpc(
      'generate_invoice_number'
    );

    if (rpcError || !invoiceNumber) {
      console.error('Error generating invoice number:', rpcError);
      return NextResponse.json(
        { error: 'Failed to generate invoice number' },
        { status: 500 }
      );
    }

    // ── Calculate financial totals ────────────────────────────────────────

    const taxRate = body.tax_rate ?? 0;
    const discountAmount = body.discount_amount ?? 0;

    const subtotal = body.line_items.reduce(
      (sum, item) => sum + item.quantity * item.unit_rate,
      0
    );

    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const totalAmount =
      Math.round((subtotal + taxAmount - discountAmount) * 100) / 100;

    // ── Calculate due date ────────────────────────────────────────────────

    const invoiceDate = body.invoice_date
      ? new Date(body.invoice_date)
      : new Date();
    const paymentTerms = body.payment_terms ?? 30;

    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    // ── Insert the invoice ────────────────────────────────────────────────

    const invoiceData = {
      invoice_number: invoiceNumber,
      customer_name: body.customer_name,
      customer_id: body.customer_id || null,
      customer_email: body.customer_email || null,
      billing_address: body.billing_address || null,
      invoice_date: invoiceDate.toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      payment_terms: paymentTerms,
      po_number: body.po_number || null,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      discount_description: body.discount_description || null,
      total_amount: totalAmount,
      amount_paid: 0,
      status: 'draft',
      notes: body.notes || null,
      internal_notes: body.internal_notes || null,
      created_by: auth.userId,
    };

    const { data: invoice, error: insertError } = await supabaseAdmin
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (insertError || !invoice) {
      console.error('Error creating invoice:', insertError);
      return NextResponse.json(
        { error: 'Failed to create invoice' },
        { status: 500 }
      );
    }

    // ── Insert line items ─────────────────────────────────────────────────

    const lineItemRows = body.line_items.map((item, index) => ({
      invoice_id: invoice.id,
      line_number: index + 1,
      description: item.description,
      billing_type: item.billing_type,
      quantity: item.quantity,
      unit: item.unit,
      unit_rate: item.unit_rate,
      // `amount` is a computed column (quantity * unit_rate) — do not insert
      job_order_id: item.job_order_id || null,
      operator_id: item.operator_id || null,
      taxable: item.taxable ?? true,
    }));

    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from('invoice_line_items')
      .insert(lineItemRows)
      .select();

    if (lineItemsError) {
      console.error('Error creating invoice line items:', lineItemsError);
      // Invoice was created but line items failed — still return invoice with warning
      return NextResponse.json(
        {
          success: true,
          warning: 'Invoice created but some line items may not have saved',
          data: { ...invoice, line_items: [] },
        },
        { status: 201 }
      );
    }

    // ── Audit log ─────────────────────────────────────────────────────────

    const ctx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'create',
      entityType: 'invoice',
      entityId: invoice.id,
      description: `Created invoice ${invoiceNumber} for ${body.customer_name} — $${totalAmount.toFixed(2)}`,
      changes: { status: { from: null, to: 'draft' } },
      metadata: {
        invoice_number: invoiceNumber,
        customer_name: body.customer_name,
        total_amount: totalAmount,
        line_item_count: body.line_items.length,
      },
      ...ctx,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Invoice created successfully',
        data: {
          ...invoice,
          line_items: lineItems || [],
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in invoices POST route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
