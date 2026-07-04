export const dynamic = 'force-dynamic';

/**
 * API Route: /api/hiring/jobs/[id]
 *  GET   — job detail: { job, screeners (ordered by position), stats }.
 *  PATCH — edit an allowlisted set of job fields (title, description, status,
 *          ad kit fields, targeting, manual funnel numbers, ...).
 *
 * Auth: requireHiringAdmin. Tenant isolation via explicit tenant_id filters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin } from '@/lib/hiring/api-guard';
import { settleHiringBalance } from '@/lib/hiring/settle';
import {
  AD_CHANNELS,
  HIRING_JOB_STATUSES,
  type AdChannel,
  type HiringJobStatus,
} from '@/lib/hiring/types';

const PAY_PERIODS = ['hour', 'year', 'week', 'day', 'project'] as const;

async function fetchJob(tenantId: string, jobId: string) {
  const { data } = await supabaseAdmin
    .from('hiring_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const job = await fetchJob(guard.tenantId, id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const [{ data: screeners }, { data: candidateRows }] = await Promise.all([
      supabaseAdmin
        .from('hiring_screener_questions')
        .select('*')
        .eq('job_id', id)
        .eq('tenant_id', guard.tenantId)
        .order('position', { ascending: true }),
      supabaseAdmin
        .from('hiring_candidates')
        .select('status')
        .eq('job_id', id)
        .eq('tenant_id', guard.tenantId)
        .is('deleted_at', null),
    ]);

    const stats = { unreviewed: 0, shortlisted: 0, rejected: 0 };
    for (const c of candidateRows || []) {
      if (c.status in stats) stats[c.status as keyof typeof stats] += 1;
    }

    return NextResponse.json({
      success: true,
      data: { job, screeners: screeners || [], stats },
    });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id] GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

  try {
    const existing = await fetchJob(guard.tenantId, id);
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};

    // --- plain text fields ---
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return NextResponse.json({ error: 'Job title cannot be empty' }, { status: 400 });
      if (title.length > 200) return NextResponse.json({ error: 'Job title is too long (max 200 characters)' }, { status: 400 });
      updates.title = title;
    }
    if (body.description !== undefined) updates.description = String(body.description);
    for (const field of ['location', 'schedule_text', 'ad_headline', 'ad_primary_text', 'ad_tiktok_caption', 'generation_instructions'] as const) {
      if (body[field] !== undefined) {
        updates[field] = body[field] === null ? null : String(body[field]);
      }
    }

    // --- status ---
    if (body.status !== undefined) {
      if (!HIRING_JOB_STATUSES.includes(body.status as HiringJobStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${HIRING_JOB_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    // --- numeric fields (non-negative) ---
    for (const field of ['pay_min', 'pay_max', 'daily_budget', 'total_spend'] as const) {
      if (body[field] !== undefined) {
        if (body[field] === null) {
          if (field !== 'total_spend') updates[field] = null; // total_spend is NOT NULL
          continue;
        }
        const n = Number(body[field]);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
        }
        updates[field] = n;
      }
    }
    for (const field of ['impressions', 'clicks'] as const) {
      if (body[field] !== undefined) {
        const n = Number(body[field]);
        if (!Number.isInteger(n) || n < 0) {
          return NextResponse.json({ error: `${field} must be a non-negative integer` }, { status: 400 });
        }
        updates[field] = n;
      }
    }

    // --- pay_period ---
    if (body.pay_period !== undefined) {
      if (body.pay_period !== null && !PAY_PERIODS.includes(body.pay_period)) {
        return NextResponse.json(
          { error: `Invalid pay_period. Must be one of: ${PAY_PERIODS.join(', ')}` },
          { status: 400 }
        );
      }
      updates.pay_period = body.pay_period;
    }

    // --- string-array fields ---
    for (const field of ['requirements', 'benefits', 'ad_bullets', 'target_areas'] as const) {
      if (body[field] !== undefined) {
        if (!Array.isArray(body[field]) || !body[field].every((v: unknown) => typeof v === 'string')) {
          return NextResponse.json({ error: `${field} must be an array of strings` }, { status: 400 });
        }
        updates[field] = body[field];
      }
    }

    // --- channels ---
    if (body.channels !== undefined) {
      if (
        !Array.isArray(body.channels) ||
        !body.channels.every((c: unknown) => AD_CHANNELS.includes(c as AdChannel))
      ) {
        return NextResponse.json(
          { error: `channels must be an array drawn from: ${AD_CHANNELS.join(', ')}` },
          { status: 400 }
        );
      }
      updates.channels = body.channels;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const { data: job, error } = await supabaseAdmin
      .from('hiring_jobs')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .select('*')
      .single();

    if (error || !job) {
      console.error('hiring/jobs/[id] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    // ── Billing settle hook (active → paused/closed only) ─────────────────
    // Plan §5.1: when the tenant's LAST active job pauses/closes, collect the
    // outstanding balance regardless of threshold. Fire-and-forget — must
    // never delay or fail the PATCH response. All money semantics live in
    // settleHiringBalance (lib/hiring/settle.ts).
    if (existing.status === 'active' && (job.status === 'paused' || job.status === 'closed')) {
      Promise.resolve(
        supabaseAdmin
          .from('hiring_jobs')
          .select('id')
          .eq('tenant_id', guard.tenantId)
          .eq('status', 'active')
          .is('deleted_at', null)
          .limit(1)
      )
        .then(({ data: stillActive }) => {
          if (stillActive && stillActive.length > 0) return; // other jobs still running
          return settleHiringBalance(guard.tenantId, {
            trigger: 'jobs_paused',
            actorId: guard.userId,
          }).then(() => undefined);
        })
        .catch(() => {});
    }
    // ── end billing settle hook ────────────────────────────────────────────

    return NextResponse.json({ success: true, data: { job } });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id] PATCH:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
