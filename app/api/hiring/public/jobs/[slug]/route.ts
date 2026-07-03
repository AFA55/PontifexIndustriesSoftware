export const dynamic = 'force-dynamic';

/**
 * PUBLIC API Route: GET /api/hiring/public/jobs/[slug]   (NO auth)
 *
 * Powers the public apply page (/apply/[slug]). Returns ONLY status='active'
 * jobs, 404 otherwise (draft/paused/closed/deleted all look identical to the
 * outside world).
 *
 * SANITIZED response — explicit pick list. NEVER include: tenant_id, spend,
 * impressions, clicks, daily_budget, generation_instructions, target_areas,
 * created_by, or any billing/markup fields.
 *
 * Screeners: non-followup only, ordered by position, and WITHOUT
 * auto_reject / auto_reject_answers (applicants must not be able to see which
 * answers disqualify them).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select(
        'id, tenant_id, slug, title, description, location, pay_min, pay_max, pay_period, schedule_text, requirements, benefits, ad_headline, ad_bullets, language, status, deleted_at'
      )
      .eq('slug', slug)
      .maybeSingle();

    if (!job || job.status !== 'active' || job.deleted_at) {
      return NextResponse.json({ error: 'This job is not accepting applications' }, { status: 404 });
    }

    // Company display name for the apply page header (branding, not a secret)
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', job.tenant_id)
      .maybeSingle();

    const { data: screenerRows } = await supabaseAdmin
      .from('hiring_screener_questions')
      .select('id, position, question, qtype, options, required')
      .eq('job_id', job.id)
      .eq('is_followup', false)
      .order('position', { ascending: true });

    // Explicit pick lists — the sanitization boundary. Do not spread rows.
    const publicJob = {
      slug: job.slug,
      title: job.title,
      description: job.description,
      location: job.location,
      pay_min: job.pay_min,
      pay_max: job.pay_max,
      pay_period: job.pay_period,
      schedule_text: job.schedule_text,
      requirements: job.requirements,
      benefits: job.benefits,
      ad_headline: job.ad_headline,
      ad_bullets: job.ad_bullets,
      language: job.language,
      company_name: tenant?.name || null,
    };

    const screeners = (screenerRows || []).map((s) => ({
      id: s.id,
      position: s.position,
      question: s.question,
      qtype: s.qtype,
      options: s.options,
      required: s.required,
    }));

    return NextResponse.json({ success: true, data: { job: publicJob, screeners } });
  } catch (err) {
    console.error('Unexpected error in hiring/public/jobs/[slug] GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
