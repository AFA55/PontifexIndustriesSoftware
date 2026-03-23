import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager', 'supervisor'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check authorization: must be assigned to job or admin
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('assigned_to, helper_assigned_to, photo_urls')
      .eq('id', jobId)
      .single();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAssigned = job.assigned_to === user.id || job.helper_assigned_to === user.id;
    const isAdmin = ADMIN_ROLES.includes(profile?.role || '');
    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: 'You are not authorized to upload photos for this job' }, { status: 403 });
    }

    const body = await request.json();
    const { photo_urls } = body;

    if (!photo_urls || !Array.isArray(photo_urls)) {
      return NextResponse.json({ error: 'photo_urls array required' }, { status: 400 });
    }

    // Atomic append using SQL to avoid race condition
    const existing = job.photo_urls || [];
    const merged = [...existing, ...photo_urls];

    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({ photo_urls: merged, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (updateError) {
      console.error('Error saving photos:', updateError);
      return NextResponse.json({ error: 'Failed to save photos' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { photo_urls: merged } });
  } catch (error) {
    console.error('Error in photos API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check authorization: must be assigned to job or admin
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('assigned_to, helper_assigned_to, photo_urls')
      .eq('id', jobId)
      .single();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAssigned = job.assigned_to === user.id || job.helper_assigned_to === user.id;
    const isAdmin = ADMIN_ROLES.includes(profile?.role || '');
    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: 'You are not authorized to view photos for this job' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: { photo_urls: job.photo_urls || [] } });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
