/**
 * POST /api/timecard/verify-nfc
 * Verify an NFC tag scan for clock-in purposes.
 * Returns the tag info if valid, or error if not registered/inactive.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          last_scanned_by: user.id,
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
