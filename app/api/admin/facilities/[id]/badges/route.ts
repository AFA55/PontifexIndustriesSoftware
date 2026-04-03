export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/facilities/[id]/badges — Get all badges for a facility
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('badges_with_details')
      .select('*')
      .eq('facility_id', id)
      .order('operator_name');

    if (error) {
      console.error('Error fetching facility badges:', error);
      // Fallback: query the base table with a join if the view doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from('operator_facility_badges')
        .select(`
          *,
          operator:profiles!operator_id(id, full_name, email),
          facility:facilities!facility_id(id, name)
        `)
        .eq('facility_id', id)
        .order('created_at', { ascending: false });

      if (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
      }

      // Transform fallback data to match view shape
      const transformed = (fallbackData || []).map((b: any) => ({
        ...b,
        operator_name: b.operator?.full_name || 'Unknown',
        operator_email: b.operator?.email || '',
        facility_name: b.facility?.name || 'Unknown',
        expiry_status: !b.expiry_date ? 'no_expiry' :
          new Date(b.expiry_date) < new Date() ? 'expired' :
          new Date(b.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? 'expiring_soon' : 'valid',
      }));

      return NextResponse.json({ success: true, data: transformed });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/facilities/[id]/badges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
