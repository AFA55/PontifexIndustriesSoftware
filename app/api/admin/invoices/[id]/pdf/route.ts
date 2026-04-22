export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/invoices/[id]/pdf
 * Generate and return Invoice PDF
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { renderToBuffer } from '@react-pdf/renderer';
import InvoicePDF from '@/components/pdf/InvoicePDF';
import type { InvoicePDFData } from '@/components/pdf/InvoicePDF';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;

    // Fetch invoice
    let invoiceQuery = supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id);
    if (tenantId) { invoiceQuery = invoiceQuery.eq('tenant_id', tenantId); }
    const { data: invoice, error } = await invoiceQuery.single();

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Fetch line items
    const { data: lineItems } = await supabaseAdmin
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true });

    // Fetch related job order for extra details
    let jobData: any = null;
    if (lineItems && lineItems.length > 0) {
      const jobOrderId = lineItems.find((li: any) => li.job_order_id)?.job_order_id;
      if (jobOrderId) {
        const { data: job } = await supabaseAdmin
          .from('job_orders')
          .select('job_number, title, location, address, salesman_name, work_completed_at, po_number')
          .eq('id', jobOrderId)
          .single();
        jobData = job;
      }
    }

    // Fetch branding
    let branding: Record<string, any> = {};
    try {
      let brandingQuery = supabaseAdmin
        .from('tenant_branding')
        .select('company_name, company_address, support_phone, support_email, pdf_footer_text, pdf_show_logo, primary_color, logo_url')
        .eq('is_active', true);
      if (tenantId) { brandingQuery = brandingQuery.eq('tenant_id', tenantId); }
      const { data: brandingRow } = await brandingQuery.limit(1).single();

      if (brandingRow) {
        branding = {
          company_name: brandingRow.company_name,
          company_address: brandingRow.company_address || '',
          company_phone: brandingRow.support_phone || '',
          pdf_footer_text: brandingRow.pdf_footer_text,
          pdf_show_logo: brandingRow.pdf_show_logo,
          primary_color: brandingRow.primary_color,
          logo_url: brandingRow.logo_url,
        };
      }
    } catch {
      // Use defaults if branding fetch fails
    }

    // Map line items to PDF format
    const pdfLineItems = (lineItems || []).map((li: any) => ({
      description: li.description || '',
      quantity: Number(li.quantity) || 1,
      rate: Number(li.unit_rate) || 0,
      amount: Number(li.amount) || 0,
    }));

    // Build PDF data
    const pdfData: InvoicePDFData = {
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date || '',
      po_number: invoice.po_number || jobData?.po_number || '',
      job_number: jobData?.job_number || '',
      job_name: jobData?.title || '',
      job_location: jobData?.location || jobData?.address || '',
      work_completed_date: jobData?.work_completed_at
        ? jobData.work_completed_at.split('T')[0]
        : '',
      sales_person: jobData?.salesman_name || '',
      customer_name: invoice.customer_name,
      customer_address: invoice.billing_address || '',
      customer_contact: '',
      customer_phone: '',
      customer_email: invoice.customer_email || '',
      line_items: pdfLineItems,
      subtotal: Number(invoice.subtotal) || 0,
      tax_rate: Number(invoice.tax_rate) || 0,
      tax_amount: Number(invoice.tax_amount) || 0,
      total: Number(invoice.total_amount) || 0,
      notes: invoice.notes || '',
      payment_terms: invoice.payment_terms ? `Net ${invoice.payment_terms}` : 'Net 30',
    };

    // Generate PDF
    const pdfElement = InvoicePDF({ invoice: pdfData, branding: branding as any });
    const pdfBuffer = await renderToBuffer(pdfElement as any);

    // Return as PDF (convert Buffer to Uint8Array for NextResponse compatibility)
    const uint8 = new Uint8Array(pdfBuffer);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error: any) {
    console.error('Error generating invoice PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
