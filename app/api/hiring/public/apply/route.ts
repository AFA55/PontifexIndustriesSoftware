export const dynamic = 'force-dynamic';

/**
 * PUBLIC API Route: POST /api/hiring/public/apply   (NO auth)
 * Body: { slug, full_name, phone?, email?, answers: [{question_id, answer}],
 *         resume_path?, language? }
 *
 * The public application submit:
 *  - light in-memory rate limit (10/min per IP)
 *  - job must be active (else 404 — same shape as the public GET)
 *  - every required non-followup screener must be answered
 *  - auto-reject evaluation: if any auto_reject question's answer is in its
 *    auto_reject_answers, the candidate is created with status 'rejected' +
 *    auto_rejected=true. The RESPONSE NEVER reveals this — the applicant sees
 *    the same "thanks for applying" either way (data.autoRejected is consumed
 *    by the UI only for analytics-free thank-you copy; keep it out of the page).
 *  - responses stored with denormalized question_text
 *  - hiring_events 'submitted_application' + fire-and-forget bell
 *    notification to the tenant's hiring admins
 *
 * Response: { success, data: { candidateId, autoRejected } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logHiringEvent } from '@/lib/hiring/api-guard';
import { HIRING_ADMIN_ROLES } from '@/lib/hiring/types';

// ---------------------------------------------------------------------------
// In-memory rate limiter (per serverless instance — light abuse protection,
// not a hard guarantee; matches the "lightly" requirement).
// ---------------------------------------------------------------------------
const RATE_LIMIT = 10; // submissions
const RATE_WINDOW_MS = 60_000; // per minute
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  // opportunistic cleanup so the map can't grow unbounded
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

const MAX_ANSWER_LEN = 4000;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = String(body?.slug || '').trim();
  const fullName = String(body?.full_name || '').trim().slice(0, 200);
  const phone = body?.phone ? String(body.phone).trim().slice(0, 40) : null;
  const email = body?.email ? String(body.email).trim().toLowerCase().slice(0, 200) : null;
  const resumePath = body?.resume_path ? String(body.resume_path).trim().slice(0, 500) : null;
  const answersInput: { question_id?: unknown; answer?: unknown }[] = Array.isArray(body?.answers)
    ? body.answers
    : [];

  if (!slug) return NextResponse.json({ error: 'Job link is invalid' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
  if (!phone && !email) {
    return NextResponse.json({ error: 'A phone number or email is required so we can contact you' }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That email address doesn\'t look right' }, { status: 400 });
  }

  try {
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select('id, tenant_id, title, status, language, deleted_at')
      .eq('slug', slug)
      .maybeSingle();

    if (!job || job.status !== 'active' || job.deleted_at) {
      return NextResponse.json({ error: 'This job is not accepting applications' }, { status: 404 });
    }

    const { data: screeners } = await supabaseAdmin
      .from('hiring_screener_questions')
      .select('id, question, qtype, options, auto_reject, auto_reject_answers, required, is_followup')
      .eq('job_id', job.id)
      .eq('is_followup', false);
    const screenerById = new Map((screeners || []).map((s) => [s.id, s]));

    // Only accept answers to THIS job's screeners; normalize + cap length.
    const answerByQuestion = new Map<string, string>();
    for (const a of answersInput) {
      const qid = String(a?.question_id || '');
      if (!screenerById.has(qid)) continue;
      answerByQuestion.set(qid, String(a?.answer ?? '').trim().slice(0, MAX_ANSWER_LEN));
    }

    // Required questions must be answered
    for (const s of screeners || []) {
      if (s.required && !answerByQuestion.get(s.id)) {
        return NextResponse.json(
          { error: `Please answer: "${String(s.question).slice(0, 120)}"` },
          { status: 400 }
        );
      }
    }

    // Auto-reject evaluation (single_choice answers matched exactly)
    let autoRejected = false;
    for (const s of screeners || []) {
      if (!s.auto_reject) continue;
      const answer = answerByQuestion.get(s.id);
      if (answer && Array.isArray(s.auto_reject_answers) && s.auto_reject_answers.includes(answer)) {
        autoRejected = true;
        break;
      }
    }

    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('hiring_candidates')
      .insert({
        tenant_id: job.tenant_id,
        job_id: job.id,
        full_name: fullName,
        phone,
        email,
        status: autoRejected ? 'rejected' : 'unreviewed',
        auto_rejected: autoRejected,
        resume_url: resumePath,
        language: body?.language ? String(body.language).trim().toLowerCase().slice(0, 10) : job.language,
        source: 'apply_page',
      })
      .select('id')
      .single();

    if (candidateError || !candidate) {
      console.error('hiring apply: candidate insert failed', candidateError);
      return NextResponse.json({ error: 'Something went wrong submitting your application. Please try again.' }, { status: 500 });
    }

    // Responses with denormalized question_text (readable even if the
    // question is later edited/deleted)
    if (answerByQuestion.size > 0) {
      const responseRows = Array.from(answerByQuestion.entries()).map(([qid, answer]) => ({
        tenant_id: job.tenant_id,
        candidate_id: candidate.id,
        question_id: qid,
        question_text: screenerById.get(qid)?.question || '',
        answer,
      }));
      const { error: responsesError } = await supabaseAdmin
        .from('hiring_candidate_responses')
        .insert(responseRows);
      if (responsesError) {
        // Keep the candidate; log loudly — answers matter for review.
        console.error('hiring apply: responses insert failed', responsesError);
      }
    }

    logHiringEvent({
      tenant_id: job.tenant_id,
      job_id: job.id,
      candidate_id: candidate.id,
      event_type: 'submitted_application',
      meta: { auto_rejected: autoRejected, source: 'apply_page' },
    });

    // Fire-and-forget bell notification to the tenant's hiring admins
    // (same pattern as access-requests). Skip for auto-rejected applicants.
    if (!autoRejected) {
      Promise.resolve(
        supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', job.tenant_id)
          .in('role', HIRING_ADMIN_ROLES)
      )
        .then(({ data: admins }) => {
          if (!admins || admins.length === 0) return;
          const rows = admins.map((p: { id: string }) => ({
            user_id: p.id,
            type: 'hiring_application',
            notification_type: 'general',
            title: 'New job applicant',
            message: `${fullName} applied for ${job.title}.`,
            tenant_id: job.tenant_id,
            read: false,
            is_read: false,
            action_url: `/dashboard/hiring/jobs/${job.id}`,
            metadata: {
              candidate_id: candidate.id,
              job_id: job.id,
              candidate_name: fullName,
            },
          }));
          return supabaseAdmin.from('notifications').insert(rows);
        })
        .catch(() => {});
    }

    // The applicant sees the same thank-you either way — the UI must NEVER
    // surface auto-rejection to them.
    return NextResponse.json(
      { success: true, data: { candidateId: candidate.id, autoRejected } },
      { status: 201 }
    );
  } catch (err) {
    console.error('Unexpected error in hiring/public/apply POST:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
