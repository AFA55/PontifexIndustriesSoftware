/**
 * API Route: /api/admin/job-orders/[id]/crew
 *
 * Manage crew assignments for a job order.
 * GET  — list current crew members
 * POST — add an operator to the crew
 * DELETE — remove an operator from the crew
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET — List crew members for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id: jobOrderId } = await params;

  const { data: crew, error } = await supabaseAdmin
    .from('job_crew_assignments')
    .select(`
      id,
      operator_id,
      role,
      assigned_at,
      assigned_by,
      notes,
      profiles!job_crew_assignments_operator_id_fkey (
        id,
        full_name,
        email,
        phone,
        role
      )
    `)
    .eq('job_order_id', jobOrderId)
    .is('removed_at', null)
    .order('role', { ascending: true });

  if (error) {
    console.error('Error fetching crew:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ crew: crew || [] });
}

// POST — Add operator to crew
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id: jobOrderId } = await params;
  const body = await request.json();
  const { operator_id, role = 'operator', notes } = body;

  if (!operator_id) {
    return NextResponse.json(
      { error: 'operator_id is required' },
      { status: 400 }
    );
  }

  // Validate operator exists
  const { data: operator, error: opError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('id', operator_id)
    .single();

  if (opError || !operator) {
    return NextResponse.json(
      { error: 'Operator not found' },
      { status: 404 }
    );
  }

  // Insert crew assignment (upsert to handle re-adding removed operators)
  const { data: assignment, error } = await supabaseAdmin
    .from('job_crew_assignments')
    .upsert({
      job_order_id: jobOrderId,
      operator_id,
      role,
      assigned_by: auth.userId,
      notes: notes || null,
      removed_at: null,
      assigned_at: new Date().toISOString(),
    }, {
      onConflict: 'job_order_id,operator_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding crew member:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update crew_size on job_orders
  const { data: crewCount } = await supabaseAdmin
    .from('job_crew_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('job_order_id', jobOrderId)
    .is('removed_at', null);

  await supabaseAdmin
    .from('job_orders')
    .update({ crew_size: crewCount || 1 })
    .eq('id', jobOrderId);

  // If this is the lead role, also update assigned_to for backward compatibility
  if (role === 'lead') {
    await supabaseAdmin
      .from('job_orders')
      .update({ assigned_to: operator_id })
      .eq('id', jobOrderId);
  }

  // Also set assigned_to if it's currently null (first assignment)
  const { data: job } = await supabaseAdmin
    .from('job_orders')
    .select('assigned_to')
    .eq('id', jobOrderId)
    .single();

  if (job && !job.assigned_to) {
    await supabaseAdmin
      .from('job_orders')
      .update({ assigned_to: operator_id })
      .eq('id', jobOrderId);
  }

  return NextResponse.json({
    success: true,
    message: `${operator.full_name} added to crew`,
    assignment,
  });
}

// DELETE — Remove operator from crew
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id: jobOrderId } = await params;
  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get('operator_id');

  if (!operatorId) {
    return NextResponse.json(
      { error: 'operator_id query parameter is required' },
      { status: 400 }
    );
  }

  // Soft-remove by setting removed_at
  const { error } = await supabaseAdmin
    .from('job_crew_assignments')
    .update({ removed_at: new Date().toISOString() })
    .eq('job_order_id', jobOrderId)
    .eq('operator_id', operatorId);

  if (error) {
    console.error('Error removing crew member:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update crew_size
  const { count } = await supabaseAdmin
    .from('job_crew_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('job_order_id', jobOrderId)
    .is('removed_at', null);

  await supabaseAdmin
    .from('job_orders')
    .update({ crew_size: count || 0 })
    .eq('id', jobOrderId);

  return NextResponse.json({
    success: true,
    message: 'Operator removed from crew',
  });
}
