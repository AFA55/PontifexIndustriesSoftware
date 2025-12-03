/**
 * API Route: POST /api/setup/create-super-admin
 * Creates the initial super admin account
 * This should only be used once during initial setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName } = body;

    // Validation
    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, password, and full name are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Allow creating admin if:
    // 1. No admins exist, OR
    // 2. User specifically wants to create another admin (we'll allow it for initial setup)
    const { data: existingAdmins } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('role', 'admin');

    // Only block if trying to create the same email
    if (existingAdmins && existingAdmins.some(admin => admin.email === email)) {
      return NextResponse.json(
        { error: 'An admin with this email already exists. Use a different email address.' },
        { status: 400 }
      );
    }

    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authError || !authData.user) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json(
        { error: `Failed to create user account: ${authError?.message}` },
        { status: 500 }
      );
    }

    // Step 2: Create profile with admin role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([
        {
          id: authData.user.id,
          email: email,
          full_name: fullName,
          role: 'admin',
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

    return NextResponse.json(
      {
        success: true,
        message: `Super admin account created successfully! You can now log in with ${email}`,
        data: {
          userId: authData.user.id,
          email: email,
          fullName: fullName,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in create-super-admin route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
