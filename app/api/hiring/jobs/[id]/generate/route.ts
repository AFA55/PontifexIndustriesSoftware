export const dynamic = 'force-dynamic';
export const maxDuration = 60; // AI generation can take a while

/**
 * API Route: POST /api/hiring/jobs/[id]/generate
 *
 * The core AI feature: reads the job row (title + description +
 * generation_instructions + language) and generates the full ad kit
 * (headline, FB/IG primary text, TikTok caption, checkmark bullets,
 * requirements, benefits, pay band if inferable, schedule) plus 4-6
 * suggested screener questions.
 *
 * Screener handling:
 *  - Every suggestion is run through containsProhibitedScreenerContent()
 *    (ADEA blocklist) inside generateAdKit — failures are dropped.
 *  - If the job has ZERO screeners, the safe suggestions are inserted as the
 *    job's screener set. Otherwise the existing screeners are left untouched
 *    and the suggestions are returned as data.suggestions for the UI to offer.
 *
 * Response: { success, data: { job, screeners, suggestions } }
 *   - job: the updated job row (ad fields written)
 *   - screeners: the job's CURRENT screener rows (post-insert if seeded)
 *   - suggestions: the safe suggestions (always returned, [] when seeded)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';
import { generateAdKit } from '@/lib/hiring/generate';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    if (!job.title?.trim()) {
      return NextResponse.json({ error: 'Job needs a title before generating' }, { status: 400 });
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', guard.tenantId)
      .maybeSingle();
    const tenantName = tenant?.name || 'our company';

    let kitResult;
    try {
      kitResult = await generateAdKit({
        job,
        tenantName,
        tenantId: guard.tenantId,
        userId: guard.userId,
      });
    } catch (err) {
      console.error('hiring generate: AI generation failed', err);
      return NextResponse.json(
        { error: 'Ad generation failed. Please try again.' },
        { status: 502 }
      );
    }
    const { kit, safeScreeners } = kitResult;

    // Write the generated ad kit onto the job row. Pay/schedule only when the
    // model actually inferred something (never blank out a manual entry with null).
    const updates: Record<string, unknown> = {
      ad_headline: kit.ad_headline,
      ad_primary_text: kit.ad_primary_text,
      ad_tiktok_caption: kit.ad_tiktok_caption,
      ad_bullets: kit.ad_bullets,
      requirements: kit.requirements,
      benefits: kit.benefits,
    };
    if (kit.schedule_text) updates.schedule_text = kit.schedule_text;
    if (kit.pay_min !== null) updates.pay_min = kit.pay_min;
    if (kit.pay_max !== null) updates.pay_max = kit.pay_max;
    if (kit.pay_period !== null) updates.pay_period = kit.pay_period;

    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('hiring_jobs')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .select('*')
      .single();

    if (updateError || !updatedJob) {
      console.error('hiring generate: job update failed', updateError);
      return NextResponse.json({ error: 'Failed to save generated ad kit' }, { status: 500 });
    }

    // Seed screeners ONLY if the job has none yet — never clobber an edited set.
    const { count: existingCount } = await supabaseAdmin
      .from('hiring_screener_questions')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', id)
      .eq('tenant_id', guard.tenantId);

    let suggestions = safeScreeners;
    let seeded = false;
    if ((existingCount ?? 0) === 0 && safeScreeners.length > 0) {
      const rows = safeScreeners.map((s, i) => ({
        tenant_id: guard.tenantId,
        job_id: id,
        position: i,
        question: s.question,
        qtype: s.qtype,
        options: s.options,
        auto_reject: s.auto_reject,
        auto_reject_answers: s.auto_reject_answers,
        required: true,
        is_followup: false,
      }));
      const { error: insertError } = await supabaseAdmin
        .from('hiring_screener_questions')
        .insert(rows);
      if (insertError) {
        console.error('hiring generate: screener seed failed', insertError);
        // Non-fatal — ad kit is saved; surface the suggestions instead.
      } else {
        suggestions = [];
        seeded = true;
      }
    }

    const { data: screeners } = await supabaseAdmin
      .from('hiring_screener_questions')
      .select('*')
      .eq('job_id', id)
      .eq('tenant_id', guard.tenantId)
      .order('position', { ascending: true });

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: id,
      event_type: 'ad_generated',
      actor_id: guard.userId,
      meta: { seeded_screeners: seeded, suggested: safeScreeners.length },
    });

    return NextResponse.json({
      success: true,
      data: { job: updatedJob, screeners: screeners || [], suggestions },
    });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id]/generate:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
