/**
 * API Route: GET/POST /api/workflow
 * Track and retrieve operator workflow progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

// Workflow step definitions
const WORKFLOW_STEPS = [
  { id: 'equipment_checklist', name: 'Equipment Checklist', order: 1 },
  { id: 'in_route', name: 'In Route', order: 2 },
  { id: 'silica_form', name: 'Silica Exposure Form', order: 3 },
  { id: 'work_performed', name: 'Work Performed', order: 4 },
  { id: 'pictures', name: 'Submit Pictures', order: 5 },
  { id: 'customer_signature', name: 'Customer Signature', order: 6 },
  { id: 'job_complete', name: 'Job Complete', order: 7 },
];

// GET: Retrieve workflow progress
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    // Get workflow progress
    const { data: workflow, error } = await supabaseAdmin
      .from('workflow_steps')
      .select('*')
      .eq('job_order_id', jobId)
      .eq('operator_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      // Workflow table may not exist yet — never return 500
      console.log('Workflow fetch skipped (table may not exist):', error.message || error.code || 'unknown error');
      return NextResponse.json({ success: true, data: null, message: 'Workflow tracking unavailable' }, { status: 200 });
    }

    // If no workflow exists, create initial one
    if (!workflow) {
      const { data: newWorkflow, error: createError } = await supabaseAdmin
        .from('workflow_steps')
        .insert({
          job_order_id: jobId,
          operator_id: user.id,
          current_step: 'equipment_checklist',
          equipment_checklist_completed: false,
          sms_sent: false,
          silica_form_completed: false,
          work_performed_completed: false,
          pictures_submitted: false,
          customer_signature_received: false,
        })
        .select()
        .single();

      if (createError) {
        // Workflow table may not exist yet — never return 500
        console.log('Workflow create skipped (table may not exist):', createError.message || createError.code || 'unknown error');
        return NextResponse.json({ success: true, data: null, message: 'Workflow tracking unavailable' }, { status: 200 });
      }

      return NextResponse.json({ success: true, data: newWorkflow }, { status: 200 });
    }

    return NextResponse.json({ success: true, data: workflow }, { status: 200 });
  } catch (error: any) {
    // Workflow is optional — return null data instead of 500
    console.log('Workflow GET error (non-blocking):', error.message || 'unknown');
    return NextResponse.json({ success: true, data: null, message: 'Workflow tracking unavailable' }, { status: 200 });
  }
}

// POST: Update workflow progress
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { jobId, currentStep, completedStep } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    // Build update data
    const updateData: any = {};

    if (currentStep) {
      updateData.current_step = currentStep;
    }

    if (completedStep) {
      // Mark the completed step
      switch (completedStep) {
        case 'work_order_agreement':
          updateData.work_order_signed = true;
          break;
        case 'equipment_checklist':
          updateData.equipment_checklist_completed = true;
          break;
        case 'in_route':
          updateData.sms_sent = true;
          break;
        case 'liability_release':
          updateData.liability_release_signed = true;
          break;
        case 'silica_form':
          updateData.silica_form_completed = true;
          break;
        case 'work_performed':
          updateData.work_performed_completed = true;
          break;
        case 'pictures':
          updateData.pictures_submitted = true;
          break;
        case 'customer_signature':
          updateData.customer_signature_received = true;
          break;
        case 'job_complete':
          updateData.job_completed = true;
          break;
      }
    }

    updateData.updated_at = new Date().toISOString();

    // Upsert workflow
    const { data: workflow, error } = await supabaseAdmin
      .from('workflow_steps')
      .upsert({
        job_order_id: jobId,
        operator_id: user.id,
        ...updateData,
      }, {
        onConflict: 'job_order_id,operator_id'
      })
      .select()
      .single();

    if (error) {
      // Workflow tracking is optional — never return 500 for this
      // The workflow_steps table may not exist yet in the database
      console.log('Workflow update skipped (table may not exist):', error.message || error.code || 'unknown error');
      return NextResponse.json({ success: true, data: null, message: 'Workflow tracking unavailable' }, { status: 200 });
    }

    return NextResponse.json({ success: true, data: workflow }, { status: 200 });
  } catch (error: any) {
    // Workflow tracking is optional — never return 500
    console.log('Workflow POST error (non-blocking):', error.message || 'unknown');
    return NextResponse.json({ success: true, data: null, message: 'Workflow tracking unavailable' }, { status: 200 });
  }
}
