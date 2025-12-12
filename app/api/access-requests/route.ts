/**
 * API Route: POST /api/access-requests
 * Submit a new access request with secure password hashing
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, generateAccessRequestReceivedEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, email, password, dateOfBirth, position } = body;

    // Validation
    if (!fullName || !email || !password || !dateOfBirth) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Validate age (must be 18+)
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const isOldEnough = age > 18 || (age === 18 && monthDiff >= 0);

    if (!isOldEnough) {
      return NextResponse.json(
        { error: 'You must be at least 18 years old' },
        { status: 400 }
      );
    }

    // Check if email already exists in access_requests
    const { data: existingRequest } = await supabaseAdmin
      .from('access_requests')
      .select('id, status')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'An access request with this email is already pending review' },
          { status: 409 }
        );
      } else if (existingRequest.status === 'approved') {
        return NextResponse.json(
          { error: 'This email has already been approved. Please try logging in.' },
          { status: 409 }
        );
      }
    }

    // Check if user already exists in profiles (more efficient than listing all auth users)
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please try logging in.' },
        { status: 409 }
      );
    }

    // Hash the password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert access request
    const { data, error } = await supabaseAdmin
      .from('access_requests')
      .insert([
        {
          full_name: fullName,
          email: email.toLowerCase(),
          password_hash: passwordHash,
          date_of_birth: dateOfBirth,
          position: position || 'Not specified', // Default if not provided
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating access request:', error);
      return NextResponse.json(
        { error: 'Failed to create access request' },
        { status: 500 }
      );
    }

    // Send confirmation email to the user
    const confirmationEmailHtml = generateAccessRequestReceivedEmail(
      fullName,
      email
    );

    const emailSent = await sendEmail({
      to: email,
      subject: 'Access Request Received - Pontifex Industries',
      html: confirmationEmailHtml,
    });

    if (!emailSent) {
      console.warn('⚠️ Could not send confirmation email to user');
      // Non-critical - still return success since request was created
    } else {
      console.log('✅ Confirmation email sent to:', email);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Access request submitted successfully',
        data: {
          id: data.id,
          email: data.email,
          status: data.status,
          confirmationEmailSent: emailSent,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in access-requests POST:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
