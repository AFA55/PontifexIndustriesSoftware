export const dynamic = 'force-dynamic';

/**
 * API Route: /api/jobs/[id]/progress
 * Operators log daily progress against job scope items.
 *
 * GET  — authenticated; returns all progress entries grouped by date and scope item
 * POST — authenticated; log progress for today (or a specified date)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { loadJobProgress, explodeProgressEntries } from '@/lib/job-progress-server';

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Progress is DERIVED from work_items — the operator's own record. The old
    // read of `job_progress_entries` returned nothing because no code path ever
    // wrote that table. See lib/job-progress.ts.
    const loaded = await loadJobProgress(jobId, tenantId);
    const entries = explodeProgressEntries(loaded);

    // Operator names for the flat list.
    const operatorIds = Array.from(
      new Set(loaded.work_items.map((w) => w.operator_id).filter((v): v is string => !!v))
    );
    const operatorNames: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: opProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds);
      for (const p of opProfiles ?? []) operatorNames[p.id] = p.full_name ?? 'Unknown';
    }

    // Newest first, matching the previous ordering.
    const flatEntries = [...entries]
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
      .map((e) => ({
        id: e.id,
        scope_item_id: e.scope_item_id,
        scope_item_description: e.description,
        work_type: e.work_type,
        unit: e.unit,
        quantity_completed: e.quantity_completed,
        date: e.date,
        operator_name: e.operator_id ? operatorNames[e.operator_id] ?? 'Unknown' : 'Unknown',
        notes: e.notes,
      }));

    // Per-target summary, with each day's contribution kept for the chart.
    const dailyByScope: Record<string, Array<{ date: string; quantity: number }>> = {};
    for (const e of entries) {
      if (!e.scope_item_id || !e.date || e.quantity_completed === null) continue;
      (dailyByScope[e.scope_item_id] ||= []).push({ date: e.date, quantity: e.quantity_completed });
    }

    const byScopeItem = loaded.scope_progress.map((row) => ({
      scope_item_id: row.scope_item_id,
      description: row.description ?? '',
      work_type: row.work_type,
      unit: row.unit,
      target_quantity: row.target_quantity,
      total_completed: row.completed_quantity,
      pct_complete: row.pct_complete,
      derivable: row.derivable,
      daily_entries: dailyByScope[row.scope_item_id] ?? [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        entries: flatEntries,
        by_scope_item: byScopeItem,
        overall_pct: loaded.overall_pct,
        unmatched_work: loaded.unmatched_work,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /progress:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const {
      scope_item_id = null,
      quantity_completed,
      date,
      notes,
      work_type,
    } = body;

    if (quantity_completed == null || isNaN(Number(quantity_completed))) {
      return NextResponse.json({ error: 'quantity_completed must be a number' }, { status: 400 });
    }

    // Validate date format if provided
    const entryDate = date || new Date().toISOString().split('T')[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(entryDate)) {
      return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
    }

    // If scope_item_id is provided, verify it belongs to this job
    if (scope_item_id) {
      const { data: scopeItem, error: scopeErr } = await supabaseAdmin
        .from('job_scope_items')
        .select('id')
        .eq('id', scope_item_id)
        .eq('job_order_id', jobId)
        .eq('tenant_id', tenantId)
        .single();

      if (scopeErr || !scopeItem) {
        return NextResponse.json(
          { error: 'scope_item_id does not belong to this job' },
          { status: 400 }
        );
      }
    }

    const { data: newEntry, error } = await supabaseAdmin
      .from('job_progress_entries')
      .insert({
        tenant_id: tenantId,
        job_order_id: jobId,
        scope_item_id: scope_item_id || null,
        operator_id: auth.userId,
        date: entryDate,
        quantity_completed: Number(quantity_completed),
        notes: notes || null,
        work_type: work_type || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating progress entry:', error);
      return NextResponse.json({ error: 'Failed to log progress' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newEntry }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /progress:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
