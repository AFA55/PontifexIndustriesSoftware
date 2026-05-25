export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/operator-reports
 *
 * Admin read of operator daily reports with operator name join.
 *
 * Query parameters (all optional):
 *   operator_id  — filter to a single operator (UUID)
 *   date         — exact date filter (YYYY-MM-DD)
 *   start        — inclusive start date (YYYY-MM-DD); default: 30 days ago
 *   end          — inclusive end date (YYYY-MM-DD); default: today
 *   is_draft     — "true" | "false" to filter by draft state
 *   page         — 1-based page number (default: 1)
 *   page_size    — records per page (default: 50, max: 200)
 *
 * Accessible by: admin, super_admin, operations_manager, supervisor
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, resolveTenantScope, AuthSuccess } from '@/lib/api-auth';

/** Roles allowed to read operator reports. */
const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager', 'supervisor'];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// GET /api/admin/operator-reports
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    // Authenticate and check role.
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    if (!ALLOWED_ROLES.includes(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Admin or operations manager access required.' },
        { status: 403 }
      );
    }

    // Resolve the tenant scope (handles super_admin ?tenantId= override).
    const scope = await resolveTenantScope(request, auth as AuthSuccess);
    if ('response' in scope) return scope.response;
    const { tenantId } = scope;

    // Parse query params.
    const { searchParams } = new URL(request.url);

    const operatorId = searchParams.get('operator_id') ?? null;
    const exactDate = searchParams.get('date') ?? null;
    const startParam = searchParams.get('start') ?? null;
    const endParam = searchParams.get('end') ?? null;
    const isDraftParam = searchParams.get('is_draft') ?? null;

    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10);

    const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
    const pageSize = isNaN(pageSizeRaw) || pageSizeRaw < 1
      ? DEFAULT_PAGE_SIZE
      : Math.min(pageSizeRaw, MAX_PAGE_SIZE);

    // Validate any supplied date strings.
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (exactDate && !ISO_DATE.test(exactDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    if (startParam && !ISO_DATE.test(startParam)) {
      return NextResponse.json(
        { error: 'Invalid start format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    if (endParam && !ISO_DATE.test(endParam)) {
      return NextResponse.json(
        { error: 'Invalid end format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    // Date range defaults: last 30 days when no explicit date / range supplied.
    let startDate: string;
    let endDate: string;

    if (exactDate) {
      startDate = exactDate;
      endDate = exactDate;
    } else {
      const today = new Date();
      endDate = endParam ?? today.toISOString().slice(0, 10);

      if (startParam) {
        startDate = startParam;
      } else {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startDate = thirtyDaysAgo.toISOString().slice(0, 10);
      }
    }

    // Pagination range.
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build the main query against operator_daily_reports with a profiles join.
    let query = supabaseAdmin
      .from('operator_daily_reports')
      .select(
        `
        id,
        operator_id,
        tenant_id,
        date,
        what_i_did,
        what_i_learned,
        what_to_work_on,
        additional_notes,
        voice_note_url,
        primary_job_id,
        is_draft,
        submitted_at,
        created_at,
        updated_at,
        profiles:operator_id (
          full_name,
          email,
          role,
          avatar_url
        )
        `,
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }

    if (isDraftParam !== null) {
      query = query.eq('is_draft', isDraftParam === 'true');
    }

    const { data: reports, error, count } = await query;

    if (error) {
      console.error('[operator-reports GET] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch operator reports.' }, { status: 500 });
    }

    const totalCount = count ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        reports: reports ?? [],
        pagination: {
          page,
          page_size: pageSize,
          total: totalCount,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
        filters: {
          operator_id: operatorId,
          start: startDate,
          end: endDate,
          is_draft: isDraftParam,
        },
      },
    });
  } catch (err: any) {
    console.error('[operator-reports GET] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
