/**
 * API Route: POST /api/access-requests/[id]/update-user
 * Update user profile (role and active status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Security: only admins can update user profiles
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { role, active } = body;

    // Validation
    if (!role || !['admin', 'operator', 'apprentice'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "admin", "operator", or "apprentice"' },
        { status: 400 }
      );
    }

    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'Active status must be a boolean' },
        { status: 400 }
      );
    }

    // Fetch the access request to get the email
    const { data: accessRequest, error: fetchError } = await supabaseAdmin
      .from('access_requests')
      .select('email, full_name')
      .eq('id', id)
      .single();

    if (fetchError || !accessRequest) {
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    // Find the user by email in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const user = existingUsers?.users.find(u => u.email === accessRequest.email);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found in authentication system' },
        { status: 404 }
      );
    }

    // Update the profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: role,
        active: active,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json(
        { error: `Failed to update user profile: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Also update the access request assigned_role
    const { error: updateRequestError } = await supabaseAdmin
      .from('access_requests')
      .update({
        assigned_role: role,
      })
      .eq('id', id);

    if (updateRequestError) {
      console.warn('Could not update access request assigned_role:', updateRequestError);
      // Non-critical error
    }

    return NextResponse.json(
      {
        success: true,
        message: `User ${accessRequest.full_name} has been updated successfully.`,
        data: {
          userId: user.id,
          email: accessRequest.email,
          role: role,
          active: active,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update-user route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
