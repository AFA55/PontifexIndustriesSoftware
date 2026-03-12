/**
 * API Route: PATCH /api/admin/users/[id]
 * Update a user's profile (role, active status).
 * SECURITY: Only super_admin/operations_manager can update users.
 *           Only super_admin can grant super_admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOpsManager } from '@/lib/api-auth';
import { ROLES_WITH_LABELS } from '@/lib/rbac';

const VALID_ROLES = ROLES_WITH_LABELS.map(r => r.value);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, any> = {};

    // Optional: role update
    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
          { status: 400 }
        );
      }
      // Guard: only super_admin can grant super_admin
      if (body.role === 'super_admin' && auth.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Only a Super Admin can grant the Super Admin role.' },
          { status: 403 }
        );
      }
      updates.role = body.role;
    }

    // Optional: active status update
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json(
          { error: 'active must be a boolean' },
          { status: 400 }
        );
      }
      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Verify user exists
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('id', id)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Apply update
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[admin/users PATCH] Update error:', updateError);
      return NextResponse.json(
        { error: `Failed to update user: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `User ${profile.full_name} has been updated.`,
      data: updatedUser,
    });
  } catch (error: any) {
    console.error('[admin/users PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
