export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/job-orders/[id]/forms
 * List and assign form templates to a job (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // P0-3: Verify the job belongs to caller's tenant
    {
      const { data: jobCheck } = await supabaseAdmin
        .from('job_orders')
        .select('id')
        .eq('id', id)
        .eq('tenant_id', callerTenantId)
        .maybeSingle();
      if (!jobCheck) {
        return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('job_form_assignments')
      .select('*, form_templates(*)')
      .eq('job_order_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching form assignments:', error);
      return NextResponse.json({ error: 'Failed to fetch form assignments' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in job forms GET:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { form_template_id, assigned_to_contact, assigned_phone } = body;

    if (!form_template_id) {
      return NextResponse.json({ error: 'form_template_id is required' }, { status: 400 });
    }

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // P0-3: Verify template exists and belongs to caller's tenant
    const { data: template, error: templateError } = await supabaseAdmin
      .from('form_templates')
      .select('id, name, tenant_id')
      .eq('id', form_template_id)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Form template not found or inactive' }, { status: 404 });
    }
    if (template.tenant_id && template.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Form template not found or inactive' }, { status: 404 });
    }

    // P0-3: Verify job exists and belongs to caller's tenant
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }
    if (job.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('job_form_assignments')
      .insert({
        job_order_id: id,
        form_template_id,
        assigned_to_contact: assigned_to_contact || null,
        assigned_phone: assigned_phone || null,
        status: 'pending',
      })
      .select('*, form_templates(*)')
      .single();

    if (error) {
      console.error('Error creating form assignment:', error);
      return NextResponse.json({ error: 'Failed to assign form to job' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in job forms POST:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
