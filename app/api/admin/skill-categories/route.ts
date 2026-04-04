export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/skill-categories
 *
 * GET  — List all active categories (global defaults + tenant-specific custom ones).
 *        Auth: requireAuth (all authenticated users)
 * POST — Create a custom category { name }. Slug auto-generated.
 *        Auth: requireAdmin
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data: categories, error } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('id, name, slug, is_default, display_order, tenant_id, is_active, created_at')
      .or(`tenant_id.is.null,tenant_id.eq.${auth.tenantId}`)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching skill categories:', error);
      return NextResponse.json({ error: 'Failed to fetch skill categories' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: categories || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/skill-categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const slug = toSlug(name.trim());

    if (!slug) {
      return NextResponse.json({ error: 'Could not generate a valid slug from name' }, { status: 400 });
    }

    // Check for duplicate slug within this tenant
    const { data: existing } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('id')
      .eq('slug', slug)
      .eq('tenant_id', auth.tenantId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'A category with that name already exists for this tenant' },
        { status: 409 }
      );
    }

    // Get next display_order
    const { data: maxOrder } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('display_order')
      .or(`tenant_id.is.null,tenant_id.eq.${auth.tenantId}`)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.display_order ?? 0) + 1;

    const { data: category, error: insertError } = await supabaseAdmin
      .from('operator_skill_categories')
      .insert({
        tenant_id: auth.tenantId,
        name: name.trim(),
        slug,
        is_default: false,
        display_order: nextOrder,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating skill category:', insertError);
      return NextResponse.json({ error: 'Failed to create skill category' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/skill-categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
