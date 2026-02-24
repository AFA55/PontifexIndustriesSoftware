/**
 * API Route: GET /api/admin/operator-profiles/[id]
 * Get a single operator profile with detailed analytics
 *
 * API Route: PATCH /api/admin/operator-profiles/[id]
 * Update an operator profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify admin access
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get operator profile
    const { data: operator, error: operatorError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (operatorError || !operator) {
      return NextResponse.json(
        { error: 'Operator not found' },
        { status: 404 }
      );
    }

    // Get performance data — gracefully handle missing table
    let performance = null;
    const { data: perfData, error: perfError } = await supabaseAdmin
      .from('operator_performance')
      .select('*')
      .eq('operator_id', id)
      .single();

    if (!perfError) {
      performance = perfData;
    }
    // If table doesn't exist, performance stays null

    return NextResponse.json(
      {
        success: true,
        data: {
          ...operator,
          performance: performance || null
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in get operator profile route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify admin access
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Parse request body
    const updates = await request.json();
    console.log(`Updating operator profile ${id} with:`, updates);

    // Validate and sanitize updates
    const allowedFields = [
      'hourly_rate',
      'skill_level',
      'skill_levels',
      'tasks_qualified_for',
      'equipment_qualified_for',
      'certifications',
      'certification_documents',
      'years_experience',
      'hire_date',
      'notes',
      'phone',
      'full_name',
      'phone_number',
      'email'
    ];

    const sanitizedUpdates: any = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    sanitizedUpdates.updated_at = new Date().toISOString();

    // Update operator profile
    const { data: updatedOperator, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(sanitizedUpdates)
      .eq('id', id)
      .select()
      .single();

    console.log('Update result:', { updatedOperator, updateError });

    if (updateError) {
      console.error('Error updating operator profile:', updateError);
      return NextResponse.json(
        { error: 'Failed to update operator profile' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Operator profile updated successfully',
        data: updatedOperator,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update operator profile route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
