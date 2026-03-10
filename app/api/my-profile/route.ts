/**
 * API Route: GET/PATCH /api/my-profile
 * Operator self-service: view and update own profile.
 * Access: any authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

// GET: Fetch own profile
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, role, profile_picture_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship')
      .eq('id', auth.userId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Unexpected error in GET /api/my-profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update own profile (only self-editable fields)
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    // Operators can only edit these fields
    const selfEditableFields = [
      'nickname', 'phone', 'phone_number', 'profile_picture_url',
      'date_of_birth',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    ];

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of selfEditableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', auth.userId)
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, role, profile_picture_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/my-profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
