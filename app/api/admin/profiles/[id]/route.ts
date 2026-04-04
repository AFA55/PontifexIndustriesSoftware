/**
 * API Route: GET/PATCH /api/admin/profiles/[id]
 * Get or update a single operator/helper profile. Includes project history.
 * Access: admin, super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// GET: Single profile with project history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, hire_date, next_review_date, role, active, profile_picture_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_at')
      .eq('id', id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Fetch project history — jobs where this person was operator or helper
    const { data: jobHistory } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, job_type, location, status, scheduled_date, end_date, work_completed_at')
      .or(`assigned_to.eq.${id},helper_assigned_to.eq.${id}`)
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: false })
      .limit(50);

    return NextResponse.json({
      success: true,
      data: {
        ...profile,
        project_history: jobHistory || [],
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update profile fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'full_name', 'nickname', 'email', 'phone', 'phone_number',
      'date_of_birth', 'hire_date', 'next_review_date', 'role', 'active', 'profile_picture_url',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    ];

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
