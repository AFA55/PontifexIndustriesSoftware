/**
 * API Route: POST /api/job-orders/[id]/request-signature
 * Generate a unique signature request link for a job
 * requireAuth() — any authenticated user can request a signature
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import crypto from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Get all signature requests for this job
    const { data, error } = await supabaseAdmin
      .from('signature_requests')
      .select('*')
      .eq('job_order_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching signature requests:', error);
      return NextResponse.json({ error: 'Failed to fetch signature requests' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in signature request GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { contact_name, contact_phone, contact_email, request_type, form_template_id } = body;

    if (!request_type || !['utility_waiver', 'completion', 'custom'].includes(request_type)) {
      return NextResponse.json({ error: 'Valid request_type is required (utility_waiver, completion, custom)' }, { status: 400 });
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    // Generate unique token
    const token = crypto.randomUUID();

    const { data, error } = await supabaseAdmin
      .from('signature_requests')
      .insert({
        job_order_id: id,
        token,
        contact_name: contact_name || null,
        contact_phone: contact_phone || null,
        contact_email: contact_email || null,
        request_type,
        form_template_id: form_template_id || null,
        status: 'pending',
        sent_at: new Date().toISOString(),
        created_by: auth.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating signature request:', error);
      return NextResponse.json({ error: 'Failed to create signature request' }, { status: 500 });
    }

    // Build the public signing URL
    const baseUrl = request.headers.get('x-forwarded-host')
      ? `https://${request.headers.get('x-forwarded-host')}`
      : request.headers.get('origin') || 'http://localhost:3000';

    const signUrl = `${baseUrl}/sign/${token}`;

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        sign_url: signUrl,
      },
    });
  } catch (error: any) {
    console.error('Error in signature request POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
