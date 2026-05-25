export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/operator/daily-report
 *
 * GET  ?date=YYYY-MM-DD  — load the operator's report for that date (default: today local)
 * POST                   — upsert (auto-save draft or final submit)
 *
 * Allowed roles: operator, apprentice, shop_help, shop_manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_ROLES = ['operator', 'apprentice', 'shop_help', 'shop_manager'];

function validateDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!ALLOWED_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = auth.tenantId!;
  const { searchParams } = new URL(request.url);
  const reportDate = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (!validateDate(reportDate)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('operator_daily_reports')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('operator_id', auth.userId)
    .eq('date', reportDate)
    .maybeSingle();

  if (error) {
    console.error('[daily-report GET]', error);
    return NextResponse.json({ error: 'Failed to load report.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!ALLOWED_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = auth.tenantId!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const {
    date,
    what_i_did,
    what_i_learned,
    what_to_work_on,
    additional_notes,
    submit,
  } = body as {
    date?: string;
    what_i_did?: string;
    what_i_learned?: string;
    what_to_work_on?: string;
    additional_notes?: string;
    submit?: boolean;
  };

  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  if (!validateDate(reportDate)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  if (submit === true && !what_i_did?.trim()) {
    return NextResponse.json(
      { error: '"What I Did Today" is required before submitting.' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    operator_id: auth.userId,
    date: reportDate,
    what_i_did: what_i_did?.trim() ?? '',
    what_i_learned: what_i_learned?.trim() ?? null,
    what_to_work_on: what_to_work_on?.trim() ?? null,
    additional_notes: additional_notes?.trim() ?? null,
    updated_at: now,
  };

  if (submit === true) {
    payload.is_draft = false;
    payload.submitted_at = now;
  } else {
    payload.is_draft = true;
  }

  const { data, error } = await supabaseAdmin
    .from('operator_daily_reports')
    .upsert(payload, { onConflict: 'operator_id,date', ignoreDuplicates: false })
    .select('id, is_draft, submitted_at')
    .single();

  if (error) {
    console.error('[daily-report POST]', error);
    return NextResponse.json({ error: 'Failed to save report.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
