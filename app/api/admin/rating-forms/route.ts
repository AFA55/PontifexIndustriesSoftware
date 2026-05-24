export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/rating-forms
 *   List all rating forms for the caller's tenant.
 *   Returns forms with question count.
 *
 * POST /api/admin/rating-forms
 *   Create a new rating form.
 *   Body: { title, description?, target_roles, rater_roles, questions }
 *   Questions: [{ id, text, type: 'rating_5'|'rating_10'|'yes_no'|'text', required }]
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { data, error } = await supabaseAdmin
      .from('rating_forms')
      .select('id, title, description, target_roles, rater_roles, questions, is_active, created_by, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('rating-forms GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch rating forms' }, { status: 500 });
    }

    const forms = (data || []).map((f: any) => ({
      ...f,
      question_count: Array.isArray(f.questions) ? f.questions.length : 0,
    }));

    return NextResponse.json({ success: true, data: forms });
  } catch (err) {
    console.error('Unexpected error in GET rating-forms:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const { title, description, target_roles, rater_roles, questions } = body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!Array.isArray(target_roles) || target_roles.length === 0) {
      return NextResponse.json({ error: 'target_roles must be a non-empty array' }, { status: 400 });
    }
    if (!Array.isArray(rater_roles) || rater_roles.length === 0) {
      return NextResponse.json({ error: 'rater_roles must be a non-empty array' }, { status: 400 });
    }

    const qError = validateQuestions(questions ?? []);
    if (qError) {
      return NextResponse.json({ error: qError }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('rating_forms')
      .insert({
        tenant_id: tenantId,
        title: title.trim(),
        description: description?.trim() || null,
        target_roles,
        rater_roles,
        questions: questions ?? [],
        created_by: auth.userId,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('rating-forms POST error:', error);
      return NextResponse.json({ error: 'Failed to create rating form' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error in POST rating-forms:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
