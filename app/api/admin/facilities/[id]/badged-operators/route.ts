export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/facilities/[id]/badged-operators
 * Returns list of operators who have active, non-expired badges at this facility.
 * Used by the schedule form when "badging required" is selected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Get active badges for this facility that haven't expired
    const today = new Date().toISOString().split('T')[0];

    const { data: badges, error } = await supabaseAdmin
      .from('operator_facility_badges')
      .select(`
        id,
        operator_id,
        badge_number,
        issued_date,
        expiry_date,
        status,
        operator:profiles!operator_id(id, full_name, email, phone_number, role)
      `)
      .eq('facility_id', id)
      .eq('status', 'active')
      .or(`expiry_date.is.null,expiry_date.gte.${today}`);

    if (error) {
      console.error('Error fetching badged operators:', error);
      return NextResponse.json({ error: 'Failed to fetch badged operators' }, { status: 500 });
    }

    // Transform to a clean operator list
    const operators = (badges || [])
      .filter((b: any) => b.operator)
      .map((b: any) => ({
        id: b.operator.id,
        full_name: b.operator.full_name,
        email: b.operator.email,
        phone_number: b.operator.phone_number,
        role: b.operator.role,
        badge_number: b.badge_number,
        badge_expiry_date: b.expiry_date,
      }));

    return NextResponse.json({ success: true, data: operators });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/facilities/[id]/badged-operators:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
