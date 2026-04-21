export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/card-permissions
 * Admin-only CRUD for dashboard card permissions per user.
 * Uses 4-level permission_level: 'none' | 'view' | 'submit' | 'full'
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOpsManager } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { ALL_CARD_KEYS, type PermissionLevel } from '@/lib/rbac';

const VALID_LEVELS: PermissionLevel[] = ['none', 'view', 'submit', 'full'];

// GET: Get card permissions for a specific user (returns Record<string, PermissionLevel>)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: user_id' },
        { status: 400 }
      );
    }

    // Verify the target user belongs to the same tenant
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    {
      const { data: targetProfile } = await supabaseAdmin.from('profiles').select('id').eq('id', userId).eq('tenant_id', tenantId).single();
      if (!targetProfile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    const { data: rows, error } = await supabaseAdmin
      .from('user_card_permissions')
      .select('card_key, permission_level')
      .eq('user_id', userId);

    if (error) {
      console.error('[admin/card-permissions GET] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch card permissions' },
        { status: 500 }
      );
    }

    // Convert rows into a Record<string, PermissionLevel> map
    const permMap: Record<string, PermissionLevel> = {};
    (rows || []).forEach((r: { card_key: string; permission_level: string }) => {
      permMap[r.card_key] = r.permission_level as PermissionLevel;
    });

    return NextResponse.json({
      success: true,
      data: permMap,
    });
  } catch (error: any) {
    console.error('[admin/card-permissions GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Set card permissions for a user (upsert)
// Body: { user_id: string, permissions: Record<string, PermissionLevel> }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();

    if (!body.user_id || !body.permissions || typeof body.permissions !== 'object') {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, permissions (object)' },
        { status: 400 }
      );
    }

    const { user_id, permissions } = body;

    // Validate permission levels
    for (const [key, level] of Object.entries(permissions)) {
      if (!ALL_CARD_KEYS.includes(key)) {
        return NextResponse.json(
          { error: `Invalid card key: ${key}` },
          { status: 400 }
        );
      }
      if (!VALID_LEVELS.includes(level as PermissionLevel)) {
        return NextResponse.json(
          { error: `Invalid permission level for ${key}: ${level}. Must be none, view, or full.` },
          { status: 400 }
        );
      }
    }

    // Verify the user exists and belongs to the same tenant
    let profileQuery = supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user_id);
    profileQuery = profileQuery.eq('tenant_id', tenantId);
    const { data: profile, error: profileError } = await profileQuery.single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Upsert each card_key -> permission_level mapping
    const upsertRows = Object.entries(permissions).map(([card_key, permission_level]) => ({
      user_id,
      card_key,
      permission_level: permission_level as string,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    }));

    if (upsertRows.length === 0) {
      return NextResponse.json(
        { error: 'No permissions provided' },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabaseAdmin
      .from('user_card_permissions')
      .upsert(upsertRows, {
        onConflict: 'user_id,card_key',
      });

    if (upsertError) {
      console.error('[admin/card-permissions POST] Upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update card permissions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[admin/card-permissions POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
