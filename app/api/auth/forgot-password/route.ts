/**
 * API Route: POST /api/auth/forgot-password
 * Send password reset email to user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, generatePasswordResetEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log(`🔑 Password reset requested for: ${email}`);

    // Check if user exists in profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, active')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      // For security, don't reveal if the email exists or not
      console.log(`⚠️ Email not found: ${email}`);
      return NextResponse.json(
        {
          success: true,
          message: 'If an account exists with that email, a password reset link has been sent.',
        },
        { status: 200 }
      );
    }

    // Check if user is active
    if (!profile.active) {
      console.log(`⚠️ Inactive account: ${email}`);
      return NextResponse.json(
        {
          success: true,
          message: 'If an account exists with that email, a password reset link has been sent.',
        },
        { status: 200 }
      );
    }

    // Generate password reset link using Supabase
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    if (resetError || !resetData) {
      console.error('❌ Error generating reset link:', resetError);
      return NextResponse.json(
        { error: 'Failed to generate reset link' },
        { status: 500 }
      );
    }

    console.log('✅ Reset link generated');

    // Get the recovery link from the data
    const resetLink = resetData.properties?.action_link || '';

    // Send password reset email
    const resetEmailHtml = generatePasswordResetEmail(
      profile.full_name,
      resetLink
    );

    const emailSent = await sendEmail({
      to: email,
      subject: 'Password Reset Request - Pontifex Industries',
      html: resetEmailHtml,
    });

    if (!emailSent) {
      console.warn('⚠️ Could not send password reset email');
    }

    return NextResponse.json(
      {
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.',
        data: {
          emailSent: emailSent,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('💥 Unexpected error in forgot-password route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
