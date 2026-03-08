/**
 * API Route: POST /api/admin/schedule-form
 * Create a job order via the 8-step Schedule Form wizard (admin only)
 *
 * Maps all 8 steps into the job_orders table:
 *   Step 1: Request Info → salesman_name, po_number, date_submitted
 *   Step 2: Customer & Location → customer_name, customer_contact, site_contact_phone, address, location
 *   Step 3: Scope of Work → description, job_type, estimated_cost
 *   Step 4: Equipment → equipment_needed, special_equipment_notes, equipment_rentals
 *   Step 5: Scheduling → scheduled_date, end_date, scheduling_flexibility (JSONB)
 *   Step 6: Site Compliance → site_compliance (JSONB)
 *   Step 7: Difficulty & Notes → job_difficulty_rating, additional_info
 *   Step 8: Jobsite Conditions → jobsite_conditions (JSONB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can create schedule forms' }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.customer_name?.trim()) {
      return NextResponse.json({ error: 'Contractor/Customer name is required' }, { status: 400 });
    }
    if (!body.job_type?.trim()) {
      return NextResponse.json({ error: 'At least one service type is required' }, { status: 400 });
    }
    if (!body.scheduled_date) {
      return NextResponse.json({ error: 'Start date is required' }, { status: 400 });
    }

    // Auto-generate job number
    const jobNumber = `JOB-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Build job order data from all 8 steps
    const jobOrderData: Record<string, any> = {
      // ── Auto-generated ──────────────────────────────────────
      job_number: jobNumber,
      title: `${body.customer_name} - ${body.job_type?.split(',')[0]?.trim() || 'Job'}`,
      status: 'scheduled',
      priority: 'medium',
      created_by: user.id,
      created_via: 'schedule_form',

      // ── Step 1: Request Information ─────────────────────────
      salesman_name: body.submitted_by || null,
      po_number: body.po_number || null,
      date_submitted: body.date_submitted || new Date().toISOString().split('T')[0],

      // ── Step 2: Customer & Job Location ─────────────────────
      customer_name: body.customer_name.trim(),
      customer_contact: body.site_contact || null,
      site_contact_phone: body.contact_phone || null,
      foreman_phone: body.contact_phone || null,  // backward compat
      address: body.address || null,
      location: body.location_name || body.address || null,

      // ── Step 3: Scope of Work ───────────────────────────────
      description: body.description || null,
      job_type: body.job_type,
      estimated_cost: body.estimated_cost || null,

      // ── Step 4: Equipment Requirements ──────────────────────
      equipment_needed: body.equipment_needed || [],
      special_equipment: body.special_equipment ? [body.special_equipment] : [],  // legacy array format
      special_equipment_notes: body.special_equipment || null,  // clean text format
      equipment_rentals: body.equipment_rentals || [],

      // ── Step 5: Scheduling Details ──────────────────────────
      scheduled_date: body.scheduled_date,
      end_date: body.end_date || null,
      scheduling_flexibility: body.scheduling_flexibility || {},

      // ── Step 6: Site Access & Compliance ─────────────────────
      site_compliance: body.site_compliance || {},

      // ── Step 7: Job Difficulty & Notes ──────────────────────
      job_difficulty_rating: body.difficulty_rating || null,
      additional_info: body.additional_notes || null,

      // ── Step 8: Jobsite Conditions ──────────────────────────
      jobsite_conditions: body.jobsite_conditions || {},
    };

    // Insert job order
    const { data: jobOrder, error: insertError } = await supabaseAdmin
      .from('job_orders')
      .insert(jobOrderData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating schedule form job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create job order', details: insertError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Schedule Form job created: ${jobNumber} by ${profile.full_name}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Job created successfully from Schedule Form',
        data: jobOrder,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in schedule form route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
