/**
 * Artifex tool definitions (Jarvis Command Center Phase 2 — the brain).
 *
 * Each tool is tenant-scoped: `createCommandCenterTools(tenantId, role, userId)`
 * closes over the CALLER'S already-authenticated tenant + role + id (resolved once
 * in the API route via requireAuth), so every query below carries an explicit
 * `.eq('tenant_id', tenantId)` — the same platform-write invariant used everywhere
 * else in this codebase. supabaseAdmin bypasses RLS, so this manual filter IS the
 * security boundary; never relax it. `get_revenue_snapshot` additionally checks the
 * caller's role before executing (financial data is admin+ only).
 *
 * All tools except `save_memory_note` are read-only. Memory notes are the
 * "2nd brain" (see supabase/migrations/20260702_artifex_memory.sql) — shared
 * tenant-wide durable knowledge, not per-user chat history.
 *
 * Return shapes are intentionally small, pre-aggregated, high-signal JSON — never
 * raw rows or SQL — so the model reasons over facts, not database internals
 * (mirrors the "no raw SQL visible to model" rule from docs/plans/ARTIFEX_PLAN.md).
 */
import { tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toLocalYMD } from '@/lib/dates';
import { embedText, embedAndStoreNote } from '@/lib/artifex-embeddings';

const FIELD_ROLES = ['operator', 'apprentice'];
const MEMORY_RECALL_DEFAULT_LIMIT = 20;

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

