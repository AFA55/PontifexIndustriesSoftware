/**
 * API Route: POST /api/access-requests/[id]/approve
 * Approve an access request and create user account
 * SECURITY: Uses password_hash for verification, generates temp password for account creation
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, generateApprovalEmail } from '@/lib/email';
import { requireAdmin } from '@/lib/api-auth';
import crypto from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Security: only admins can approve access requests
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { role, reviewedBy } = body;

    // Validation
    if (!role || !['admin', 'operator', 'apprentice'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "admin", "operator", or "apprentice"' },
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

    // Step 1: Check if user already exists in Supabase Auth
    // Use getUserByEmail instead of listUsers for better performance
    const { data: existingUserData } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUserData?.users.find(u => u.email === accessRequest.email);

    let userId: string;
    // Generate a secure temporary password for account creation
    const tempPassword = crypto.randomBytes(16).toString('hex');

    if (existingUser) {
      // User already exists in Auth — they already have their password from registration
      console.log(`[approve] User ${accessRequest.email} already exists in Auth`);
      userId = existingUser.id;
    } else {
      // Create new user in Supabase Auth with a temporary password
      // User will use "Forgot Password" or admin will send reset link
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: accessRequest.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: accessRequest.full_name,
          position: accessRequest.position,
          date_of_birth: accessRequest.date_of_birth,
        },
      });

      if (authError || !authData.user) {
        console.error('[approve] Error creating auth user:', authError);
        return NextResponse.json(
          { error: 'Failed to create user account' },
          { status: 500 }
        );
      }

      userId = authData.user.id;
      console.log(`[approve] User created successfully: ${accessRequest.email}`);
    }

    // Step 2: Check if profile already exists, if not create it
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({
          role: role,
          phone_number: accessRequest.phone_number || existingProfile.phone_number,
          active: true,
        })
        .eq('id', userId);

      if (updateProfileError) {
        console.error('[approve] Error updating profile:', updateProfileError);
        return NextResponse.json(
          { error: 'Failed to update user profile' },
          { status: 500 }
        );
      }
    } else {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert([
          {
            id: userId,
            email: accessRequest.email,
            full_name: accessRequest.full_name,
            role: role,
            phone: '',
            phone_number: accessRequest.phone_number || '',
            active: true,
          },
        ]);

      if (profileError) {
        console.error('[approve] Error creating profile:', profileError);

        // Rollback: Delete the auth user if profile creation fails (only if we just created it)
        if (!existingUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        }

        return NextResponse.json(
          { error: 'Failed to create user profile' },
          { status: 500 }
        );
      }
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
      console.error('[approve] Error updating access request status:', updateError);
    }

    // Step 4: Send approval confirmation email
    const approvalEmailHtml = generateApprovalEmail(
      accessRequest.full_name,
      accessRequest.email,
      role
    );

    const emailSent = await sendEmail({
      to: accessRequest.email,
      subject: `Access Approved - ${process.env.COMPANY_NAME || 'Your Company'}`,
      html: approvalEmailHtml,
    });

    if (!emailSent) {
      console.warn('[approve] Could not send approval confirmation email');
    }

    // Step 5: Generate a password reset link so user can set their own password
    const { data: resetData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: accessRequest.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: existingProfile
          ? `Access approved! User ${accessRequest.full_name} role updated to ${role}.`
          : `Access approved! User ${accessRequest.full_name} has been created as ${role}. A password reset link has been generated.`,
        data: {
          userId: userId,
          email: accessRequest.email,
          role: role,
          approvalEmailSent: emailSent,
          wasExistingUser: !!existingUser,
          passwordResetGenerated: !!resetData,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[approve] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
