export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/invoices/preview
 * POST - Preview line items + computed subtotal that WOULD be inserted
 *        if /api/admin/invoices were called with the same jobOrderId.
 *
 * Mirrors the line-item builder block in /api/admin/invoices POST so the
 * "Review & Confirm" UI can show the user exactly what will be created
 * before they commit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { jobOrderId } = body;

    if (!jobOrderId) {
      return NextResponse.json({ error: 'jobOrderId is required' }, { status: 400 });
    }

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
        { status: 400 }
      );
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

    // P0-3: Cross-tenant FK check — job must belong to caller's tenant.
    if (job.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Salesman scoping: a salesman should only preview invoices for jobs
    // they themselves created.
    if (auth.role === 'salesman' && job.created_by && job.created_by !== auth.userId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Existing invoice check (mirror parent route shape)
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

    // Calculate due date (Net 30 by default)
    const invoiceDate = new Date();
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // Fetch work items
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

    const totalLabor = dailyLogs
      ? dailyLogs.reduce((sum, log) => sum + Number(log.hours_worked || 0), 0)
      : 0;

    let laborHours = totalLabor;
    if (laborHours === 0 && job.work_started_at && job.work_completed_at) {
      const start = new Date(job.work_started_at);
      const end = new Date(job.work_completed_at);
      laborHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }

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
    const DEFAULT_LABOR_RATE = 125;

    const lineItems: any[] = [];
    let lineNumber = 1;
    let subtotal = 0;

    const billingType = job.billing_type as string | null | undefined;

    if (billingType === 'fixed') {
      const amount = Number(job.estimated_cost) || 0;
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
    } else if (billingType === 'time_and_material') {
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
    } else if (billingType === 'cycle') {
      const amount = Number(job.estimated_cost) || 0;
      lineItems.push({
        line_number: lineNumber++,
        description: `${job.title || job.job_number} — Milestone Payment`,
        billing_type: 'flat_rate',
        quantity: 1,
        unit: 'job',
        unit_rate: amount,
        job_order_id: jobOrderId,
        taxable: true,
      });
      subtotal += amount;
    } else {
      if (workItems && workItems.length > 0) {
        for (const item of workItems) {
          let desc = item.work_type || 'Concrete Cutting';
          let qty = Number(item.quantity) || 1;
          let unit = 'each';
          let rate = DEFAULT_RATES[item.work_type]?.rate || 0;

          if (item.core_quantity) {
            desc += ` (${item.core_size || ''} x ${item.core_depth_inches || ''}in)`;
            qty = Number(item.core_quantity);
            unit = 'cores';
            rate = DEFAULT_RATES['Core Drilling']?.rate || 150;
          } else if (item.linear_feet_cut) {
            desc += ` (${item.cut_depth_inches || ''}in deep)`;
            qty = Number(item.linear_feet_cut);
            unit = 'LF';
            if (!rate) rate = 10;
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

    // Resolve operator name. Prefer job_orders.assigned_to; fall back to the
    // most-recent work_item.operator_id or work_item.created_by.
    let operatorName = 'Operator';
    let operatorUserId: string | null = job.assigned_to || null;

    if (!operatorUserId && workItems && workItems.length > 0) {
      const fromWorkItem = workItems.find(w => w.operator_id) || workItems.find(w => w.created_by);
      operatorUserId = fromWorkItem?.operator_id || fromWorkItem?.created_by || null;
    }

    if (operatorUserId) {
      try {
        const { data: opProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', operatorUserId)
          .single();
        if (opProfile?.full_name) operatorName = opProfile.full_name;
      } catch {
        // best-effort; leave as default
      }
    }

    // Build "work_performed_summary" — multi-line bullet string from work_items.
    const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
    let workPerformedSummary = '';
    if (workItems && workItems.length > 0) {
      const lines: string[] = [];
      for (const item of workItems) {
        const wt = item.work_type || 'Work';
        let line = '';
        if (item.core_quantity) {
          const size = item.core_size ? `${item.core_size}` : '';
          const depth = item.core_depth_inches ? `${item.core_depth_inches}in` : '';
          const dims = [size, depth].filter(Boolean).join(' × ');
          line = `- ${wt} — ${item.core_quantity} cores${dims ? ` @ ${dims}` : ''}`;
        } else if (item.linear_feet_cut) {
          const depth = item.cut_depth_inches ? ` @ ${item.cut_depth_inches}in deep` : '';
          line = `- ${wt} — ${item.linear_feet_cut} LF${depth}`;
        } else {
          const qty = item.quantity ? `${item.quantity}` : '';
          line = `- ${wt}${qty ? ` — ${qty}` : ''}`;
        }
        line = truncate(line, 120);
        if (item.notes && String(item.notes).trim()) {
          const notesTrim = truncate(String(item.notes).trim().replace(/\s+/g, ' '), 120);
          line += `\n  ${notesTrim}`;
        }
        lines.push(line);
      }
      workPerformedSummary = lines.join('\n');
    } else {
      workPerformedSummary = String(
        job.scope_of_work || job.description || ''
      ).trim();
    }

    return NextResponse.json({
      success: true,
      data: {
        job: {
          id: job.id,
          job_number: job.job_number,
          customer_name: job.customer_name,
          address: job.address,
          location: job.location,
          billing_type: job.billing_type,
          scope_of_work: job.scope_of_work || null,
          description: job.description || null,
          title: job.title || null,
          job_type: job.job_type || null,
          po_number: job.po_number || null,
          estimated_cost: job.estimated_cost ?? null,
        },
        operator_name: operatorName,
        work_performed_summary: workPerformedSummary,
        line_items: lineItems,
        subtotal,
        default_due_date: dueDate.toISOString().split('T')[0],
        default_po_number: job.po_number || null,
        default_notes: `Job: ${job.job_number}\nLocation: ${job.location || job.address || 'N/A'}`,
      },
    });
  } catch (error: any) {
    console.error('Error in invoices preview POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
