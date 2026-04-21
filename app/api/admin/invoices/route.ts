export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/invoices
 * GET - List all invoices with filtering
 * POST - Create invoice from completed job
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Auto-mark overdue: flip any sent invoices past due_date to 'overdue' (fire-and-forget)
    const today = new Date().toISOString().split('T')[0];
    Promise.resolve(
      supabaseAdmin
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('status', 'sent')
        .lt('due_date', today)
        .gt('balance_due', 0)
    ).then(() => {}).catch(() => {});

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // draft, sent, paid, overdue, void
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabaseAdmin
      .from('invoices')
      .select('*, invoice_line_items(count)')
      .order('created_at', { ascending: false })
      .limit(limit);

    query = query.eq('tenant_id', tenantId);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error('Error fetching invoices:', error);
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    // Calculate summary stats + AR aging buckets
    const allInvoices = invoices || [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const daysOverdue = (inv: any) => {
      if (!inv.due_date) return 0;
      const due = new Date(inv.due_date);
      return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    };

    const outstanding = allInvoices.filter(i => ['sent', 'overdue'].includes(i.status) && Number(i.balance_due) > 0);

    const aging = {
      current: outstanding.filter(i => daysOverdue(i) <= 0).reduce((s, i) => s + Number(i.balance_due), 0),
      days1_30: outstanding.filter(i => daysOverdue(i) > 0 && daysOverdue(i) <= 30).reduce((s, i) => s + Number(i.balance_due), 0),
      days31_60: outstanding.filter(i => daysOverdue(i) > 30 && daysOverdue(i) <= 60).reduce((s, i) => s + Number(i.balance_due), 0),
      days61_90: outstanding.filter(i => daysOverdue(i) > 60 && daysOverdue(i) <= 90).reduce((s, i) => s + Number(i.balance_due), 0),
      days90plus: outstanding.filter(i => daysOverdue(i) > 90).reduce((s, i) => s + Number(i.balance_due), 0),
    };

    const stats = {
      total: allInvoices.length,
      draft: allInvoices.filter(i => i.status === 'draft').length,
      sent: allInvoices.filter(i => i.status === 'sent').length,
      paid: allInvoices.filter(i => i.status === 'paid').length,
      overdue: allInvoices.filter(i => i.status === 'overdue').length,
      totalOutstanding: outstanding.reduce((sum, i) => sum + Number(i.balance_due || 0), 0),
      totalPaid: allInvoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + Number(i.total_amount || 0), 0),
      aging,
    };

    return NextResponse.json({
      success: true,
      data: invoices,
      stats,
    });
  } catch (error: any) {
    console.error('Error in invoices GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { jobOrderId } = body;

    if (!jobOrderId) {
      return NextResponse.json({ error: 'jobOrderId is required' }, { status: 400 });
    }

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // Fetch the completed job with all details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobOrderId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // P0-3: Cross-tenant FK check — the fetched job must belong to caller's tenant.
    // Return 404 (not 403) to avoid leaking existence across tenants.
    if (job.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if invoice already exists for this job
    const { data: existingInvoice } = await supabaseAdmin
      .from('invoice_line_items')
      .select('invoice_id')
      .eq('job_order_id', jobOrderId)
      .limit(1)
      .single();

    if (existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice already exists for this job', invoiceId: existingInvoice.invoice_id },
        { status: 409 }
      );
    }

    // Generate unique invoice number: INV-{year}-{6 digits} with collision retry
    const year = new Date().getFullYear();
    let invoiceNumber = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const candidate = `INV-${year}-${randomNum}`;
      const { data: existing } = await supabaseAdmin
        .from('invoices')
        .select('id')
        .eq('invoice_number', candidate)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        invoiceNumber = candidate;
        break;
      }
    }
    if (!invoiceNumber) {
      // Fallback: use timestamp-based number
      invoiceNumber = `INV-${year}-${Date.now().toString().slice(-6)}`;
    }

    // Calculate due date (Net 30 by default)
    const invoiceDate = new Date();
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // Fetch work items for line item generation
    const { data: workItems } = await supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .order('day_number', { ascending: true });

    // Fetch daily logs for labor hours
    const { data: dailyLogs } = await supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .order('log_date', { ascending: true });

    // Calculate total labor hours
    const totalLabor = dailyLogs
      ? dailyLogs.reduce((sum, log) => sum + Number(log.hours_worked || 0), 0)
      : 0;

    // Use job time tracking as fallback
    let laborHours = totalLabor;
    if (laborHours === 0 && job.work_started_at && job.work_completed_at) {
      const start = new Date(job.work_started_at);
      const end = new Date(job.work_completed_at);
      laborHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }

    // Default rates by work type (admin can adjust on the invoice)
    const DEFAULT_RATES: Record<string, { rate: number; unit: string }> = {
      'Core Drilling': { rate: 150, unit: 'cores' },
      'Wall Sawing': { rate: 12, unit: 'LF' },
      'Flat Sawing': { rate: 8, unit: 'LF' },
      'Wire Sawing': { rate: 25, unit: 'LF' },
      'Hand Sawing': { rate: 10, unit: 'LF' },
      'Ring Sawing': { rate: 10, unit: 'LF' },
      'Chain Sawing': { rate: 15, unit: 'LF' },
      'GPR Scanning': { rate: 250, unit: 'each' },
      'Demolition': { rate: 175, unit: 'hours' },
      'Removal': { rate: 150, unit: 'hours' },
      'Hauling': { rate: 125, unit: 'hours' },
    };
    const DEFAULT_LABOR_RATE = 125; // $/hr

    // Build line items from work items
    const lineItems: any[] = [];
    let lineNumber = 1;
    let subtotal = 0;

    // If there's an estimated cost, use that as a flat rate line item
    if (job.estimated_cost && Number(job.estimated_cost) > 0) {
      const amount = Number(job.estimated_cost);
      lineItems.push({
        line_number: lineNumber++,
        description: `${job.title || job.job_number} — ${job.job_type || 'Concrete Cutting Services'}`,
        billing_type: 'flat_rate',
        quantity: 1,
        unit: 'job',
        unit_rate: amount,
        job_order_id: jobOrderId,
        taxable: true,
      });
      subtotal += amount;
    } else {
      // Build from work items with default rates
      if (workItems && workItems.length > 0) {
        for (const item of workItems) {
          let desc = item.work_type || 'Concrete Cutting';
          let qty = Number(item.quantity) || 1;
          let unit = 'each';
          let rate = DEFAULT_RATES[item.work_type]?.rate || 0;

          // Set quantities and units based on work type specifics
          if (item.core_quantity) {
            desc += ` (${item.core_size || ''} x ${item.core_depth_inches || ''}in)`;
            qty = Number(item.core_quantity);
            unit = 'cores';
            rate = DEFAULT_RATES['Core Drilling']?.rate || 150;
          } else if (item.linear_feet_cut) {
            desc += ` (${item.cut_depth_inches || ''}in deep)`;
            qty = Number(item.linear_feet_cut);
            unit = 'LF';
            if (!rate) rate = 10; // Default LF rate if type not found
          }

          const amount = qty * rate;
          lineItems.push({
            line_number: lineNumber++,
            description: desc,
            billing_type: 'labor',
            quantity: qty,
            unit: unit,
            unit_rate: rate,
            job_order_id: jobOrderId,
            operator_id: item.operator_id,
            taxable: true,
          });
          subtotal += amount;
        }
      }

      // Add labor hours line item
      if (laborHours > 0) {
        const laborAmount = Number(laborHours.toFixed(2)) * DEFAULT_LABOR_RATE;
        lineItems.push({
          line_number: lineNumber++,
          description: `Labor — ${laborHours.toFixed(1)} hours on-site`,
          billing_type: 'labor',
          quantity: Number(laborHours.toFixed(2)),
          unit: 'hours',
          unit_rate: DEFAULT_LABOR_RATE,
          job_order_id: jobOrderId,
          taxable: true,
        });
        subtotal += laborAmount;
      }

      // If no work items and no labor, add a generic line item from job type
      if (lineItems.length === 0) {
        lineItems.push({
          line_number: lineNumber++,
          description: `${job.job_type || 'Concrete Cutting Services'} — ${job.job_number}`,
          billing_type: 'flat_rate',
          quantity: 1,
          unit: 'job',
          unit_rate: 0,
          job_order_id: jobOrderId,
          taxable: true,
        });
      }
    }

    const tenantIdForInsert = callerTenantId;

    // Create the invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        customer_name: job.customer_name || 'Unknown Customer',
        customer_email: job.customer_contact || null,
        billing_address: job.address || null,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        subtotal: subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: subtotal,
        amount_paid: 0,
        status: 'draft',
        payment_terms: 30,
        po_number: job.po_number || null,
        notes: `Job: ${job.job_number}\nLocation: ${job.location || job.address || 'N/A'}`,
        created_by: auth.userId,
        tenant_id: tenantIdForInsert || null,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    // Insert line items
    if (lineItems.length > 0) {
      const itemsWithInvoiceId = lineItems.map(item => ({
        ...item,
        invoice_id: invoice.id,
      }));

      const { error: lineError } = await supabaseAdmin
        .from('invoice_line_items')
        .insert(itemsWithInvoiceId);

      if (lineError) {
        console.error('Error creating line items:', lineError);
        // Invoice was created but line items failed - don't fail the whole request
      }
    }

    return NextResponse.json({
      success: true,
      data: invoice,
      lineItemsCount: lineItems.length,
      message: `Invoice ${invoiceNumber} created as draft`,
    });
  } catch (error: any) {
    console.error('Error in invoices POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
