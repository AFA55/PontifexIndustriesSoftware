export const dynamic = 'force-dynamic';

/**
 * API Route: GET/PATCH /api/my-profile
 * Operator self-service: view and update own profile.
 * Access: any authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

// GET: Fetch own profile
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, role, profile_picture_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, welcome_dismissed_at')
      .eq('id', auth.userId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Unexpected error in GET /api/my-profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update own profile (only self-editable fields)
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    // Operators can only edit these fields
    const selfEditableFields = [
      'nickname', 'phone', 'phone_number', 'profile_picture_url',
      'date_of_birth',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    ];

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of selfEditableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', auth.userId)
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, role, profile_picture_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, welcome_dismissed_at')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // ------------------------------------------------------------------
    // Fire-and-forget: notify management in the SAME tenant that this
    // user edited their own profile, so they can review it in Team
    // Profiles. A notification failure must NEVER fail the profile save.
    // ------------------------------------------------------------------
    notifyManagementOfProfileChange(
      auth.userId,
      auth.tenantId,
      profile?.full_name ?? 'A team member',
      updateData
    ).catch(() => {});

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/my-profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Notify management when a user edits their own profile.
//
// Recipients: super_admin / operations_manager / admin in the SAME tenant,
// EXCLUDING the editor themselves. Fully tenant-scoped — super_admins (who
// may carry a null tenant) get no notification, and we never reach across
// tenants. Best-effort: any failure is swallowed by the caller's .catch().
// ---------------------------------------------------------------------------

// Human-friendly labels for the self-editable fields, used to build the
// "changed fields" summary. phone + phone_number collapse to "phone".
const FIELD_LABELS: Record<string, string> = {
  nickname: 'nickname',
  phone: 'phone',
  phone_number: 'phone',
  profile_picture_url: 'photo',
  date_of_birth: 'date of birth',
  emergency_contact_name: 'emergency contact',
  emergency_contact_phone: 'emergency contact',
  emergency_contact_relationship: 'emergency contact',
};

async function notifyManagementOfProfileChange(
  editorUserId: string,
  tenantId: string | null,
  editorName: string,
  updateData: Record<string, unknown>
): Promise<void> {
  // Tenant scoping is mandatory — without a tenant we cannot safely pick
  // recipients, so we skip (this only affects tenantless super_admins).
  if (!tenantId) return;

  // Build a short, de-duplicated "changed fields" summary from what was
  // actually present in the update payload (ignore the bookkeeping field).
  const changed = Array.from(
    new Set(
      Object.keys(updateData)
        .filter((k) => k !== 'updated_at' && FIELD_LABELS[k])
        .map((k) => FIELD_LABELS[k])
    )
  );
  const changedSummary = changed.length > 0 ? changed.join(', ') : 'their profile';

  // Recipients: management roles in this tenant, excluding the editor.
  const { data: managers } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('role', ['super_admin', 'operations_manager', 'admin'])
    .neq('id', editorUserId);

  if (!managers || managers.length === 0) return;

  const notifRows = managers.map((m: { id: string }) => ({
    user_id: m.id,
    // 'profile_updated' — a free-form notifications.type event key. The brittle
    // type CHECK was dropped (20260613) since it was never kept in sync with the
    // ~14 types the app inserts; notification_type ('general') carries the category.
    type: 'profile_updated',
    // notification_type has its OWN CHECK constraint (fixed set); 'general' is the
    // safe bucket for this event so the insert is accepted.
    notification_type: 'general',
    title: 'Profile updated',
    message: `${editorName} updated their profile (${changedSummary})`,
    tenant_id: tenantId,
    related_entity_type: 'profile',
    related_entity_id: editorUserId,
    action_url: '/dashboard/admin/team-profiles',
    read: false,
    is_read: false,
  }));

  await supabaseAdmin.from('notifications').insert(notifRows);
}
