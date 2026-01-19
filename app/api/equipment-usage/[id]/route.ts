/**
 * API Route: Equipment Usage by ID
 *
 * PATCH /api/equipment-usage/[id] - Update equipment usage entry
 * DELETE /api/equipment-usage/[id] - Delete equipment usage entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Check if user owns this equipment usage entry or is admin
    const { data: existingEntry } = await supabaseAdmin
      .from('equipment_usage')
      .select('operator_id')
      .eq('id', id)
      .single();

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Equipment usage entry not found' },
        { status: 404 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (existingEntry.operator_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'You can only update your own equipment usage entries' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    console.log('Updating equipment usage:', id, body);

    // Validate and sanitize updates
    const allowedFields = [
      'equipment_type',
      'equipment_id',
      'linear_feet_cut',
      'task_type',
      'difficulty_level',
      'difficulty_notes',
      'blade_type',
      'blades_used',
      'blade_wear_notes',
      'hydraulic_hose_used_ft',
      'water_hose_used_ft',
      'power_hours',
      'location_changes',
      'setup_time_minutes',
      'notes'
    ];

    const sanitizedUpdates: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sanitizedUpdates[field] = body[field];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update equipment usage entry
    const { data: updatedEntry, error: updateError } = await supabaseAdmin
      .from('equipment_usage')
      .update(sanitizedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating equipment usage:', updateError);
      return NextResponse.json(
        { error: 'Failed to update equipment usage', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Equipment usage updated successfully',
        data: updatedEntry,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in equipment usage update:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Check if user owns this equipment usage entry or is admin
    const { data: existingEntry } = await supabaseAdmin
      .from('equipment_usage')
      .select('operator_id')
      .eq('id', id)
      .single();

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Equipment usage entry not found' },
        { status: 404 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (existingEntry.operator_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'You can only delete your own equipment usage entries' },
        { status: 403 }
      );
    }

    // Delete equipment usage entry
    const { error: deleteError } = await supabaseAdmin
      .from('equipment_usage')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting equipment usage:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete equipment usage', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Equipment usage deleted successfully',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in equipment usage deletion:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
