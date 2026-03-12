/**
 * API Route: POST /api/access-requests/[id]/update-user
 * Update user profile (role, active status, and card permissions)
 * SECURITY: Only super_admin/operations_manager can update users.
 *           Only super_admin can grant super_admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOpsManager } from '@/lib/api-auth';
import { ROLES_WITH_LABELS, ALL_CARD_KEYS, type PermissionLevel } from '@/lib/rbac';

const VALID_ROLES = ROLES_WITH_LABELS.map(r => r.value);
const VALID_LEVELS: PermissionLevel[] = ['none', 'view', 'full'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Security: only super_admin/operations_manager can update user profiles
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { role, active, card_permissions } = body;

    // Validation: role
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Guard: only super_admin can grant super_admin role
    if (role === 'super_admin' && auth.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only a Super Admin can grant the Super Admin role.' },
        { status: 403 }
      );
    }

    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'Active status must be a boolean' },
        { status: 400 }
      );
    }

    // Validate card_permissions if provided
    if (card_permissions && typeof card_permissions === 'object') {
      for (const [key, level] of Object.entries(card_permissions)) {
        if (!ALL_CARD_KEYS.includes(key)) {
          return NextResponse.json(
            { error: `Invalid card key in permissions: ${key}` },
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

    // Fetch the access request to get the email
    const { data: accessRequest, error: fetchError } = await supabaseAdmin
      .from('access_requests')
      .select('email, full_name')
      .eq('id', id)
      .single();

    if (fetchError || !accessRequest) {
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    // Find the user by email in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const user = existingUsers?.users.find(u => u.email === accessRequest.email);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found in authentication system' },
        { status: 404 }
      );
    }

    // Update the profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: role,
        active: active,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json(
        { error: `Failed to update user profile: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Upsert card permissions if provided
    if (card_permissions && typeof card_permissions === 'object' && Object.keys(card_permissions).length > 0) {
      const permRows = Object.entries(card_permissions).map(([card_key, permission_level]) => ({
        user_id: user.id,
        card_key,
        permission_level: permission_level as string,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      }));

      const { error: permError } = await supabaseAdmin
        .from('user_card_permissions')
        .upsert(permRows, { onConflict: 'user_id,card_key' });

      if (permError) {
        console.error('[update-user] Error upserting card permissions:', permError);
        // Non-critical: continue
      }
    }

    // Also update the access request assigned_role
    const { error: updateRequestError } = await supabaseAdmin
      .from('access_requests')
      .update({
        assigned_role: role,
      })
      .eq('id', id);

    if (updateRequestError) {
      console.warn('Could not update access request assigned_role:', updateRequestError);
      // Non-critical error
    }

    return NextResponse.json(
      {
        success: true,
        message: `User ${accessRequest.full_name} has been updated successfully.`,
        data: {
          userId: user.id,
          email: accessRequest.email,
          role: role,
          active: active,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update-user route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
