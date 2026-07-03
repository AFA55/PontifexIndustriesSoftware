export const dynamic = 'force-dynamic';
export const maxDuration = 60; // AI translation can take a while

/**
 * API Route: POST /api/hiring/jobs/[id]/translate
 * Body: { language } (e.g. 'es')
 *
 * The founder's #1 improvement over Hireline: creates a linked LANGUAGE
 * VARIANT of the job — a new hiring_jobs row with:
 *   - language = target, parent_job_id = source.id, slug regenerated from
 *     the translated title, status 'draft'
 *   - title / description / ad fields / requirements / benefits /
 *     schedule_text translated via one generateObject call
 *   - all screener questions copied + translated (question + options);
 *     auto_reject flags preserved; auto_reject_answers remapped BY INDEX
 *     against the translated options so the disqualification logic survives
 *     translation exactly.
 *
 * Logs hiring_events 'translated'. Response: { success, data: { job, screeners } }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';
import { generateUniqueJobSlug } from '@/lib/hiring/slug';
import { translateJobContent } from '@/lib/hiring/generate';
import type { HiringScreenerQuestion } from '@/lib/hiring/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const language = String(body?.language || '').trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(language)) {
    return NextResponse.json({ error: 'A valid target language code is required (e.g. "es")' }, { status: 400 });
  }

  try {
    const { data: source } = await supabaseAdmin
      .from('hiring_jobs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!source) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    if (language === source.language) {
      return NextResponse.json(
        { error: `This job is already in "${language}". Pick a different target language.` },
        { status: 400 }
      );
    }

    const { data: sourceScreeners } = await supabaseAdmin
      .from('hiring_screener_questions')
      .select('*')
      .eq('job_id', id)
      .eq('tenant_id', guard.tenantId)
      .order('position', { ascending: true });
    const screeners: HiringScreenerQuestion[] = (sourceScreeners || []) as HiringScreenerQuestion[];

    let translation;
    try {
      translation = await translateJobContent({
        job: source,
        screeners,
        targetLanguage: language,
        tenantId: guard.tenantId,
        userId: guard.userId,
      });
    } catch (err) {
      console.error('hiring translate: AI translation failed', err);
      return NextResponse.json({ error: 'Translation failed. Please try again.' }, { status: 502 });
    }
    const { translated, screenerTranslations } = translation;

    const slug = await generateUniqueJobSlug(translated.title || source.title);

    const { data: variant, error: insertError } = await supabaseAdmin
      .from('hiring_jobs')
      .insert({
        tenant_id: guard.tenantId,
        title: translated.title || source.title,
        description: translated.description || source.description,
        location: source.location,
        status: 'draft',
        slug,
        pay_min: source.pay_min,
        pay_max: source.pay_max,
        pay_period: source.pay_period,
        schedule_text: translated.schedule_text ?? source.schedule_text,
        requirements: translated.requirements,
        benefits: translated.benefits,
        ad_headline: translated.ad_headline ?? source.ad_headline,
        ad_primary_text: translated.ad_primary_text ?? source.ad_primary_text,
        ad_tiktok_caption: translated.ad_tiktok_caption ?? source.ad_tiktok_caption,
        ad_bullets: translated.ad_bullets,
        generation_instructions: source.generation_instructions,
        target_areas: source.target_areas,
        channels: source.channels,
        language,
        parent_job_id: source.id,
        daily_budget: source.daily_budget,
        created_by: guard.userId,
      })
      .select('*')
      .single();

    if (insertError || !variant) {
      console.error('hiring translate: variant insert failed', insertError);
      return NextResponse.json({ error: 'Failed to create translated job' }, { status: 500 });
    }

    // Copy + translate screeners. auto_reject flags preserved;
    // auto_reject_answers remapped by option INDEX so the logic is identical.
    let variantScreeners: any[] = [];
    if (screeners.length > 0) {
      const rows = screeners.map((src, i) => {
        const t = screenerTranslations[i];
        const translatedOptions = t.options;
        const translatedAutoRejectAnswers = (src.auto_reject_answers || []).map((answer) => {
          const idx = (src.options || []).indexOf(answer);
          return idx >= 0 && idx < translatedOptions.length ? translatedOptions[idx] : answer;
        });
        return {
          tenant_id: guard.tenantId,
          job_id: variant.id,
          position: src.position,
          question: t.question,
          qtype: src.qtype,
          options: translatedOptions,
          auto_reject: src.auto_reject,
          auto_reject_answers: translatedAutoRejectAnswers,
          required: src.required,
          is_followup: src.is_followup,
        };
      });

      const { data: inserted, error: screenerError } = await supabaseAdmin
        .from('hiring_screener_questions')
        .insert(rows)
        .select('*');
      if (screenerError) {
        console.error('hiring translate: screener copy failed', screenerError);
        // Non-fatal: the variant job exists; screeners can be re-added in the editor.
      } else {
        variantScreeners = (inserted || []).sort((a, b) => a.position - b.position);
      }
    }

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: variant.id,
      event_type: 'translated',
      actor_id: guard.userId,
      meta: { source_job_id: source.id, source_language: source.language, target_language: language },
    });

    return NextResponse.json(
      { success: true, data: { job: variant, screeners: variantScreeners } },
      { status: 201 }
    );
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id]/translate:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
