/**
 * API Route: GET/PUT /api/admin/role-permissions
 *
 * Manages role-level card permission presets.
 * GET  ?role={role}  — returns saved card permissions for a role (or defaults)
 * PUT               — body: { role, card_permissions: Record<string, PermissionLevel> }
 *
 * Read: requireAdmin (admin, ops_manager, super_admin)
 * Write: requireOpsManager (ops_manager, super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, requireOpsManager } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import {
  ALL_CARD_KEYS,
  ROLE_PERMISSION_PRESETS,
  BYPASS_ROLES,
  type PermissionLevel,
} from '@/lib/rbac';

const VALID_LEVELS: PermissionLevel[] = ['none', 'view', 'submit', 'full'];

// Roles that can have their permissions customized (bypass roles are always full)
const CONFIGURABLE_ROLES = ['admin', 'supervisor', 'salesman'];

// GET /api/admin/role-permissions?role={role}
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    if (!role) {
      return NextResponse.json(
        { error: 'Missing required query parameter: role' },
        { status: 400 }
      );
    }

    if (BYPASS_ROLES.includes(role)) {
      // Bypass roles always have full access — return full preset
      const full: Record<string, PermissionLevel> = {};
      ALL_CARD_KEYS.forEach(k => { full[k] = 'full'; });
      return NextResponse.json({ success: true, data: full, isDefault: true });
    }

    // Try to load saved permissions for this role+tenant
    const query = supabaseAdmin
      .from('role_permissions')
      .select('card_permissions')
      .eq('role', role);

    const finalQuery = tenantId ? query.eq('tenant_id', tenantId) : query;
    const { data, error } = await finalQuery.maybeSingle();

    if (error) {
      console.error('[role-permissions GET] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch role permissions' }, { status: 500 });
    }

    if (data?.card_permissions) {
      // Saved row found — merge with defaults so any new cards get a value
      const defaults = ROLE_PERMISSION_PRESETS[role] || {};
      const merged: Record<string, PermissionLevel> = { ...defaults };
      Object.entries(data.card_permissions as Record<string, string>).forEach(([k, v]) => {
        if (ALL_CARD_KEYS.includes(k) && VALID_LEVELS.includes(v as PermissionLevel)) {
          merged[k] = v as PermissionLevel;
        }
      });
      return NextResponse.json({ success: true, data: merged, isDefault: false });
    }

    // No saved row — return the static preset as defaults
    const defaults: Record<string, PermissionLevel> = {};
    ALL_CARD_KEYS.forEach(k => {
      defaults[k] = (ROLE_PERMISSION_PRESETS[role]?.[k]) ?? 'none';
    });
    return NextResponse.json({ success: true, data: defaults, isDefault: true });

  } catch (err: any) {
    console.error('[role-permissions GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/role-permissions
// Body: { role: string, card_permissions: Record<string, PermissionLevel> }
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) {
      return NextResponse.json({ error: 'Could not determine tenant' }, { status: 400 });
    }

    const body = await request.json();
    const { role, card_permissions } = body;

    if (!role || typeof card_permissions !== 'object') {
      return NextResponse.json(
        { error: 'Missing required fields: role, card_permissions' },
        { status: 400 }
      );
    }

    if (!CONFIGURABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role "${role}" cannot have custom permissions. Configurable roles: ${CONFIGURABLE_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate all keys and levels
    for (const [key, level] of Object.entries(card_permissions)) {
      if (!ALL_CARD_KEYS.includes(key)) {
        return NextResponse.json({ error: `Invalid card key: ${key}` }, { status: 400 });
      }
      if (!VALID_LEVELS.includes(level as PermissionLevel)) {
        return NextResponse.json(
          { error: `Invalid permission level for "${key}": ${level}` },
          { status: 400 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from('role_permissions')
      .upsert(
        {
          tenant_id: tenantId,
          role,
          card_permissions,
          updated_by: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,role' }
      );

    if (error) {
      console.error('[role-permissions PUT] Upsert error:', error);
      return NextResponse.json({ error: 'Failed to save role permissions' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[role-permissions PUT] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/role-permissions?role={role} — reset to defaults
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    if (!role) {
      return NextResponse.json({ error: 'Missing role parameter' }, { status: 400 });
    }

    const query = supabaseAdmin
      .from('role_permissions')
      .delete()
      .eq('role', role);

    const { error } = tenantId ? await query.eq('tenant_id', tenantId) : await query;

    if (error) {
      console.error('[role-permissions DELETE] Error:', error);
      return NextResponse.json({ error: 'Failed to reset permissions' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[role-permissions DELETE] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
