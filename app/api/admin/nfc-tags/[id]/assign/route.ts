/**
 * POST /api/admin/nfc-tags/[id]/assign
 * Assign an NFC tag to a specific operator.
 *
 * Body:
 *   operator_id — UUID of the operator to assign (null to unassign)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: tagId } = await params;
    const body = await request.json();
    const { operator_id } = body;

    // Fetch the tag (scoped to tenant)
    let fetchQuery = supabaseAdmin
      .from('nfc_tags')
      .select('id, label, tag_uid, operator_id, is_active')
      .eq('id', tagId);
    if (auth.tenantId) fetchQuery = fetchQuery.eq('tenant_id', auth.tenantId);

    const { data: tag, error: fetchError } = await fetchQuery.maybeSingle();

    if (fetchError || !tag) {
      return NextResponse.json({ error: 'NFC tag not found' }, { status: 404 });
    }

    if (!tag.is_active) {
      return NextResponse.json(
        { error: 'Cannot assign a deactivated NFC tag. Reactivate it first.' },
        { status: 400 }
      );
    }

    // If assigning to an operator, verify the operator exists
    let operatorName: string | null = null;
    if (operator_id) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, role')
        .eq('id', operator_id)
        .single();

      if (!profile) {
        return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
      }
      operatorName = profile.full_name;

      // Check if this operator already has a different tag assigned
      const { data: existingTag } = await supabaseAdmin
        .from('nfc_tags')
        .select('id, label')
        .eq('operator_id', operator_id)
        .neq('id', tagId)
        .eq('is_active', true)
        .maybeSingle();

      if (existingTag) {
        // Unassign the old tag (operators should only have one active tag)
        await supabaseAdmin
          .from('nfc_tags')
          .update({ operator_id: null, updated_at: new Date().toISOString() })
          .eq('id', existingTag.id);
      }
    }

    // Assign the tag
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('nfc_tags')
      .update({
        operator_id: operator_id || null,
        tag_type: operator_id ? 'operator' : tag.tag_uid ? 'shop' : 'shop',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tagId)
      .select()
      .single();

    if (updateError) {
      console.error('Error assigning NFC tag:', updateError);
      return NextResponse.json({ error: 'Failed to assign NFC tag' }, { status: 500 });
    }

    const action = operator_id ? `assigned to ${operatorName || operator_id}` : 'unassigned';

    return NextResponse.json({
      success: true,
      message: `NFC tag "${tag.label}" ${action}`,
      data: updated,
    });
  } catch (error: unknown) {
    console.error('Unexpected error in NFC tag assign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
