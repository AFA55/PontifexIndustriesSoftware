export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/hiring/jobs/[id]/duplicate
 *
 * Copies a job + its screeners into a new draft: "(Copy)" suffix on the
 * title, slug regenerated, funnel/spend counters reset (a duplicate is a new
 * campaign). This is the duplicate button Hireline lacks (support-confirmed).
 *
 * Response: { success, data: { job } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';
import { generateUniqueJobSlug } from '@/lib/hiring/slug';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const { data: source } = await supabaseAdmin
      .from('hiring_jobs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!source) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const title = `${source.title} (Copy)`.slice(0, 200);
    const slug = await generateUniqueJobSlug(title);

    const { data: copy, error: insertError } = await supabaseAdmin
      .from('hiring_jobs')
      .insert({
        tenant_id: guard.tenantId,
        title,
        description: source.description,
        location: source.location,
        status: 'draft',
        slug,
        pay_min: source.pay_min,
        pay_max: source.pay_max,
        pay_period: source.pay_period,
        schedule_text: source.schedule_text,
        requirements: source.requirements,
        benefits: source.benefits,
        ad_headline: source.ad_headline,
        ad_primary_text: source.ad_primary_text,
        ad_tiktok_caption: source.ad_tiktok_caption,
        ad_bullets: source.ad_bullets,
        generation_instructions: source.generation_instructions,
        target_areas: source.target_areas,
        channels: source.channels,
        language: source.language,
        daily_budget: source.daily_budget,
        created_by: guard.userId,
      })
      .select('*')
      .single();

    if (insertError || !copy) {
      console.error('hiring duplicate: insert failed', insertError);
      return NextResponse.json({ error: 'Failed to duplicate job' }, { status: 500 });
    }

    // Copy screeners verbatim
    const { data: screeners } = await supabaseAdmin
      .from('hiring_screener_questions')
      .select('*')
      .eq('job_id', id)
      .eq('tenant_id', guard.tenantId)
      .order('position', { ascending: true });

    if (screeners && screeners.length > 0) {
      const rows = screeners.map((s) => ({
        tenant_id: guard.tenantId,
        job_id: copy.id,
        position: s.position,
        question: s.question,
        qtype: s.qtype,
        options: s.options,
        auto_reject: s.auto_reject,
        auto_reject_answers: s.auto_reject_answers,
        required: s.required,
        is_followup: s.is_followup,
      }));
      const { error: screenerError } = await supabaseAdmin
        .from('hiring_screener_questions')
        .insert(rows);
      if (screenerError) {
        console.error('hiring duplicate: screener copy failed', screenerError);
        // Non-fatal — job copy exists.
      }
    }

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: copy.id,
      event_type: 'duplicated',
      actor_id: guard.userId,
      meta: { source_job_id: source.id },
    });

    return NextResponse.json({ success: true, data: { job: copy } }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id]/duplicate:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
