/**
 * API Route: GET /api/admin/users
 * Get users by role (admin access required).
 * Query params:
 *   ?role=operator — filter by single role
 *   ?roles=admin,supervisor,salesman — filter by multiple roles (comma-separated)
 *   ?active=true|false — filter by active status (default: all)
 *   no params — return all users
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');
    const rolesFilter = searchParams.get('roles');
    const activeFilter = searchParams.get('active');

    // Build query
    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, email, active, phone_number, created_at')
      .order('full_name');

    // Apply role filters
    if (roleFilter) {
      query = query.eq('role', roleFilter);
    } else if (rolesFilter) {
      const roleList = rolesFilter.split(',').map(r => r.trim()).filter(Boolean);
      if (roleList.length > 0) {
        query = query.in('role', roleList);
      }
    }

    // Apply active filter if provided
    if (activeFilter === 'true') {
      query = query.eq('active', true);
    } else if (activeFilter === 'false') {
      query = query.eq('active', false);
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
