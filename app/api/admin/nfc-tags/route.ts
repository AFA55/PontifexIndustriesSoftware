/**
 * GET  /api/admin/nfc-tags — List all NFC tags
 * POST /api/admin/nfc-tags — Register a new NFC tag
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';
    const tagType = searchParams.get('type'); // shop | truck | jobsite

    let query = supabaseAdmin
      .from('nfc_tags')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeOnly) query = query.eq('is_active', true);
    if (tagType) query = query.eq('tag_type', tagType);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching NFC tags:', error);
      return NextResponse.json({ error: 'Failed to fetch NFC tags' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/nfc-tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { tag_uid, tag_type, label, truck_number, jobsite_address, operator_id, pontifex_nfc_id } = body;

    if (!tag_uid || !label) {
      return NextResponse.json(
        { error: 'tag_uid and label are required' },
        { status: 400 }
      );
    }

    if (!['shop', 'truck', 'jobsite', 'operator'].includes(tag_type || 'shop')) {
      return NextResponse.json(
        { error: 'tag_type must be shop, truck, jobsite, or operator' },
        { status: 400 }
      );
    }

    // Check for duplicate tag_uid
    const { data: existing } = await supabaseAdmin
      .from('nfc_tags')
      .select('id')
      .eq('tag_uid', tag_uid)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This NFC tag UID is already registered' },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('nfc_tags')
      .insert({
        tag_uid,
        tag_type: tag_type || 'shop',
        label,
        truck_number: truck_number || null,
        jobsite_address: jobsite_address || null,
        registered_by: auth.userId,
        operator_id: operator_id || null,
        pontifex_nfc_id: pontifex_nfc_id || null,
        programmed_at: pontifex_nfc_id ? new Date().toISOString() : null,
        programmed_by: pontifex_nfc_id ? auth.userId : null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error registering NFC tag:', error);
      return NextResponse.json({ error: 'Failed to register NFC tag' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: `NFC tag "${label}" registered successfully`,
    }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/nfc-tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { id, label, is_active, tag_type, truck_number, jobsite_address, operator_id, pontifex_nfc_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof label === 'string') updates.label = label;
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (typeof tag_type === 'string') updates.tag_type = tag_type;
    if (typeof truck_number === 'string') updates.truck_number = truck_number;
    if (typeof jobsite_address === 'string') updates.jobsite_address = jobsite_address;
    if (operator_id !== undefined) updates.operator_id = operator_id || null;
    if (typeof pontifex_nfc_id === 'string') {
      updates.pontifex_nfc_id = pontifex_nfc_id || null;
      updates.programmed_at = new Date().toISOString();
      updates.programmed_by = auth.userId;
    }

    const { data, error } = await supabaseAdmin
      .from('nfc_tags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating NFC tag:', error);
      return NextResponse.json({ error: 'Failed to update NFC tag' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/nfc-tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
