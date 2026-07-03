export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/hiring/jobs/[id]/export
 *
 * CSV download of a job's candidates: name, phone, email, status, applied_at,
 * then one column per screener question (in position order). Responses are
 * matched by question_id; answers to since-deleted questions are ignored in
 * the column layout (they remain visible in the candidate detail view).
 *
 * NOTE: returns raw CSV (Content-Disposition: attachment), NOT the JSON
 * envelope — it's a file download.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin } from '@/lib/hiring/api-guard';

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Always quote; double any embedded quotes. Neutralize formula injection
  // (Excel executes leading = + - @, and tab/CR variants) by prefixing a
  // single quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select('id, title, slug')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const [{ data: screeners }, { data: candidates }] = await Promise.all([
      supabaseAdmin
        .from('hiring_screener_questions')
        .select('id, question, position')
        .eq('job_id', id)
        .eq('tenant_id', guard.tenantId)
        .order('position', { ascending: true }),
      supabaseAdmin
        .from('hiring_candidates')
        .select('id, full_name, phone, email, status, applied_at')
        .eq('job_id', id)
        .eq('tenant_id', guard.tenantId)
        .is('deleted_at', null)
        .order('applied_at', { ascending: false }),
    ]);

    const candidateIds = (candidates || []).map((c) => c.id);
    // answer lookup: candidate_id -> question_id -> answer
    const answersByCandidate: Record<string, Record<string, string>> = {};
    if (candidateIds.length > 0) {
      const { data: responses } = await supabaseAdmin
        .from('hiring_candidate_responses')
        .select('candidate_id, question_id, answer')
        .eq('tenant_id', guard.tenantId)
        .in('candidate_id', candidateIds);
      for (const r of responses || []) {
        if (!r.question_id) continue;
        (answersByCandidate[r.candidate_id] ||= {})[r.question_id] = r.answer;
      }
    }

    const header = [
      'Name',
      'Phone',
      'Email',
      'Status',
      'Applied At',
      ...(screeners || []).map((s) => s.question),
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const c of candidates || []) {
      const row = [
        c.full_name,
        c.phone,
        c.email,
        c.status,
        c.applied_at,
        ...(screeners || []).map((s) => answersByCandidate[c.id]?.[s.id] ?? ''),
      ];
      lines.push(row.map(csvCell).join(','));
    }
    // UTF-8 BOM so Excel opens accented names correctly
    const csv = '\uFEFF' + lines.join('\r\n');

    const filename = `candidates-${job.slug || job.id}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id]/export GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
