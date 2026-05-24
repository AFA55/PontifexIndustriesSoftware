export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/rating-forms/[id]  — single form with all questions
 * PATCH  /api/admin/rating-forms/[id]  — update form (title, description, questions, is_active)
 * DELETE /api/admin/rating-forms/[id]  — soft-delete (set is_active=false)
 *
 * Requires admin, operations_manager, or super_admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';

const VALID_QUESTION_TYPES = ['rating_5', 'rating_10', 'yes_no', 'text'] as const;

function validateQuestions(questions: any[]): string | null {
  if (!Array.isArray(questions)) return 'questions must be an array';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== 'object') return `questions[${i}] must be an object`;
    if (!q.id || typeof q.id !== 'string') return `questions[${i}].id must be a non-empty string`;
    if (!q.text || typeof q.text !== 'string') return `questions[${i}].text must be a non-empty string`;
    if (!VALID_QUESTION_TYPES.includes(q.type)) {
      return `questions[${i}].type must be one of: ${VALID_QUESTION_TYPES.join(', ')}`;
    }
    if (typeof q.required !== 'boolean') return `questions[${i}].required must be a boolean`;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { data, error } = await supabaseAdmin
      .from('rating_forms')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('rating-forms [id] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch rating form' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Rating form not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error in GET rating-forms/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates: Record<string, any> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 });
      }
      updates.title = body.title.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.questions !== undefined) {
      const qError = validateQuestions(body.questions);
      if (qError) return NextResponse.json({ error: qError }, { status: 400 });
      updates.questions = body.questions;
    }

    if (body.target_roles !== undefined) {
      if (!Array.isArray(body.target_roles)) {
        return NextResponse.json({ error: 'target_roles must be an array' }, { status: 400 });
      }
      updates.target_roles = body.target_roles;
    }

    if (body.rater_roles !== undefined) {
      if (!Array.isArray(body.rater_roles)) {
        return NextResponse.json({ error: 'rater_roles must be an array' }, { status: 400 });
      }
      updates.rater_roles = body.rater_roles;
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('rating_forms')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('rating-forms [id] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update rating form' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error in PATCH rating-forms/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { data, error } = await supabaseAdmin
      .from('rating_forms')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('rating-forms [id] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to deactivate rating form' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Rating form not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { id: data.id, is_active: false } });
  } catch (err) {
    console.error('Unexpected error in DELETE rating-forms/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
