/**
 * API Route: GET /api/admin/users
 * Get users by role with pagination (admin only)
 * Query params: ?role=operator or ?role=admin or no param for all users
 *               ?page=1&pageSize=50
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get query params
    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build query with count
    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, email, active', { count: 'exact' })
      .eq('active', true)
      .order('full_name')
      .range(from, to);

    // Apply role filter if provided
    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }

    const { data: users, count: total, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    const totalCount = total ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json(
      {
        success: true,
        data: users || [],
        pagination: {
          page,
          pageSize,
          total: totalCount,
          totalPages,
        },
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
