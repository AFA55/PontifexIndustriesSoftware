export const dynamic = 'force-dynamic';

/**
 * GET /api/ratings/pending
 *   Returns list of coworkers the caller has worked with but hasn't rated yet
 *   for the most recent job together (past 30 days).
 *
 *   Logic:
 *   1. Find jobs where caller was assigned (assigned_to OR helper_assigned_to)
 *      in the last 30 days with status = completed.
 *   2. For each job, identify the "other person" (operator or helper).
 *   3. Find active rating forms where caller's role is in rater_roles and
 *      the coworker's role is in target_roles.
 *   4. Filter out pairs where a submission already exists in the last 30 days.
 *
 *   Returns: [{ ratee: { id, name, role }, job: { id, job_number, scheduled_date, customer_name }, form_id, form_title }]
 *
 *   Returns empty array (not error) if no forms exist or no pending ratings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId!;
    const userId = auth.userId;
    const userRole = auth.role;

    // 1. Find active rating forms where caller's role can rate others
    const { data: forms, error: formsError } = await supabaseAdmin
      .from('rating_forms')
      .select('id, title, rater_roles, target_roles')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (formsError) {
      console.error('ratings/pending forms error:', formsError);
      return NextResponse.json({ error: 'Failed to fetch forms' }, { status: 500 });
    }

    // Filter to forms where this user's role can be a rater
    const eligibleForms = (forms || []).filter((f: any) =>
      Array.isArray(f.rater_roles) && f.rater_roles.includes(userRole)
    );

    if (eligibleForms.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. Find completed jobs in past 30 days where caller was assigned
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, scheduled_date, assigned_to, helper_assigned_to')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('scheduled_date', cutoff)
      .or(`assigned_to.eq.${userId},helper_assigned_to.eq.${userId}`);

    if (jobsError) {
      console.error('ratings/pending jobs error:', jobsError);
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 3. Build (coworker_id, job_id) pairs
    const coworkerPairs: Array<{ coworkerId: string; jobId: string; job: any }> = [];
    for (const job of jobs) {
      // The "other person" on the job
      if (job.assigned_to && job.assigned_to !== userId) {
        coworkerPairs.push({ coworkerId: job.assigned_to, jobId: job.id, job });
      }
      if (job.helper_assigned_to && job.helper_assigned_to !== userId) {
        coworkerPairs.push({ coworkerId: job.helper_assigned_to, jobId: job.id, job });
      }
    }

    if (coworkerPairs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 4. Fetch coworker profiles
    const coworkerIds = [...new Set(coworkerPairs.map((p) => p.coworkerId))];
    const { data: coworkers, error: cowErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .in('id', coworkerIds)
      .eq('tenant_id', tenantId);

    if (cowErr) {
      console.error('ratings/pending coworkers error:', cowErr);
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    const coworkerMap = new Map((coworkers || []).map((c: any) => [c.id, c]));

    // 5. Fetch existing submissions in past 30 days (rater = current user)
    const { data: existingSubmissions } = await supabaseAdmin
      .from('rating_submissions')
      .select('form_id, ratee_id, job_order_id')
      .eq('rater_id', userId)
      .eq('tenant_id', tenantId)
      .gte('submitted_at', thirtyDaysAgo.toISOString());

    // Build a set of already-rated combos: "form_id:ratee_id:job_id"
    const ratedSet = new Set<string>();
    for (const s of existingSubmissions || []) {
      ratedSet.add(`${s.form_id}:${s.ratee_id}:${s.job_order_id || 'null'}`);
    }

    // 6. Build pending list — deduplicate by (coworkerId, formId, jobId)
    const seen = new Set<string>();
    const pending: any[] = [];

    for (const pair of coworkerPairs) {
      const coworker = coworkerMap.get(pair.coworkerId);
      if (!coworker) continue;

      // Find a form that applies to this coworker's role
      for (const form of eligibleForms) {
        const targetRoles: string[] = Array.isArray(form.target_roles) ? form.target_roles : [];
        if (!targetRoles.includes(coworker.role)) continue;

        const comboKey = `${form.id}:${pair.coworkerId}:${pair.jobId}`;
        const ratedKey = `${form.id}:${pair.coworkerId}:${pair.jobId}`;

        if (ratedSet.has(ratedKey)) continue;
        if (seen.has(comboKey)) continue;
        seen.add(comboKey);

        pending.push({
          ratee: {
            id: coworker.id,
            name: coworker.full_name,
            role: coworker.role,
          },
          job: {
            id: pair.job.id,
            job_number: pair.job.job_number,
            scheduled_date: pair.job.scheduled_date,
            customer_name: pair.job.customer_name,
          },
          form_id: form.id,
          form_title: form.title,
        });
      }
    }

    // Sort by job date descending (most recent first)
    pending.sort((a, b) =>
      (b.job.scheduled_date || '').localeCompare(a.job.scheduled_date || '')
    );

    return NextResponse.json({ success: true, data: pending });
  } catch (err) {
    console.error('Unexpected error in GET ratings/pending:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
