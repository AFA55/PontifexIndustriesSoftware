export const dynamic = 'force-dynamic';

/**
 * POST /api/ratings
 *   Submit a peer rating.
 *   Body: { form_id, ratee_id, job_order_id?, responses }
 *
 *   Validates:
 *   - rater !== ratee
 *   - ratee exists in same tenant
 *   - form is active
 *   - form.rater_roles includes caller's role
 *   - Computes overall_score = average of all numeric responses
 *   - Returns 409 if already submitted this form+rater+ratee+job combo
 *
 * Requires any authenticated user (requireAuth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId!;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { form_id, ratee_id, job_order_id, responses } = body || {};

    if (!form_id || typeof form_id !== 'string') {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
    }
    if (!ratee_id || typeof ratee_id !== 'string') {
      return NextResponse.json({ error: 'ratee_id is required' }, { status: 400 });
    }
    if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
      return NextResponse.json({ error: 'responses must be an object' }, { status: 400 });
    }

    // Cannot rate yourself
    if (ratee_id === auth.userId) {
      return NextResponse.json({ error: 'You cannot rate yourself' }, { status: 400 });
    }

    // Validate ratee exists in same tenant
    const { data: rateeProfile, error: rateeError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, tenant_id')
      .eq('id', ratee_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (rateeError || !rateeProfile) {
      return NextResponse.json({ error: 'Ratee not found in your organization' }, { status: 404 });
    }

    // Validate form is active and in tenant
    const { data: form, error: formError } = await supabaseAdmin
      .from('rating_forms')
      .select('id, title, rater_roles, target_roles, questions, is_active, tenant_id')
      .eq('id', form_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (formError || !form) {
      return NextResponse.json({ error: 'Rating form not found' }, { status: 404 });
    }
    if (!form.is_active) {
      return NextResponse.json({ error: 'This rating form is no longer active' }, { status: 400 });
    }

    // Validate caller's role is in rater_roles
    const raterRoles: string[] = Array.isArray(form.rater_roles) ? form.rater_roles : [];
    if (!raterRoles.includes(auth.role)) {
      return NextResponse.json(
        { error: `Your role (${auth.role}) is not permitted to submit this form` },
        { status: 403 }
      );
    }

    // Validate ratee's role is in target_roles
    const targetRoles: string[] = Array.isArray(form.target_roles) ? form.target_roles : [];
    if (!targetRoles.includes(rateeProfile.role)) {
      return NextResponse.json(
        { error: `This form is not designed to rate a ${rateeProfile.role}` },
        { status: 400 }
      );
    }

    // Check for duplicate submission
    let dupQuery = supabaseAdmin
      .from('rating_submissions')
      .select('id')
      .eq('form_id', form_id)
      .eq('rater_id', auth.userId)
      .eq('ratee_id', ratee_id);

    if (job_order_id) {
      dupQuery = dupQuery.eq('job_order_id', job_order_id);
    } else {
      dupQuery = dupQuery.is('job_order_id', null);
    }

    const { data: existing } = await dupQuery.maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'You have already submitted a rating for this person on this job' },
        { status: 409 }
      );
    }

    // Compute overall_score = average of all numeric (rating_5 / rating_10) question responses
    const questions: any[] = Array.isArray(form.questions) ? form.questions : [];
    const numericQuestions = questions.filter((q: any) =>
      q.type === 'rating_5' || q.type === 'rating_10'
    );

    let overallScore: number | null = null;
    if (numericQuestions.length > 0) {
      const numericValues: number[] = [];
      for (const q of numericQuestions) {
        const val = responses[q.id];
        if (typeof val === 'number' && !isNaN(val)) {
          // Normalize to 0–10 scale for consistent storage
          const max = q.type === 'rating_5' ? 5 : 10;
          numericValues.push((val / max) * 10);
        }
      }
      if (numericValues.length > 0) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        overallScore = Math.round(avg * 100) / 100;
      }
    }

    const { data: submission, error: insertError } = await supabaseAdmin
      .from('rating_submissions')
      .insert({
        tenant_id: tenantId,
        form_id,
        job_order_id: job_order_id || null,
        rater_id: auth.userId,
        ratee_id,
        responses,
        overall_score: overallScore,
      })
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'You have already submitted a rating for this person on this job' },
          { status: 409 }
        );
      }
      console.error('rating POST insert error:', insertError);
      return NextResponse.json({ error: 'Failed to submit rating' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: submission }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error in POST /api/ratings:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
