/**
 * API Route: GET /api/setup/check-admin
 * Check if admin exists and get their email
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Security: only admins can check admin list
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    // Check for existing admin
    const { data: admins, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    if (!admins || admins.length === 0) {
      return NextResponse.json(
        {
          exists: false,
          message: 'No admin accounts found. You can create one at /setup',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        exists: true,
        count: admins.length,
        admins: admins.map(admin => ({
          email: admin.email,
          fullName: admin.full_name,
          createdAt: admin.created_at,
        })),
        message: `Found ${admins.length} admin account(s). Use one of these emails to log in.`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error checking admin:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
