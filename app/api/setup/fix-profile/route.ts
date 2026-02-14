/**
 * API Route: POST /api/setup/fix-profile
 * Manually create profile for existing auth user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    // Security: only admins can fix profiles
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get all auth users and find by email
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = usersData?.users.find(u => u.email === email);

    if (!authUser) {
      return NextResponse.json(
        { error: 'No auth user found with that email' },
        { status: 404 }
      );
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (existingProfile) {
      return NextResponse.json(
        {
          success: true,
          message: 'Profile already exists!',
          profile: existingProfile,
        },
        { status: 200 }
      );
    }

    // Create profile
    const { data: newProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([
        {
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || 'Admin User',
          role: 'admin',
          phone: '',
          active: true,
        },
      ])
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return NextResponse.json(
        { error: `Failed to create profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Profile created successfully!',
        profile: newProfile,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
