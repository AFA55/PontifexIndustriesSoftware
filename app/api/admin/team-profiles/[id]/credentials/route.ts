export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/team-profiles/[id]/credentials
 *   Returns compliance credential fields for an operator or apprentice profile.
 *
 * PUT  /api/admin/team-profiles/[id]/credentials
 *   Body: any subset of { medical_card_expiry, drivers_license_expiry,
 *          drivers_license_class, osha_10_expiry, osha_30_expiry, certifications }
 *   - certifications must be an array if present
 *   - Date fields accepted as ISO date strings (YYYY-MM-DD) or null
 *
 * Only `operator` and `apprentice` profiles are accessible via this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const EDITABLE_ROLES = ['operator', 'apprentice'];

const CREDENTIAL_COLUMNS = [
  'medical_card_expiry',
  'drivers_license_expiry',
  'drivers_license_class',
  'osha_10_expiry',
  'osha_30_expiry',
  'certifications',
] as const;

type CredentialKey = (typeof CREDENTIAL_COLUMNS)[number];

type CredentialsShape = {
  medical_card_expiry: string | null;
  drivers_license_expiry: string | null;
  drivers_license_class: string | null;
  osha_10_expiry: string | null;
  osha_30_expiry: string | null;
  certifications: unknown[];
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select(
        'role, medical_card_expiry, drivers_license_expiry, drivers_license_class, osha_10_expiry, osha_30_expiry, certifications'
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('credentials GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!profile.role || !EDITABLE_ROLES.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Credentials are only available for operator and apprentice roles.' },
        { status: 403 }
      );
    }

    const data: CredentialsShape = {
      medical_card_expiry: profile.medical_card_expiry ?? null,
      drivers_license_expiry: profile.drivers_license_expiry ?? null,
      drivers_license_class: profile.drivers_license_class ?? null,
      osha_10_expiry: profile.osha_10_expiry ?? null,
      osha_30_expiry: profile.osha_30_expiry ?? null,
      certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
    };

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error in GET credentials route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    // Verify the profile exists and is an operator/apprentice
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      console.error('credentials PUT fetch error:', fetchErr);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!existing.role || !EDITABLE_ROLES.includes(existing.role)) {
      return NextResponse.json(
        { error: 'Credentials are only available for operator and apprentice roles.' },
        { status: 403 }
      );
    }

    // Build update payload from allowed fields only
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const key of CREDENTIAL_COLUMNS) {
      if (!(key in body)) continue;

      const value = body[key];

      if (key === 'certifications') {
        if (value !== null && !Array.isArray(value)) {
          return NextResponse.json(
            { error: 'certifications must be an array' },
            { status: 400 }
          );
        }
        updatePayload[key] = value ?? [];
        continue;
      }

      if (key === 'drivers_license_class') {
        if (value !== null && typeof value !== 'string') {
          return NextResponse.json(
            { error: 'drivers_license_class must be a string or null' },
            { status: 400 }
          );
        }
        updatePayload[key] = value ?? '';
        continue;
      }

      // Date fields — accept ISO date string or null
      if (value !== null && typeof value !== 'string') {
        return NextResponse.json(
          { error: `${key} must be an ISO date string (YYYY-MM-DD) or null` },
          { status: 400 }
        );
      }
      updatePayload[key] = value;
    }

    if (Object.keys(updatePayload).length === 1) {
      // Only updated_at — nothing substantive was provided
      return NextResponse.json(
        { error: 'Provide at least one credential field to update' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) {
      console.error('credentials PUT update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update credentials' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error in PUT credentials route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
