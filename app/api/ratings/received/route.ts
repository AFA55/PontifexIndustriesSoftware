export const dynamic = 'force-dynamic';

/**
 * GET /api/ratings/received?user_id=<uuid>
 *   Returns ratings received by the specified user.
 *   - Requires admin/ops_manager for other users; requireAuth for self.
 *   - Rater is anonymized to "First L." for privacy.
 *   - Returns: { id, form_title, overall_score, submitted_at, rater_display_name, responses, questions }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const ADMIN_ROLES = ['super_admin', 'admin', 'operations_manager'];

function anonymizeName(fullName: string | null | undefined): string {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + '.';
  const first = parts[0].charAt(0).toUpperCase() + '.';
  const last = parts[parts.length - 1];
  return `${first} ${last}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId!;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('user_id') || auth.userId;

    // Non-admin can only view their own ratings
    if (targetUserId !== auth.userId && !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden. You can only view your own ratings.' },
        { status: 403 }
      );
    }

    // Validate target user is in the same tenant (security check)
    if (targetUserId !== auth.userId) {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, tenant_id')
        .eq('id', targetUserId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!targetProfile) {
        return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 });
      }
    }

    // Fetch submissions received by target user
    const { data: submissions, error } = await supabaseAdmin
      .from('rating_submissions')
      .select(`
        id,
        form_id,
        job_order_id,
        rater_id,
        responses,
        overall_score,
        submitted_at
      `)
      .eq('ratee_id', targetUserId)
      .eq('tenant_id', tenantId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('ratings/received GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 });
    }

    if (!submissions || submissions.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch form details for all unique form_ids
    const formIds = [...new Set(submissions.map((s: any) => s.form_id))];
    const { data: forms } = await supabaseAdmin
      .from('rating_forms')
      .select('id, title, questions')
      .in('id', formIds)
      .eq('tenant_id', tenantId);

    const formMap = new Map((forms || []).map((f: any) => [f.id, f]));

    // Fetch rater profiles for anonymization
    const raterIds = [...new Set(submissions.map((s: any) => s.rater_id))];
    const { data: raters } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', raterIds)
      .eq('tenant_id', tenantId);

    const raterMap = new Map((raters || []).map((r: any) => [r.id, r.full_name]));

    // Fetch job details for context
    const jobIds = [...new Set(submissions.map((s: any) => s.job_order_id).filter(Boolean))];
    let jobMap = new Map<string, any>();
    if (jobIds.length > 0) {
      const { data: jobs } = await supabaseAdmin
        .from('job_orders')
        .select('id, job_number, customer_name')
        .in('id', jobIds)
        .eq('tenant_id', tenantId);
      jobMap = new Map((jobs || []).map((j: any) => [j.id, j]));
    }

    const result = submissions.map((s: any) => {
      const form = formMap.get(s.form_id);
      const raterName = raterMap.get(s.rater_id);
      const job = s.job_order_id ? jobMap.get(s.job_order_id) : null;

      return {
        id: s.id,
        form_id: s.form_id,
        form_title: form?.title || 'Unknown Form',
        questions: form?.questions || [],
        overall_score: s.overall_score,
        submitted_at: s.submitted_at,
        rater_display_name: anonymizeName(raterName),
        responses: s.responses,
        job: job ? { id: job.id, job_number: job.job_number, customer_name: job.customer_name } : null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Unexpected error in GET ratings/received:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
