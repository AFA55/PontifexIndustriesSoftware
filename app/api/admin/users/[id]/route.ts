/**
 * API Route: PATCH /api/admin/users/[id]
 * Update a user (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get user from Supabase session (server-side)
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

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can update users' },
        { status: 403 }
      );
    }

    // Parse request body
    const updates = await request.json();
    console.log(`Updating user ${id} with:`, updates);

    // Validate and sanitize updates
    const allowedFields = ['active', 'role'];
    const sanitizedUpdates: any = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    sanitizedUpdates.updated_at = new Date().toISOString();

    // Resolve tenant scope
    const tenantId = await getTenantId(user.id);

    // Update user (scoped to tenant)
    let updateQuery = supabaseAdmin
      .from('profiles')
      .update(sanitizedUpdates)
      .eq('id', id);
    if (tenantId) {
      updateQuery = updateQuery.eq('tenant_id', tenantId);
    }
    const { data: updatedUser, error: updateError } = await updateQuery
      .select()
      .single();

    console.log('Update result:', { updatedUser, updateError });

    if (updateError) {
      console.error('Error updating user:', updateError);
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'User updated successfully',
        data: updatedUser,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update user route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
