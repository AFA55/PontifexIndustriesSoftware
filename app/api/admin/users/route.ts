export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/users
 * Get users by role (admin only)
 * Query params: ?role=operator or ?role=admin or no param for all users
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin (any elevated role)
    if (!['admin', 'super_admin', 'operations_manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators can view users' },
        { status: 403 }
      );
    }

    // Resolve tenant scope
    const tenantId = await getTenantId(user.id);

    // Get role filter from query params
    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');

    // Build query
    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, email, active, phone_number, phone, profile_picture_url, created_at, date_of_birth, hire_date, next_review_date, nickname')
      .eq('active', true)
      .order('full_name');

    // Scope to tenant
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    // Apply role filter if provided
    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }

    const { data: users, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: users || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in users route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
