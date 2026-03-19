/**
 * API Route: GET /api/job-orders/[id]/dispatch-pdf
 * Generate a printable dispatch ticket PDF for a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import DispatchTicketPDF from '@/components/pdf/DispatchTicketPDF';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Auth check
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify role (admins, operators, and salesmen can print dispatch tickets)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    const allowedRoles = ['admin', 'super_admin', 'operations_manager', 'salesman', 'operator'];
    if (!profile || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Not authorized to print dispatch tickets' }, { status: 403 });
    }

    // Fetch full job data
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch operator and helper names
    let operatorName = '';
    let helperName = '';

    if (job.assigned_to) {
      const { data: opProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.assigned_to)
        .single();
      operatorName = opProfile?.full_name || '';
    }

    if (job.helper_assigned_to) {
      const { data: helpProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.helper_assigned_to)
        .single();
      helperName = helpProfile?.full_name || '';
    }

    // Fetch branding for PDF
    let pdfBranding: Record<string, unknown> = {};
    try {
      const { data: brandingRow } = await supabaseAdmin
        .from('tenant_branding')
        .select('company_name, support_phone, support_email, company_address, company_city, company_state, company_zip, pdf_header_text, pdf_footer_text, pdf_show_logo, primary_color, logo_url')
        .limit(1)
        .single();
      if (brandingRow) {
        const addr = [brandingRow.company_address, brandingRow.company_city, brandingRow.company_state, brandingRow.company_zip].filter(Boolean).join(', ');
        pdfBranding = {
          company_name: brandingRow.company_name,
          company_address: addr || undefined,
          company_phone: brandingRow.support_phone ? `Phone: ${brandingRow.support_phone}` : undefined,
          logo_url: brandingRow.logo_url,
          pdf_header_text: brandingRow.pdf_header_text,
          pdf_footer_text: brandingRow.pdf_footer_text,
          pdf_show_logo: brandingRow.pdf_show_logo,
          primary_color: brandingRow.primary_color,
        };
      }
    } catch {
      // Use defaults if branding fetch fails
    }

    // Build the PDF data
    const pdfData = {
      job_number: job.job_number,
      title: job.title,
      customer_name: job.customer_name,
      customer_contact: job.customer_contact,
      site_contact_phone: job.site_contact_phone || job.foreman_phone,
      foreman_phone: job.foreman_phone,
      address: job.address,
      location: job.location,
      job_type: job.job_type,
      description: job.description,
      scheduled_date: job.scheduled_date,
      end_date: job.end_date,
      arrival_time: job.arrival_time,
      estimated_cost: job.estimated_cost ? Number(job.estimated_cost) : undefined,
      estimated_hours: job.estimated_hours ? Number(job.estimated_hours) : undefined,
      po_number: job.po_number,
      salesman_name: job.salesman_name,
      operator_name: operatorName,
      helper_name: helperName,
      equipment_needed: job.equipment_needed || [],
      equipment_rentals: job.equipment_rentals || [],
      scope_details: job.scope_details || {},
      site_compliance: job.site_compliance || {},
      jobsite_conditions: job.jobsite_conditions || {},
      additional_info: job.additional_info,
      job_difficulty_rating: job.job_difficulty_rating ? Number(job.job_difficulty_rating) : undefined,
      permit_required: job.permit_required || false,
      permits: job.permits || [],
      is_multi_day: job.is_multi_day || false,
      total_days_worked: job.total_days_worked || 0,
      scheduling_flexibility: job.scheduling_flexibility || {},
    };

    // Render PDF to buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      React.createElement(DispatchTicketPDF, { job: pdfData, branding: pdfBranding }) as any
    );

    // Return PDF response
    const uint8 = new Uint8Array(buffer);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="dispatch-${job.job_number}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating dispatch PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate dispatch ticket PDF', details: error.message },
      { status: 500 }
    );
  }
}
