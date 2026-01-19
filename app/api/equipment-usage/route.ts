/**
 * API Route: Equipment Usage
 *
 * POST /api/equipment-usage - Create new equipment usage entry
 * GET /api/equipment-usage - Get equipment usage (with filters)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    console.log('Creating equipment usage:', body);

    // Validate required fields
    const {
      job_order_id,
      equipment_type,
      task_type,
      linear_feet_cut,
      difficulty_level,
      equipment_id,
      difficulty_notes,
      blade_type,
      blades_used,
      blade_wear_notes,
      hydraulic_hose_used_ft,
      water_hose_used_ft,
      power_hours,
      location_changes,
      setup_time_minutes,
      notes
    } = body;

    if (!job_order_id || !equipment_type || !task_type) {
      return NextResponse.json(
        { error: 'Missing required fields: job_order_id, equipment_type, task_type' },
        { status: 400 }
      );
    }

    // Create equipment usage entry
    const { data: equipmentUsage, error: insertError } = await supabaseAdmin
      .from('equipment_usage')
      .insert({
        job_order_id,
        operator_id: user.id,
        equipment_type,
        equipment_id,
        linear_feet_cut: linear_feet_cut || 0,
        task_type,
        difficulty_level: difficulty_level || 'medium',
        difficulty_notes,
        blade_type,
        blades_used: blades_used || 0,
        blade_wear_notes,
        hydraulic_hose_used_ft: hydraulic_hose_used_ft || 0,
        water_hose_used_ft: water_hose_used_ft || 0,
        power_hours: power_hours || 0,
        location_changes: location_changes || 0,
        setup_time_minutes: setup_time_minutes || 0,
        notes
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating equipment usage:', insertError);
      return NextResponse.json(
        { error: 'Failed to create equipment usage', details: insertError.message },
        { status: 500 }
      );
    }

    // Update equipment totalUsage if equipment_id is provided and linear_feet_cut > 0
    if (equipment_id && linear_feet_cut && linear_feet_cut > 0) {
      const { data: currentEquipment, error: fetchError } = await supabaseAdmin
        .from('equipment')
        .select('total_usage')
        .eq('id', equipment_id)
        .single();

      if (!fetchError && currentEquipment) {
        const newTotalUsage = (currentEquipment.total_usage || 0) + linear_feet_cut;

        const { error: updateError } = await supabaseAdmin
          .from('equipment')
          .update({ total_usage: newTotalUsage })
          .eq('id', equipment_id);

        if (updateError) {
          console.error('Error updating equipment total_usage:', updateError);
          // Don't fail the request if usage update fails, just log it
        } else {
          console.log(`Updated equipment ${equipment_id} total_usage to ${newTotalUsage} ft`);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Equipment usage recorded successfully',
        data: equipmentUsage,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in equipment usage creation:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const jobOrderId = searchParams.get('job_order_id');
    const operatorId = searchParams.get('operator_id');
    const equipmentType = searchParams.get('equipment_type');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Build query
    let query = supabaseAdmin
      .from('equipment_usage')
      .select(`
        *,
        job_order:job_orders(
          job_number,
          customer_name,
          project_name
        ),
        operator:profiles(
          full_name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (jobOrderId) {
      query = query.eq('job_order_id', jobOrderId);
    }

    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    } else if (profile?.role !== 'admin') {
      // Non-admins can only see their own data
      query = query.eq('operator_id', user.id);
    }

    if (equipmentType) {
      query = query.eq('equipment_type', equipmentType);
    }

    const { data: equipmentUsage, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching equipment usage:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch equipment usage', details: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: equipmentUsage || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in equipment usage fetch:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
