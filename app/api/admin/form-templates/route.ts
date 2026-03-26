/**
 * API Route: GET/POST /api/admin/form-templates
 * List and create form templates (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const formType = searchParams.get('form_type');
    const isActive = searchParams.get('is_active');

    let query = supabaseAdmin
      .from('form_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (formType) {
      query = query.eq('form_type', formType);
    }

    if (isActive !== null && isActive !== undefined && isActive !== '') {
      query = query.eq('is_active', isActive === 'true');
    } else {
      // Default: only show active templates
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching form templates:', error);
      return NextResponse.json({ error: 'Failed to fetch form templates' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in form templates GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { name, description, form_type, fields, requires_signature } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    if (!form_type || !['pre_work', 'post_work', 'custom'].includes(form_type)) {
      return NextResponse.json({ error: 'Valid form_type is required (pre_work, post_work, custom)' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('form_templates')
      .insert({
        name: name.trim(),
        description: description || null,
        form_type,
        fields: fields || [],
        requires_signature: requires_signature !== false,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating form template:', error);
      return NextResponse.json({ error: 'Failed to create form template' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in form templates POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
