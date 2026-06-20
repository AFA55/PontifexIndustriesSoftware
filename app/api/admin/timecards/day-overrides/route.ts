export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/timecards/day-overrides — List upcoming overrides (today+)
 * POST   /api/admin/timecards/day-overrides — Create a new day override
 * DELETE /api/admin/timecards/day-overrides?id=<uuid> — Delete an override
 *
 * Manages `timecard_day_overrides` — per-date start-time exceptions that
 * override the tenant default.  Scope qualifiers (DB CHECK mirrors these):
 *   scope='all'      → role IS NULL, operator_id IS NULL
 *   scope='role'     → role IS NOT NULL, operator_id IS NULL
 *   scope='operator' → operator_id IS NOT NULL (role may be NULL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { toLocalYMD } from '@/lib/dates';

const VALID_SCOPES = ['all', 'role', 'operator'] as const;
type Scope = (typeof VALID_SCOPES)[number];

// ---------------------------------------------------------------------------
// GET — upcoming overrides (override_date >= today), ordered by date asc.
//       For scope='operator' rows, operator_name is resolved from profiles.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const today = toLocalYMD(new Date());

    const { data, error } = await supabaseAdmin
      .from('timecard_day_overrides')
      .select(
        'id, tenant_id, override_date, start_time, scope, role, operator_id, note, created_by, created_at, updated_at'
      )
      .eq('tenant_id', tenantId)
      .gte('override_date', today)
      .order('override_date', { ascending: true });

    if (error) {
      console.error('Error fetching day overrides:', error);
      return NextResponse.json({ error: 'Failed to fetch day overrides' }, { status: 500 });
    }

    const rows = data || [];

    // Resolve operator names for scope='operator' rows in a single profiles query.
    const operatorIds = [
      ...new Set(
        rows
          .filter((r) => r.scope === 'operator' && r.operator_id)
          .map((r) => r.operator_id as string)
      ),
    ];

    let nameMap: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .in('id', operatorIds);

      if (!profilesError && profiles) {
        nameMap = Object.fromEntries(
          profiles.map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? ''])
        );
      }
    }

    const enriched = rows.map((row) => ({
      ...row,
      operator_name:
        row.scope === 'operator' && row.operator_id
          ? (nameMap[row.operator_id] ?? null)
          : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error('Unexpected error in day-overrides GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — create a new day override.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { override_date, start_time, scope, role, operator_id, note } = body as {
      override_date?: string;
      start_time?: string;
      scope?: string;
      role?: string | null;
      operator_id?: string | null;
      note?: string | null;
    };

    // --- Validate override_date ---
    if (!override_date || !/^\d{4}-\d{2}-\d{2}$/.test(override_date)) {
      return NextResponse.json(
        { error: 'override_date is required and must be YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // --- Validate start_time ---
    if (!start_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(start_time)) {
      return NextResponse.json(
        { error: 'start_time is required and must be HH:MM or HH:MM:SS' },
        { status: 400 }
      );
    }

    // --- Validate scope ---
    if (!scope || !VALID_SCOPES.includes(scope as Scope)) {
      return NextResponse.json(
        { error: `scope must be one of: ${VALID_SCOPES.join(', ')}` },
        { status: 400 }
      );
    }

    // --- Validate scope qualifiers ---
    const typedScope = scope as Scope;

    if (typedScope === 'all') {
      if (role || operator_id) {
        return NextResponse.json(
          { error: "scope='all' must not include role or operator_id" },
          { status: 400 }
        );
      }
    } else if (typedScope === 'role') {
      if (!role) {
        return NextResponse.json(
          { error: "scope='role' requires a role value" },
          { status: 400 }
        );
      }
      if (operator_id) {
        return NextResponse.json(
          { error: "scope='role' must not include operator_id" },
          { status: 400 }
        );
      }
    } else if (typedScope === 'operator') {
      if (!operator_id) {
        return NextResponse.json(
          { error: "scope='operator' requires an operator_id" },
          { status: 400 }
        );
      }
    }

    const insert: Record<string, unknown> = {
      tenant_id: tenantId,
      override_date,
      start_time,
      scope: typedScope,
      role: typedScope === 'role' ? (role ?? null) : null,
      operator_id: typedScope === 'operator' ? (operator_id ?? null) : null,
      note: note ?? null,
      created_by: auth.userId,
    };

    const { data, error } = await supabaseAdmin
      .from('timecard_day_overrides')
      .insert(insert)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An override for that date/scope already exists' },
          { status: 409 }
        );
      }
      console.error('Error inserting day override:', error);
      return NextResponse.json({ error: 'Failed to create day override' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error in day-overrides POST:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove an override by id (tenant-scoped).
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    // .select() so we can tell a real deletion from a no-op (wrong id or another
    // tenant's row) — otherwise the client shows a false "deleted" confirmation.
    const { data: deleted, error } = await supabaseAdmin
      .from('timecard_day_overrides')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id');

    if (error) {
      console.error('Error deleting day override:', error);
      return NextResponse.json({ error: 'Failed to delete day override' }, { status: 500 });
    }

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error in day-overrides DELETE:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
