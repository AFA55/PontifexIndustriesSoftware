export const dynamic = 'force-dynamic';

/**
 * API Route: PUT/DELETE /api/admin/skill-categories/[id]
 *
 * PUT    — Update category name or active status.
 * DELETE — Soft-delete (set is_active = false).
 *
 * Access: requireAdmin
 * Note: Default (is_default=true) categories cannot be deleted or renamed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, is_active } = body;

    // Fetch existing
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('id, name, slug, is_default, tenant_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Only allow editing tenant-specific categories (not global defaults)
    if (existing.is_default || existing.tenant_id === null) {
      return NextResponse.json(
        { error: 'Default categories cannot be modified' },
        { status: 403 }
      );
    }

    // Ensure it belongs to the caller's tenant
    if (existing.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
      updates.slug = toSlug(name.trim());
    }
    if (typeof is_active === 'boolean') {
      updates.is_active = is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('operator_skill_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating skill category:', updateError);
      return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Unexpected error in PUT /api/admin/skill-categories/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Fetch existing
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('operator_skill_categories')
      .select('id, is_default, tenant_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    if (existing.is_default || existing.tenant_id === null) {
      return NextResponse.json(
        { error: 'Default categories cannot be deleted' },
        { status: 403 }
      );
    }

    if (existing.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Soft delete
    const { error: softDeleteError } = await supabaseAdmin
      .from('operator_skill_categories')
      .update({ is_active: false })
      .eq('id', id);

    if (softDeleteError) {
      console.error('Error soft-deleting skill category:', softDeleteError);
      return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/skill-categories/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
