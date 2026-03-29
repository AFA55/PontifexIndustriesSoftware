/**
 * POST /api/timecard/verify-nfc
 * Verify an NFC tag scan for clock-in purposes.
 * Returns the tag info if valid, or error if not registered/inactive.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const body = await request.json();
    const { tag_uid, serial_number } = body;

    // Accept either tag_uid (from written data) or serial_number (hardware UID)
    const lookupValue = tag_uid || serial_number;

    if (!lookupValue) {
      return NextResponse.json(
        { error: 'tag_uid or serial_number is required' },
        { status: 400 }
      );
    }

    // Look up the tag
    const { data: tag, error: tagError } = await supabaseAdmin
      .from('nfc_tags')
      .select('*')
      .eq('tag_uid', lookupValue)
      .maybeSingle();

    if (tagError) {
      console.error('Error looking up NFC tag:', tagError);
      return NextResponse.json({ error: 'Failed to verify NFC tag' }, { status: 500 });
    }

    if (!tag) {
      // Fallback: check pontifex_nfc_id
      const { data: tag2, error: tag2Error } = await supabaseAdmin
        .from('nfc_tags')
        .select('*')
        .eq('pontifex_nfc_id', lookupValue)
        .eq('is_active', true)
        .maybeSingle();

      if (tag2Error) {
        console.error('Error looking up NFC tag by pontifex_nfc_id:', tag2Error);
      }

      if (tag2) {
        // Update last scanned info (fire-and-forget)
        Promise.resolve(
          supabaseAdmin
            .from('nfc_tags')
            .update({
              last_scanned_at: new Date().toISOString(),
              last_scanned_by: auth.userId,
            })
            .eq('id', tag2.id)
        ).catch(() => {});

        return NextResponse.json({
          success: true,
          data: {
            tag_id: tag2.id,
            tag_uid: tag2.tag_uid,
            tag_type: tag2.tag_type,
            label: tag2.label,
            truck_number: tag2.truck_number,
            pontifex_nfc_id: tag2.pontifex_nfc_id,
          },
        });
      }

      return NextResponse.json({
        success: false,
        error: 'NFC tag not recognized. This tag is not registered in the system.',
        tag_uid: lookupValue,
      }, { status: 404 });
    }

    if (!tag.is_active) {
      return NextResponse.json({
        success: false,
        error: 'This NFC tag has been deactivated. Contact your supervisor.',
        tag_uid: lookupValue,
      }, { status: 403 });
    }

    // Update last scanned info (fire-and-forget)
    Promise.resolve(
      supabaseAdmin
        .from('nfc_tags')
        .update({
          last_scanned_at: new Date().toISOString(),
          last_scanned_by: auth.userId,
        })
        .eq('id', tag.id)
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        tag_id: tag.id,
        tag_uid: tag.tag_uid,
        tag_type: tag.tag_type,
        label: tag.label,
        truck_number: tag.truck_number,
      },
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/timecard/verify-nfc:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
