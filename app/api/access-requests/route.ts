export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/access-requests
 * Submit a new access request with secure password hashing
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, generateAccessRequestReceivedEmail, getTenantEmailBranding } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, email, phoneNumber, dateOfBirth, position } = body;

    // Validation — NO password here. The applicant sets their password ONCE, at
    // the post-approval setup link. A password typed at request time can't be
    // used to log in (Supabase manages credentials), so collecting it here only
    // made users enter it twice.
    if (!fullName || !email || !phoneNumber || !dateOfBirth) {
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

    // Insert access request (contact info only — password is set later, once,
    // at the post-approval setup link).
    const { data, error } = await supabaseAdmin
      .from('access_requests')
      .insert([
        {
          full_name: fullName,
          email: email.toLowerCase(),
          phone_number: phoneNumber,
          date_of_birth: dateOfBirth,
          position: position || 'Not specified',
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

    // Send confirmation email to the user — white-labeled with the tenant's brand.
    // access_requests rows have no tenant_id yet, so resolve the single client
    // tenant (Patriot) by company_code. Falls back to platform defaults on failure.
    // TODO: thread real tenant context when the request form is tenant-aware
    let receivedBranding = await getTenantEmailBranding(null);
    try {
      const { data: patriotTenant } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('company_code', 'PATRIOT')
        .maybeSingle();
      if (patriotTenant?.id) {
        receivedBranding = await getTenantEmailBranding(patriotTenant.id);
      }
    } catch {
      // keep platform defaults
    }

    const confirmationEmailHtml = await generateAccessRequestReceivedEmail(
      fullName,
      email,
      receivedBranding
    );

    const emailSent = await sendEmail({
      to: email,
      subject: 'Access Request Received - Patriot Concrete Cutting',
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
