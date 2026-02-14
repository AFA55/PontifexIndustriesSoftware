/**
 * API Route: GET /api/access-requests/list
 * Fetch all access requests (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Security: only admins can list access requests
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Fetch all access requests using admin client (bypasses RLS)
    // Explicitly select columns to exclude password_plain and password_hash
    const { data, error } = await supabaseAdmin
      .from('access_requests')
      .select('id, full_name, email, phone_number, date_of_birth, position, status, reviewed_by, reviewed_at, assigned_role, denial_reason, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching access requests:', error);
      return NextResponse.json(
        { error: 'Failed to fetch access requests', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: data || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in list route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
