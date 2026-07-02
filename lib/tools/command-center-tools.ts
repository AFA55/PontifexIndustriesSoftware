/**
 * Artifex tool definitions (Jarvis Command Center Phase 2 — the brain).
 *
 * Each tool is READ-ONLY and tenant-scoped: `createCommandCenterTools(tenantId, role)`
 * closes over the CALLER'S already-authenticated tenant + role (resolved once in the
 * API route via requireAuth), so every query below carries an explicit
 * `.eq('tenant_id', tenantId)` — the same platform-write invariant used everywhere
 * else in this codebase. supabaseAdmin bypasses RLS, so this manual filter IS the
 * security boundary; never relax it. `get_revenue_snapshot` additionally checks the
 * caller's role before executing (financial data is admin+ only).
 *
 * Return shapes are intentionally small, pre-aggregated, high-signal JSON — never
 * raw rows or SQL — so the model reasons over facts, not database internals
 * (mirrors the "no raw SQL visible to model" rule from docs/plans/ARTIFEX_PLAN.md).
 */
import { tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toLocalYMD } from '@/lib/dates';

const FIELD_ROLES = ['operator', 'apprentice'];

/**
 * Two-step name lookup instead of a PostgREST embed — this repo has a documented
 * embed-fragility gotcha (a missing/renamed FK silently 500s the whole query; see
 * the office-documents incident). A plain `.in('id', ids)` select is more robust.
 */
async function lookupNames(tenantId: string, ids: (string | null)[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('tenant_id', tenantId)
    .in('id', uniqueIds);
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name]));
}

export function createCommandCenterTools(tenantId: string, role: string) {
  return {
    get_clocked_in_status: tool({
      description:
        "Who is clocked in right now, vs. the total active field roster. Use for questions like 'who's working today' or 'how many people are clocked in'.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = toLocalYMD();
        const [{ data: openTimecards }, { count: rosterCount }] = await Promise.all([
          supabaseAdmin
            .from('timecards')
            .select('operator_id, clock_in_time')
            .eq('tenant_id', tenantId)
            .eq('date', today)
            .is('clock_out_time', null),
          supabaseAdmin
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('role', FIELD_ROLES)
            .eq('active', true)
            .is('deleted_at', null),
        ]);
        const namesById = await lookupNames(tenantId, (openTimecards ?? []).map((t: any) => t.operator_id));
        const clockedIn = (openTimecards ?? []).map((t: any) => ({
          name: namesById.get(t.operator_id) ?? 'Unknown',
          clockInTime: t.clock_in_time,
        }));
        return { clockedInCount: clockedIn.length, rosterSize: rosterCount ?? 0, clockedIn };
      },
    }),

    get_todays_jobs: tool({
      description:
        "Job orders scheduled for today, with status and assigned operator. Use for 'what jobs are running today' or 'what's the status of today's jobs'.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = toLocalYMD();
        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('job_number, customer_name, status, operator_name, scheduled_date')
          .eq('tenant_id', tenantId)
          .eq('scheduled_date', today)
          .is('deleted_at', null)
          .order('job_number');
        return { count: data?.length ?? 0, jobs: data ?? [] };
      },
    }),

    get_pending_approvals: tool({
      description:
        "Pending time-off requests and pending job-completion requests awaiting management approval. Use for 'what needs my approval' or 'anything pending'.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: timeOff }, { data: completions }] = await Promise.all([
          supabaseAdmin
            .from('operator_time_off')
            .select('operator_name, start_date, end_date, reason')
            .eq('tenant_id', tenantId)
            .eq('status', 'pending'),
          supabaseAdmin
            .from('job_completion_requests')
            .select('job_number, submitted_by_name')
            .eq('tenant_id', tenantId)
            .eq('status', 'pending'),
        ]);
        return {
          pendingTimeOff: timeOff ?? [],
          pendingCompletions: completions ?? [],
          totalPending: (timeOff?.length ?? 0) + (completions?.length ?? 0),
        };
      },
    }),

    get_team_roster: tool({
      description:
        "The active team roster (operators and apprentices), with role. Use for 'who works here' or 'list the team' or looking up a specific person by name.",
      inputSchema: z.object({
        nameContains: z
          .string()
          .optional()
          .describe('Optional: filter to operators whose name contains this substring'),
      }),
      execute: async ({ nameContains }) => {
        let q = supabaseAdmin
          .from('profiles')
          .select('full_name, role, hourly_rate')
          .eq('tenant_id', tenantId)
          .in('role', FIELD_ROLES)
          .eq('active', true)
          .is('deleted_at', null)
          .order('full_name');
        if (nameContains) q = q.ilike('full_name', `%${nameContains}%`);
        const { data } = await q;
        // hourly_rate is compensation data — only surface it to admin+ callers.
        const canSeeRate = role !== 'operator' && role !== 'apprentice';
        return {
          count: data?.length ?? 0,
          roster: (data ?? []).map((p: any) => ({
            name: p.full_name,
            role: p.role,
            ...(canSeeRate ? { hourlyRate: p.hourly_rate } : {}),
          })),
        };
      },
    }),

    get_recent_activity: tool({
      description:
        "The last 10 timecard clock-in/clock-out events across the team. Use for 'what's been happening' or 'recent activity'.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabaseAdmin
          .from('timecards')
          .select('operator_id, clock_in_time, clock_out_time, date')
          .eq('tenant_id', tenantId)
          .order('clock_in_time', { ascending: false })
          .limit(10);
        const namesById = await lookupNames(tenantId, (data ?? []).map((t: any) => t.operator_id));
        return {
          events: (data ?? []).map((t: any) => ({
            name: namesById.get(t.operator_id) ?? 'Unknown',
            date: t.date,
            clockInTime: t.clock_in_time,
            clockOutTime: t.clock_out_time,
            status: t.clock_out_time ? 'completed' : 'still clocked in',
          })),
        };
      },
    }),

    get_revenue_snapshot: tool({
      description:
        'Month-to-date and year-to-date invoiced revenue. ADMIN-ONLY financial data — if the caller is not admin+, this tool returns a permission-denied result instead of numbers.',
      inputSchema: z.object({}),
      execute: async () => {
        if (role === 'operator' || role === 'apprentice') {
          return { error: 'Revenue data is restricted to management roles.' };
        }
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const [{ data: mtd }, { data: ytd }] = await Promise.all([
          supabaseAdmin
            .from('invoices')
            .select('total_amount')
            .eq('tenant_id', tenantId)
            .in('status', ['paid', 'sent', 'partial'])
            .gte('invoice_date', toLocalYMD(monthStart)),
          supabaseAdmin
            .from('invoices')
            .select('total_amount')
            .eq('tenant_id', tenantId)
            .in('status', ['paid', 'sent', 'partial'])
            .gte('invoice_date', toLocalYMD(yearStart)),
        ]);
        const sum = (rows: { total_amount: number | null }[] | null) =>
          (rows ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
        return { monthToDateRevenue: sum(mtd), yearToDateRevenue: sum(ytd) };
      },
    }),
  };
}

/** Static instance (dummy tenant/role) used ONLY for InferAgentUIMessage type export — never executed. */
export const commandCenterToolsForTypes = createCommandCenterTools('', 'admin');
