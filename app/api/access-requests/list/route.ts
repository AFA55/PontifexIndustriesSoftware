/**
 * API Route: GET /api/access-requests/list
 * Fetch all access requests (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    // Fetch all access requests using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('access_requests')
      .select('*')
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
