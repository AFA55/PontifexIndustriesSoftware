export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/search/jobs?q=...
 *
 * The global header search. Finds a job by JOB NUMBER first — that is what the
 * founder asked for, because he reads job numbers off tickets, invoices and
 * chat messages and until now had no way to look one up — and also by customer
 * name and site address, which the header's placeholder has been promising
 * since it was decoration.
 *
 * TENANT SCOPE
 * ────────────
 * `supabaseAdmin` bypasses RLS, so every query below carries an explicit
 * `.eq('tenant_id', tenantId)` resolved through `resolveTenantScope` — which
 * returns a guaranteed non-null id and confines a client's super_admin to their
 * own tenant. There is no code path here that queries without that filter.
 *
 * WHY THREE QUERIES INSTEAD OF ONE `.or()`
 * ────────────────────────────────────────
 * PostgREST's `or=` takes a comma-separated filter STRING. An address search
 * ("123 Main St, Boston") contains commas, and a customer name can contain
 * parentheses — both would break out of the intended filter. Rather than invent
 * an escaping scheme for a user-typed box, each column gets its own `.ilike()`
 * (where the client URL-encodes the value) and the results are merged in
 * `lib/job-search.ts`. Three indexed prefix-less scans over a 62-row table is
 * not a performance problem, and will not be one at ten thousand.
 *
 * GET — requireSalesStaff
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff, resolveTenantScope } from '@/lib/api-auth';
import {
  parseJobQuery,
  mergeJobResults,
  rankJobResults,
  type JobSearchResult,
} from '@/lib/job-search';

/** A row as selected here — `matched_on` is decided by which query returned it. */
type JobRow = Omit<JobSearchResult, 'matched_on'>;

/**
 * Columns verified against information_schema.columns for `job_orders`, Aug 19
 * 2026.
 *
 * Declared as a tuple of `keyof JobRow` rather than a hand-written string so a
 * typo or a drift from `JobSearchResult` is a compile error. `_EVERY_COLUMN`
 * below is the other half of that: it fails to typecheck if a field is added to
 * `JobSearchResult` and not selected here — otherwise the field arrives
 * `undefined` at the client and the dropdown quietly renders a blank row.
 */
const SELECT_COLUMN_LIST = [
  'id',
  'job_number',
  'customer_name',
  'project_name',
  'address',
  'status',
  'scheduled_date',
] as const satisfies readonly (keyof JobRow)[];

const _EVERY_COLUMN: Exclude<keyof JobRow, (typeof SELECT_COLUMN_LIST)[number]> extends never
  ? true
  : never = true;
void _EVERY_COLUMN;

const SELECT_COLUMNS = SELECT_COLUMN_LIST.join(', ');

const MAX_RESULTS = 8;
/** Per-column cap before merge; a little headroom so ranking has something to sort. */
const PER_COLUMN_LIMIT = 10;
/**
 * Longest query we will turn into an `ilike` pattern. A pasted paragraph — or a
 * 10 KB clipboard accident — otherwise becomes three 10 KB patterns for the
 * database to scan, and nothing a person searches for is longer than this.
 */
const MAX_QUERY_LENGTH = 120;

export async function GET(request: NextRequest) {
  try {
    // WHO SEES THE SEARCH BOX MUST MATCH WHO CAN OPEN A RESULT.
    // `requireSalesStaff` is admin | super_admin | operations_manager |
    // supervisor | salesman — exactly the set the job-detail page
    // (`/dashboard/admin/jobs/[id]`) admits in its own auth guard. Widening
    // this to shop_manager would hand them results that bounce them back to
    // /dashboard on click, which is the UI-says-yes-API-says-no defect this
    // codebase keeps shipping. The header hides the box for those roles.
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { searchParams } = new URL(request.url);
    const parsed = parseJobQuery((searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH));

    // An empty query returns an empty list, not the whole table.
    if (!parsed.normalized) {
      return NextResponse.json({ success: true, data: { query: parsed.raw, results: [] } });
    }

    // ORDER BEFORE LIMIT, ALWAYS. `.limit(10)` with no ordering returns an
    // ARBITRARY ten rows — whichever ten the planner happens to emit. Ranking
    // then sorts "newest first" over an arbitrary subset, so for a customer with
    // eleven jobs the newest one can be absent from the set being ranked and the
    // founder sees ten older jobs and concludes the search is wrong. Ordering by
    // scheduled_date descending makes the truncation the deliberate one: the ten
    // most recent. `nullsFirst: false` keeps undated rows from taking the slots.
    const base = () =>
      supabaseAdmin
        .from('job_orders')
        .select(SELECT_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(PER_COLUMN_LIMIT);

    const [byNumber, byCustomer, byAddress] = await Promise.all([
      base().ilike('job_number', parsed.jobNumberPattern),
      base().ilike('customer_name', parsed.textPattern),
      base().ilike('address', parsed.textPattern),
    ]);

    const firstError = byNumber.error || byCustomer.error || byAddress.error;
    if (firstError) {
      // Say which column failed. A bad column name makes PostgREST reject the
      // whole select and the dropdown then reads as "no jobs match" — which is
      // indistinguishable from a real empty result, and has shipped here before.
      console.error('[search/jobs] query failed', {
        tenantId,
        query: parsed.normalized,
        error: firstError,
      });
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    // The admin client is created without a generated `Database` type, so
    // PostgREST rows arrive loosely typed. The cast names the shape once, and
    // `_EVERY_COLUMN` above is what actually keeps it honest.
    const rows = (data: unknown): JobRow[] => (data ?? []) as JobRow[];

    const merged = mergeJobResults([
      { matched_on: 'job_number', rows: rows(byNumber.data) },
      { matched_on: 'customer', rows: rows(byCustomer.data) },
      { matched_on: 'address', rows: rows(byAddress.data) },
    ]);

    const results = rankJobResults(parsed, merged).slice(0, MAX_RESULTS);

    return NextResponse.json({
      success: true,
      data: {
        query: parsed.raw,
        // Told to the client so the dropdown can say "no jobs match JOB-2026-1"
        // using what the search actually ran, not what was typed.
        normalized: parsed.normalized,
        results,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /api/admin/search/jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
