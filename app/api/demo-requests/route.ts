export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      company_type,
      team_size,
      biggest_challenge,
      first_name,
      last_name,
      email,
      phone,
      company_name,
    } = body;

    // Validate required fields
    if (!first_name?.trim()) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!company_name?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Insert into demo_requests table
    const { data, error } = await supabaseAdmin
      .from('demo_requests')
      .insert({
        company_type: company_type || null,
        team_size: team_size || null,
        biggest_challenge: biggest_challenge || null,
        first_name: first_name.trim(),
        last_name: last_name?.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        company_name: company_name.trim(),
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save demo request:', error);
      return NextResponse.json(
        { error: 'Failed to save your request. Please try again.' },
        { status: 500 }
      );
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        action: 'demo_request_created',
        details: {
          demo_request_id: data.id,
          email: email.trim().toLowerCase(),
          company_name: company_name.trim(),
          company_type,
          team_size,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { id: data.id },
    });
  } catch (err) {
    console.error('Demo request error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
