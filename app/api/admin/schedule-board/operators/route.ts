/**
 * GET /api/admin/schedule-board/operators
 * Fetch all operators and helpers (apprentices) for the schedule board dropdowns.
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    // Fetch operators (role = 'operator')
    const { data: operators, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'operator')
      .order('full_name');

    if (opError) {
      console.error('Error fetching operators:', opError);
      return NextResponse.json(
        { error: 'Failed to fetch operators' },
        { status: 500 }
      );
    }

    // Fetch helpers (role = 'apprentice')
    const { data: helpers, error: helpError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'apprentice')
      .order('full_name');

    if (helpError) {
      console.error('Error fetching helpers:', helpError);
      return NextResponse.json(
        { error: 'Failed to fetch helpers' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        operators: (operators || []).map(p => ({ id: p.id, name: p.full_name || 'Unknown' })),
        helpers: (helpers || []).map(p => ({ id: p.id, name: p.full_name || 'Unknown' })),
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/operators:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
