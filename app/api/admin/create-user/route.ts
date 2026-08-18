export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/create-user
 * Create a new user account directly (Super Admin only).
 * Creates the auth user + profile in one step.
 *
 * Body: { email, password, full_name, role, card_permissions? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOpsManager } from '@/lib/api-auth';
import { ROLES_WITH_LABELS, ALL_CARD_KEYS, type PermissionLevel } from '@/lib/rbac';
import { STORABLE_CARD_LEVELS } from '@/lib/card-permissions';

const VALID_ROLES = ROLES_WITH_LABELS.map(r => r.value);
// Mirrors the user_card_permissions CHECK — 'submit' is a role-preset level and
// is not storable per-user. See lib/card-permissions.ts.
const VALID_LEVELS: PermissionLevel[] = STORABLE_CARD_LEVELS;

export async function POST(request: NextRequest) {
  try {
    // Only super_admin and operations_manager can create users
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { email, password, full_name, role, card_permissions } = body;

    // ── Validation ──────────────────────────────────────────
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Only super_admin can grant super_admin role
    if (role === 'super_admin' && auth.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only a Super Admin can grant the Super Admin role.' },
        { status: 403 }
      );
    }

    // Validate card_permissions if provided
    if (card_permissions && typeof card_permissions === 'object') {
      // A NULL tenant_id makes the row invisible to every reader: the
      // RESTRICTIVE policy hides it and `loadUserCardPermissions` filters on
      // tenant_id. The grant would save, report success, and do nothing —
      // verbatim the defect this change exists to kill. `requireOpsManager`
      // admits a tenant-less super_admin, so refuse BEFORE creating anything.
      // (Mirrors /api/admin/card-permissions, which already 400s here.)
      if (Object.keys(card_permissions).length > 0 && !auth.tenantId) {
        return NextResponse.json(
          { error: 'Tenant scope required to set card permissions. No user was created.' },
          { status: 400 }
        );
      }
      for (const [key, level] of Object.entries(card_permissions)) {
        if (!ALL_CARD_KEYS.includes(key)) {
          return NextResponse.json(
            { error: `Invalid card key: ${key}` },
            { status: 400 }
          );
        }
        if (!VALID_LEVELS.includes(level as PermissionLevel)) {
          return NextResponse.json(
            { error: `Invalid permission level for ${key}: ${level}` },
            { status: 400 }
          );
        }
      }
    }

    // ── Step 1: Check if user already exists ─────────────────
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(
      u => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists.' },
        { status: 409 }
      );
    }

    // ── Step 2: Create auth user ─────────────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
      },
    });

    if (authError || !authData.user) {
      console.error('[create-user] Error creating auth user:', authError);
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user account' },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // ── Step 3: Create profile ───────────────────────────────
    // Pin the new user to the CREATOR'S tenant (security audit M2). Omitting
    // tenant_id left new accounts unscoped — RBAC then 403'd them (broken
    // login) and the user wasn't bound to any tenant.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: email.trim(),
        full_name: full_name.trim(),
        role,
        tenant_id: auth.tenantId ?? null,
        phone: '',
        phone_number: '',
        active: true,
      });

    if (profileError) {
      console.error('[create-user] Error creating profile:', profileError);
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

    // ── Step 4: Upsert card permissions if provided ──────────
    if (card_permissions && typeof card_permissions === 'object' && Object.keys(card_permissions).length > 0) {
      // tenant_id is guaranteed non-null here — validated up front, before the
      // auth user was created, so we never half-build an account we must undo.
      const permRows = Object.entries(card_permissions).map(([card_key, permission_level]) => ({
        user_id: userId,
        card_key,
        permission_level: permission_level as string,
        tenant_id: auth.tenantId,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      }));

      const { error: permError } = await supabaseAdmin
        .from('user_card_permissions')
        .upsert(permRows, { onConflict: 'user_id,card_key' });

      if (permError) {
        console.error('[create-user] Error upserting card permissions:', permError);
        // Non-critical: log but continue
      }
    }

    console.log(`✅ User created: ${full_name.trim()} (${email.trim()}) as ${role} by ${auth.userEmail}`);

    return NextResponse.json(
      {
        success: true,
        message: `User ${full_name.trim()} created successfully as ${role}.`,
        data: {
          userId,
          email: email.trim(),
          role,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[create-user] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
