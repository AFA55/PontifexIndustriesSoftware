/**
 * API Route: POST /api/equipment-units/[id]/pair-nfc
 * Pair an NFC tag to an equipment unit (admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id } = await params;
    const body = await request.json();

    if (!body.nfc_tag_id || typeof body.nfc_tag_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: nfc_tag_id (string)' },
        { status: 400 }
      );
    }

    const nfcTagId = body.nfc_tag_id.trim();

    if (nfcTagId.length === 0) {
      return NextResponse.json(
        { error: 'nfc_tag_id must not be empty' },
        { status: 400 }
      );
    }

    // Verify the target unit exists (tenant-scoped)
    let unitQuery = supabaseAdmin.from('equipment_units').select('id, name, nfc_tag_id').eq('id', id);
    if (tenantId) unitQuery = unitQuery.eq('tenant_id', tenantId);
    const { data: unit, error: unitError } = await unitQuery.single();

    if (unitError || !unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // Check for uniqueness: no other unit should already have this NFC tag
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('equipment_units')
      .select('id, name')
      .eq('nfc_tag_id', nfcTagId)
      .neq('id', id)
      .maybeSingle();

    if (checkError) {
      console.error('[pair-nfc POST] Uniqueness check error:', checkError);
      return NextResponse.json(
        { error: 'Failed to verify NFC tag uniqueness' },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: 'This NFC tag is already paired to another unit' },
        { status: 409 }
      );
    }

    // Update the unit's nfc_tag_id
    const { data: updatedUnit, error: updateError } = await supabaseAdmin
      .from('equipment_units')
      .update({
        nfc_tag_id: nfcTagId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[pair-nfc POST] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to pair NFC tag' },
        { status: 500 }
      );
    }

    // Create 'nfc_paired' event
    const { error: eventError } = await supabaseAdmin
      .from('unit_events')
      .insert({
        unit_id: id,
        event_type: 'nfc_paired',
        performed_by: auth.userId,
        description: `NFC tag "${nfcTagId}" paired to unit "${unit.name}"`,
        metadata: {
          nfc_tag_id: nfcTagId,
          previous_nfc_tag_id: unit.nfc_tag_id || null,
        },
      });

    if (eventError) {
      console.error('[pair-nfc POST] Event creation error:', eventError);
      // Non-fatal
    }

    return NextResponse.json(
      { success: true, data: updatedUnit },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[pair-nfc POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
