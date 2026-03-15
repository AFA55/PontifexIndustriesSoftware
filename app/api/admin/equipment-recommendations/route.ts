/**
 * API Route: GET /api/admin/equipment-recommendations
 * Fetch frequency-based equipment recommendations per scope type.
 *
 * Query params:
 *   scopes=HHS/PS,DFS  (comma-separated scope codes)
 *
 * Returns top items per scope ordered by co_occurrence_count.
 * Client merges with rule-based defaults and shows "Frequently Used" badges.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scopesParam = request.nextUrl.searchParams.get('scopes');
    if (!scopesParam) {
      return NextResponse.json({ error: 'scopes parameter required' }, { status: 400 });
    }

    const scopes = scopesParam.split(',').map(s => s.trim()).filter(Boolean);
    if (scopes.length === 0) {
      return NextResponse.json({ data: {} });
    }

    // Fetch top equipment per scope ordered by frequency
    const { data: recommendations, error: fetchError } = await supabaseAdmin
      .from('equipment_recommendations')
      .select('scope_type, equipment_item, co_occurrence_count, last_used_at')
      .in('scope_type', scopes)
      .order('co_occurrence_count', { ascending: false })
      .limit(100);

    if (fetchError) {
      console.error('Error fetching equipment recommendations:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
    }

    // Group by scope type
    const grouped: Record<string, Array<{
      item: string;
      count: number;
      lastUsed: string;
    }>> = {};

    for (const rec of recommendations || []) {
      if (!grouped[rec.scope_type]) {
        grouped[rec.scope_type] = [];
      }
      grouped[rec.scope_type].push({
        item: rec.equipment_item,
        count: rec.co_occurrence_count,
        lastUsed: rec.last_used_at,
      });
    }

    return NextResponse.json({ data: grouped });
  } catch (error: any) {
    console.error('Unexpected error in equipment recommendations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
