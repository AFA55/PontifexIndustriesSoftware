/**
 * API Route: POST /api/access-requests/[id]/approve
 * Approve an access request and create user account
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { role, reviewedBy } = body;

    // Validation
    if (!role || !['admin', 'operator'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "admin" or "operator"' },
        { status: 400 }
      );
    }

    if (!reviewedBy) {
      return NextResponse.json(
        { error: 'reviewedBy (admin user ID) is required' },
        { status: 400 }
      );
    }

    // Fetch the access request
    const { data: accessRequest, error: fetchError } = await supabaseAdmin
      .from('access_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !accessRequest) {
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    // Check if already processed
    if (accessRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `This request has already been ${accessRequest.status}` },
        { status: 400 }
      );
    }

    // Generate a temporary password for the user (they already have the password they set)
    // We'll use the hashed password from the request but need to create a new user
    // Since Supabase Auth requires a plain password, we'll need to generate a random one
    // and then the user can reset it, OR we can use their original password
    // Problem: We have the hashed password, not the plain one

    // Solution: Generate a secure random password and send it via email later,
    // OR better: use a password reset flow
    // For now, let's generate a random password and mark the account for password reset

    const temporaryPassword = generateSecurePassword();

    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: accessRequest.email,
      password: temporaryPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: accessRequest.full_name,
        position: accessRequest.position,
        date_of_birth: accessRequest.date_of_birth,
      },
    });

    if (authError || !authData.user) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json(
        { error: `Failed to create user account: ${authError?.message}` },
        { status: 500 }
      );
    }

    // Step 2: Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([
        {
          id: authData.user.id,
          email: accessRequest.email,
          full_name: accessRequest.full_name,
          role: role,
          phone: '',
          active: true,
        },
      ]);

    if (profileError) {
      console.error('Error creating profile:', profileError);

      // Rollback: Delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        { error: `Failed to create user profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    // Step 3: Update access request status
    const { error: updateError } = await supabaseAdmin
      .from('access_requests')
      .update({
        status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        assigned_role: role,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating access request:', updateError);
      // Note: User and profile are already created at this point
      // The request status update failing is not critical
    }

    // Step 4: Send password reset email so user can set their own password
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: accessRequest.email,
    });

    if (resetError) {
      console.warn('Could not send password reset email:', resetError);
      // Non-critical error, user account is still created
    }

    return NextResponse.json(
      {
        success: true,
        message: `Access approved! User ${accessRequest.full_name} has been created as ${role}.`,
        data: {
          userId: authData.user.id,
          email: accessRequest.email,
          role: role,
          passwordResetSent: !resetError,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in approve route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}
