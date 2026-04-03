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

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Fetch all progress entries for this job with operator name and scope item info
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from('job_progress_entries')
      .select(`
        id,
        scope_item_id,
        quantity_completed,
        date,
        notes,
        work_type,
        operator_id,
        profiles!job_progress_entries_operator_id_fkey(full_name),
        job_scope_items!job_progress_entries_scope_item_id_fkey(description, work_type, unit, target_quantity)
      `)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false });

    if (entriesError) {
      console.error('Error fetching progress entries:', entriesError);
      return NextResponse.json({ error: 'Failed to fetch progress entries' }, { status: 500 });
    }

    // Fetch all scope items for this job to build the by_scope_item summary
    const { data: scopeItems, error: scopeError } = await supabaseAdmin
      .from('job_scope_items')
      .select('id, description, work_type, unit, target_quantity')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    if (scopeError) {
      console.error('Error fetching scope items for progress:', scopeError);
      return NextResponse.json({ error: 'Failed to fetch scope data' }, { status: 500 });
    }

    // Flatten entries for the flat list
    const flatEntries = (entries || []).map((e: any) => ({
      id: e.id,
      scope_item_id: e.scope_item_id,
      scope_item_description: e.job_scope_items?.description ?? null,
      work_type: e.job_scope_items?.work_type ?? e.work_type ?? null,
      unit: e.job_scope_items?.unit ?? null,
      quantity_completed: Number(e.quantity_completed),
      date: e.date,
      operator_name: e.profiles?.full_name ?? 'Unknown',
      notes: e.notes ?? null,
    }));

    // Build by_scope_item summary
    const scopeMap: Record<string, {
      scope_item_id: string;
      description: string;
      work_type: string;
      unit: string;
      target_quantity: number;
      total_completed: number;
      pct_complete: number;
      daily_entries: Array<{ date: string; quantity: number }>;
    }> = {};

    for (const item of scopeItems || []) {
      scopeMap[item.id] = {
        scope_item_id: item.id,
        description: item.description ?? '',
        work_type: item.work_type,
        unit: item.unit,
        target_quantity: Number(item.target_quantity),
        total_completed: 0,
        pct_complete: 0,
        daily_entries: [],
      };
    }

    // Accumulate progress into scope map
    for (const entry of entries || []) {
      if (entry.scope_item_id && scopeMap[entry.scope_item_id]) {
        const qty = Number(entry.quantity_completed);
        scopeMap[entry.scope_item_id].total_completed += qty;
        scopeMap[entry.scope_item_id].daily_entries.push({
          date: entry.date,
          quantity: qty,
        });
      }
    }

    // Calculate pct_complete for each scope item
    for (const key of Object.keys(scopeMap)) {
      const item = scopeMap[key];
      item.pct_complete =
        item.target_quantity > 0
          ? parseFloat(Math.min(100, (item.total_completed / item.target_quantity) * 100).toFixed(1))
          : 0;
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: flatEntries,
        by_scope_item: Object.values(scopeMap),
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