export function createCommandCenterTools(tenantId: string, role: string, userId: string) {
  return {
    get_clocked_in_status: tool({
      description:
        "Who is clocked in right now, vs. the total active field roster. Use for questions like 'who's working today' or 'how many people are clocked in'.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = toLocalYMD();
        const [timecardsRes, rosterRes] = await Promise.all([
          supabaseAdmin
            .from('timecards')
            .select('user_id, clock_in_time')
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
        if (timecardsRes.error) throw new Error(`get_clocked_in_status: ${timecardsRes.error.message}`);
        const openTimecards = timecardsRes.data ?? [];
        const namesById = await lookupNames(tenantId, openTimecards.map((t: any) => t.user_id));
        const clockedIn = openTimecards.map((t: any) => ({
          name: namesById.get(t.user_id) ?? 'Unknown',
          clockInTime: t.clock_in_time,
        }));
        return { clockedInCount: clockedIn.length, rosterSize: rosterRes.count ?? 0, clockedIn };
      },
    }),

    get_todays_jobs: tool({
      description:
        "Job orders scheduled for today, with status and assigned operator. Use for 'what jobs are running today' or 'what's the status of today's jobs'.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = toLocalYMD();
        // schedule_board_view (not the base job_orders table) is this repo's
        // established source for operator_name/helper_name — job_orders itself
        // only has assigned_to (an id). See schedule-board/page.tsx's own comment.
        const { data, error } = await supabaseAdmin
          .from('schedule_board_view')
          .select('job_number, customer_name, status, operator_name, scheduled_date')
          .eq('tenant_id', tenantId)
          .eq('scheduled_date', today)
          .order('job_number');
        if (error) throw new Error(`get_todays_jobs: ${error.message}`);
        return { count: data?.length ?? 0, jobs: data ?? [] };
      },
    }),

    get_pending_approvals: tool({
      description:
        "Pending time-off requests and pending job-completion requests awaiting management approval. Use for 'what needs my approval' or 'anything pending'.",
      inputSchema: z.object({}),
      execute: async () => {
        const [timeOffRes, completionsRes] = await Promise.all([
          supabaseAdmin
            .from('operator_time_off')
            .select('operator_id, date, end_date, type, notes')
            .eq('tenant_id', tenantId)
            .eq('status', 'pending'),
          supabaseAdmin
            .from('job_completion_requests')
            .select('job_order_id, submitted_by, operator_notes')
            .eq('tenant_id', tenantId)
            .eq('status', 'pending'),
        ]);
        if (timeOffRes.error) throw new Error(`get_pending_approvals (time off): ${timeOffRes.error.message}`);
        if (completionsRes.error) throw new Error(`get_pending_approvals (completions): ${completionsRes.error.message}`);
        const timeOff = timeOffRes.data ?? [];
        const completions = completionsRes.data ?? [];

        const jobOrderIds = [...new Set(completions.map((c: any) => c.job_order_id).filter(Boolean))];
        const [namesById, jobNumbersById] = await Promise.all([
          lookupNames(tenantId, timeOff.map((t: any) => t.operator_id).concat(completions.map((c: any) => c.submitted_by))),
          jobOrderIds.length
            ? supabaseAdmin
                .from('job_orders')
                .select('id, job_number')
                .eq('tenant_id', tenantId)
                .in('id', jobOrderIds)
                .then(({ data }) => new Map((data ?? []).map((j: any) => [j.id, j.job_number])))
            : Promise.resolve(new Map<string, string>()),
        ]);

        return {
          pendingTimeOff: timeOff.map((t: any) => ({
            operatorName: namesById.get(t.operator_id) ?? 'Unknown',
            startDate: t.date,
            endDate: t.end_date,
            type: t.type,
            notes: t.notes,
          })),
          pendingCompletions: completions.map((c: any) => ({
            jobNumber: jobNumbersById.get(c.job_order_id) ?? 'Unknown',
            submittedBy: namesById.get(c.submitted_by) ?? 'Unknown',
            notes: c.operator_notes,
          })),
          totalPending: timeOff.length + completions.length,
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
        const { data, error } = await q;
        if (error) throw new Error(`get_team_roster: ${error.message}`);
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
        const { data, error } = await supabaseAdmin
          .from('timecards')
          .select('user_id, clock_in_time, clock_out_time, date')
          .eq('tenant_id', tenantId)
          .order('clock_in_time', { ascending: false })
          .limit(10);
        if (error) throw new Error(`get_recent_activity: ${error.message}`);
        const events = data ?? [];
        const namesById = await lookupNames(tenantId, events.map((t: any) => t.user_id));
        return {
          events: events.map((t: any) => ({
            name: namesById.get(t.user_id) ?? 'Unknown',
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
        const [mtdRes, ytdRes] = await Promise.all([
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
        if (mtdRes.error) throw new Error(`get_revenue_snapshot (mtd): ${mtdRes.error.message}`);
        if (ytdRes.error) throw new Error(`get_revenue_snapshot (ytd): ${ytdRes.error.message}`);
        const sum = (rows: { total_amount: number | null }[] | null) =>
          (rows ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
        return { monthToDateRevenue: sum(mtdRes.data), yearToDateRevenue: sum(ytdRes.data) };
      },
    }),

    save_memory_note: tool({
      description:
        "Save a durable, non-obvious fact to the company's shared long-term memory — a preference, a recurring issue, a decision that was made, or context that will matter in a FUTURE conversation. Use this proactively whenever you learn something worth remembering across sessions. Do NOT use it for routine operational data already covered by the other tools (today's jobs, who's clocked in, etc.) — only durable knowledge.",
      inputSchema: z.object({
        note: z.string().describe('The fact to remember, written as a standalone sentence with enough context to make sense later.'),
        category: z
          .string()
          .optional()
          .describe("Optional short label, e.g. 'preference', 'recurring issue', 'decision'."),
      }),
      execute: async ({ note, category }) => {
        const { data: inserted, error } = await supabaseAdmin
          .from('artifex_memory_notes')
          .insert({
            tenant_id: tenantId,
            created_by: userId,
            note,
            category: category ?? null,
          })
          .select('id')
          .single();
        if (error) throw new Error(`save_memory_note: ${error.message}`);
        // Semantic index (Phase A1) — awaited so recall works immediately in the
        // same conversation, but embedAndStoreNote never throws: a failed
        // embedding degrades to keyword-only recall, never a failed save.
        if (inserted?.id) {
          await embedAndStoreNote(inserted.id, `${note} ${category ?? ''}`.trim());
        }
        return { saved: true };
      },
    }),

    recall_memory_notes: tool({
      description:
        "Search the company's shared long-term memory for durable facts saved in past conversations. Use this when a question seems to reference something discussed before, or needs company-specific context that isn't covered by the live operational tools.",
      inputSchema: z.object({
        query: z.string().optional().describe('Optional substring to filter notes by.'),
        limit: z.number().int().positive().max(50).optional().describe(`Max notes to return (default ${MEMORY_RECALL_DEFAULT_LIMIT}).`),
      }),
      execute: async ({ query, limit }) => {
        const cap = limit ?? MEMORY_RECALL_DEFAULT_LIMIT;
        const baseQuery = () =>
          supabaseAdmin
            .from('artifex_memory_notes')
            .select('note, category, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(cap);

        // Phase A1: HYBRID recall — keyword (tsvector) + semantic (pgvector)
        // merged with Reciprocal Rank Fusion inside artifex_hybrid_recall().
        // "shop equipment" now finds "the forklift needs a hydraulic hose"
        // even though no words overlap. Fail-soft chain: hybrid → keyword
        // ilike → recent notes.
        if (query && query.trim().length > 0) {
          const queryEmbedding = await embedText(query);
          if (queryEmbedding) {
            const { data: hybrid, error: hybridError } = await supabaseAdmin.rpc(
              'artifex_hybrid_recall',
              {
                p_tenant_id: tenantId,
                p_query: query,
                p_query_embedding: JSON.stringify(queryEmbedding),
                p_match_count: cap,
              }
            );
            if (!hybridError && hybrid && hybrid.length > 0) {
              return {
                count: hybrid.length,
                mode: 'hybrid_semantic',
                notes: hybrid.map((n: any) => ({ note: n.note, category: n.category, createdAt: n.created_at })),
              };
            }
            if (hybridError) {
              console.error('[artifex] hybrid recall failed (falling back):', hybridError.message);
            }
          }
        }

        let usedRecentFallback = false;
        let { data, error } = query ? await baseQuery().ilike('note', `%${query}%`) : await baseQuery();
        if (error) throw new Error(`recall_memory_notes: ${error.message}`);

        // A keyword filter is a substring match, not semantic search — a real,
        // relevant note can easily use different wording than the query. Rather
        // than report "nothing found" (which reads as "nothing was ever saved"),
        // fall back to the tenant's most recent notes so the model still has
        // something to reason over and can judge relevance itself.
        if (query && (data?.length ?? 0) === 0) {
          usedRecentFallback = true;
          const fallback = await baseQuery();
          if (fallback.error) throw new Error(`recall_memory_notes: ${fallback.error.message}`);
          data = fallback.data;
        }

        return {
          count: data?.length ?? 0,
          usedRecentFallback,
          mode: query ? 'keyword_fallback' : 'recent',
          notes: (data ?? []).map((n: any) => ({ note: n.note, category: n.category, createdAt: n.created_at })),
        };
      },
    }),
  };
}

/** Static instance (dummy tenant/role/userId) used ONLY for InferAgentUIMessage type export — never executed. */
export const commandCenterToolsForTypes = createCommandCenterTools('', 'admin', '');
