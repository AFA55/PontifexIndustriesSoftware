export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/operators/[id]/skills
 *
 * GET  — Fetch all active skill categories with this operator's ratings (unrated = null).
 * POST — Upsert a skill rating { category_id, rating, notes }.
 *
 * Access: requireAdmin
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;

    // Verify operator exists
    const { data: operator, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, tenant_id')
      .eq('id', operatorId)
      .single();

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // Fetch all active categories (globals + tenant-specific)
    const { data: categories, error: catError } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('id, name, slug, is_default, display_order')
      .or(`tenant_id.is.null,tenant_id.eq.${auth.tenantId}`)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (catError) {
      console.error('Error fetching skill categories:', catError);
      return NextResponse.json({ error: 'Failed to fetch skill categories' }, { status: 500 });
    }

    // Fetch this operator's ratings
    const { data: ratings, error: ratingsError } = await supabaseAdmin
      .from('operator_skill_ratings')
      .select('id, category_id, rating, notes, rated_at, updated_at, rated_by')
      .eq('operator_id', operatorId);

    if (ratingsError) {
      console.error('Error fetching skill ratings:', ratingsError);
      return NextResponse.json({ error: 'Failed to fetch skill ratings' }, { status: 500 });
    }

    // Build rating map
    const ratingMap = new Map(
      (ratings || []).map(r => [r.category_id, r])
    );

    // Enrich rated_by names
    const ratedByIds = [...new Set(
      (ratings || []).map(r => r.rated_by).filter(Boolean)
    )];
    const raterMap = new Map<string, string>();

    if (ratedByIds.length > 0) {
      const { data: raters } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', ratedByIds as string[]);
      (raters || []).forEach(r => raterMap.set(r.id, r.full_name));
    }

    // Merge: one entry per category
    const result = (categories || []).map(cat => {
      const r = ratingMap.get(cat.id);
      return {
        category_id: cat.id,
        category_name: cat.name,
        category_slug: cat.slug,
        is_default: cat.is_default,
        display_order: cat.display_order,
        rating_id: r?.id ?? null,
        rating: r?.rating ?? null,
        notes: r?.notes ?? null,
        rated_at: r?.rated_at ?? null,
        updated_at: r?.updated_at ?? null,
        rated_by: r?.rated_by ?? null,
        rated_by_name: r?.rated_by ? (raterMap.get(r.rated_by) ?? null) : null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/operators/[id]/skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;
    const body = await request.json();
    const { category_id, rating, notes } = body;

    if (!category_id || typeof category_id !== 'string') {
      return NextResponse.json({ error: 'category_id is required' }, { status: 400 });
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 10) {
      return NextResponse.json({ error: 'rating must be an integer between 1 and 10' }, { status: 400 });
    }

    // Verify operator exists and shares tenant
    const { data: operator, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('id', operatorId)
      .single();

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // Verify category exists (global or tenant)
    const { data: category, error: catError } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('id, name')
      .eq('id', category_id)
      .or(`tenant_id.is.null,tenant_id.eq.${auth.tenantId}`)
      .eq('is_active', true)
      .single();

    if (catError || !category) {
      return NextResponse.json({ error: 'Skill category not found' }, { status: 404 });
    }

    // Upsert rating
    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from('operator_skill_ratings')
      .upsert(
        {
          tenant_id: auth.tenantId,
          operator_id: operatorId,
          category_id,
          rating: Math.round(rating),
          notes: notes ?? null,
          rated_by: auth.userId,
          rated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'operator_id,category_id' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting skill rating:', upsertError);
      return NextResponse.json({ error: 'Failed to save skill rating' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'upsert_skill_rating',
        resource_type: 'profile',
        resource_id: operatorId,
        details: {
          category_id,
          category_name: category.name,
          rating: Math.round(rating),
          operator_name: operator.full_name,
        },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: upserted }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/operators/[id]/skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
