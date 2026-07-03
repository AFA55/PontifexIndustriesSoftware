export const dynamic = 'force-dynamic';

/**
 * API Route: PUT /api/hiring/jobs/[id]/screeners
 * Body: { screeners: [{ question, qtype, options?, auto_reject?,
 *                       auto_reject_answers?, required?, is_followup? }, ...] }
 *
 * FULL REPLACE of the job's screener set (delete + insert in array order).
 *
 * ⚖️ ADEA validation: EVERY question (text + options) runs through
 * containsProhibitedScreenerContent(). Any hit rejects the whole save with a
 * clear error naming the offending question — age-based screening is illegal;
 * the 18+ floor and essential-job-functions questions are the lawful path.
 *
 * Also validates: single_choice needs >=2 options; auto_reject_answers must
 * be a subset of options.
 *
 * Response: { success, data: { screeners } } (the new rows, ordered).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';
import {
  SCREENER_TYPES,
  containsProhibitedScreenerContent,
  type ScreenerType,
} from '@/lib/hiring/types';

const MAX_SCREENERS = 20;

export async function PUT(
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

  if (!Array.isArray(body?.screeners)) {
    return NextResponse.json({ error: 'screeners must be an array' }, { status: 400 });
  }
  if (body.screeners.length > MAX_SCREENERS) {
    return NextResponse.json({ error: `Too many questions (max ${MAX_SCREENERS})` }, { status: 400 });
  }

  try {
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // ---- validate + normalize every question BEFORE touching the DB ----
    const rows: any[] = [];
    for (let i = 0; i < body.screeners.length; i++) {
      const s = body.screeners[i];
      const question = String(s?.question || '').trim();
      if (!question) {
        return NextResponse.json({ error: `Question ${i + 1} is empty` }, { status: 400 });
      }

      const qtype = s?.qtype as ScreenerType;
      if (!SCREENER_TYPES.includes(qtype)) {
        return NextResponse.json(
          { error: `Question ${i + 1} ("${question.slice(0, 60)}"): qtype must be one of ${SCREENER_TYPES.join(', ')}` },
          { status: 400 }
        );
      }

      const options: string[] = Array.isArray(s?.options)
        ? s.options.map((o: unknown) => String(o).trim()).filter(Boolean)
        : [];
      const autoReject = s?.auto_reject === true;
      const autoRejectAnswers: string[] = Array.isArray(s?.auto_reject_answers)
        ? s.auto_reject_answers.map((a: unknown) => String(a).trim()).filter(Boolean)
        : [];

      // ⚖️ ADEA blocklist — question text AND options
      if (containsProhibitedScreenerContent(`${question} ${options.join(' ')}`)) {
        return NextResponse.json(
          {
            error:
              `Question ${i + 1} ("${question.slice(0, 80)}") can't be saved: age-based screening ` +
              `(age, date of birth, birth year) is prohibited under the ADEA. Use capability questions ` +
              `instead — an "Are you 18 or older?" floor or essential-job-functions questions are the lawful equivalents.`,
          },
          { status: 400 }
        );
      }

      if (qtype === 'single_choice') {
        if (options.length < 2) {
          return NextResponse.json(
            { error: `Question ${i + 1} ("${question.slice(0, 60)}"): single-choice questions need at least 2 options` },
            { status: 400 }
          );
        }
        if (autoRejectAnswers.some((a) => !options.includes(a))) {
          return NextResponse.json(
            { error: `Question ${i + 1} ("${question.slice(0, 60)}"): every auto-reject answer must be one of the question's options` },
            { status: 400 }
          );
        }
        if (autoReject && autoRejectAnswers.length === 0) {
          return NextResponse.json(
            { error: `Question ${i + 1} ("${question.slice(0, 60)}"): auto-reject is on but no disqualifying answers were selected` },
            { status: 400 }
          );
        }
        if (autoRejectAnswers.length >= options.length && autoReject) {
          return NextResponse.json(
            { error: `Question ${i + 1} ("${question.slice(0, 60)}"): every option is set to auto-reject — no applicant could pass` },
            { status: 400 }
          );
        }
      }

      rows.push({
        tenant_id: guard.tenantId,
        job_id: id,
        position: i,
        question,
        qtype,
        options: qtype === 'single_choice' ? options : [],
        auto_reject: qtype === 'single_choice' ? autoReject : false,
        auto_reject_answers: qtype === 'single_choice' && autoReject ? autoRejectAnswers : [],
        required: s?.required !== false,
        is_followup: s?.is_followup === true,
      });
    }

    // ---- full replace: delete existing, insert new in order ----
    const { error: deleteError } = await supabaseAdmin
      .from('hiring_screener_questions')
      .delete()
      .eq('job_id', id)
      .eq('tenant_id', guard.tenantId);
    if (deleteError) {
      console.error('hiring screeners PUT: delete failed', deleteError);
      return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 });
    }

    let screeners: any[] = [];
    if (rows.length > 0) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('hiring_screener_questions')
        .insert(rows)
        .select('*');
      if (insertError) {
        console.error('hiring screeners PUT: insert failed', insertError);
        return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 });
      }
      screeners = (inserted || []).sort((a, b) => a.position - b.position);
    }

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: id,
      event_type: 'screeners_updated',
      actor_id: guard.userId,
      meta: { count: rows.length },
    });

    return NextResponse.json({ success: true, data: { screeners } });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id]/screeners PUT:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
