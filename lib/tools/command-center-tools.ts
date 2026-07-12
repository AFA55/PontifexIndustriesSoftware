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
import { canInviteRole, getRoleLabel } from '@/lib/rbac';
import { formatPhoneNumber } from '@/lib/sms';
import { sendEmail, generateInviteEmail, getTenantEmailBranding, isEmailConfigured } from '@/lib/email';

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
  const all = buildAllTools(tenantId, role, userId);

  // ── STRUCTURAL PERMISSION MATRIX (founder Jul 12: "certain people should
  // have access to certain things — make sure this is solid"). A role's agent
  // runtime only CONTAINS the tools that role may use; there is nothing to
  // talk the model into. Mirrors the UI's own access rules (quick-add roles,
  // management-only payroll, admin-only revenue, rank-guarded invites).
  const MATRIX: Record<string, (keyof typeof all)[]> = {
    // Full command: everything.
    super_admin: Object.keys(all) as (keyof typeof all)[],
    operations_manager: Object.keys(all) as (keyof typeof all)[],
    admin: Object.keys(all) as (keyof typeof all)[],
    // Sales: operational reads + ticket creation. No payroll, revenue, or invites.
    salesman: ['get_clocked_in_status', 'get_todays_jobs', 'get_team_roster', 'search_job_history', 'update_ticket_draft', 'create_job_ticket', 'save_memory_note', 'recall_memory_notes'],
    // Supervisors: operational reads + approvals visibility. No writes.
    // (get_attendance_summary matches the attendance_events RLS read grant.)
    supervisor: ['get_clocked_in_status', 'get_todays_jobs', 'get_pending_approvals', 'get_team_roster', 'get_recent_activity', 'search_job_history', 'get_attendance_summary', 'save_memory_note', 'recall_memory_notes'],
    // Shop + inventory: who/what is running today. No money, no writes.
    shop_manager: ['get_clocked_in_status', 'get_todays_jobs', 'get_team_roster', 'get_recent_activity', 'search_job_history', 'recall_memory_notes'],
    shop_help: ['get_clocked_in_status', 'get_todays_jobs', 'search_job_history', 'recall_memory_notes'],
    inventory_manager: ['get_clocked_in_status', 'get_todays_jobs', 'get_team_roster', 'search_job_history', 'recall_memory_notes'],
  };
  const allowed = MATRIX[role] ?? ['get_todays_jobs'];
  return Object.fromEntries(Object.entries(all).filter(([k]) => (allowed as string[]).includes(k))) as typeof all;
}

function buildAllTools(tenantId: string, role: string, userId: string) {
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

    search_job_history: tool({
      description:
        "Search the FULL job schedule history (past, today, and future) without scrolling the schedule board. Find every job a specific operator or helper was on, who worked a given customer or day, or jobs by status. Filters combine (AND). Use for questions like 'what jobs has Marcus done', 'who was at the hospital job in May', or 'show me everything scheduled last week'.",
      inputSchema: z.object({
        personName: z
          .string()
          .optional()
          .describe('Match jobs where this person was the OPERATOR or the HELPER (partial name ok)'),
        customerName: z.string().optional().describe('Partial customer name'),
        startDate: z.string().optional().describe('YYYY-MM-DD inclusive lower bound on scheduled date'),
        endDate: z.string().optional().describe('YYYY-MM-DD inclusive upper bound on scheduled date'),
        status: z.string().optional().describe("e.g. 'completed', 'scheduled', 'in_progress', 'cancelled'"),
        limit: z.number().int().positive().max(100).optional().describe('Max jobs to return (default 50, newest first)'),
      }),
      execute: async ({ personName, customerName, startDate, endDate, status, limit }) => {
        const cap = limit ?? 50;
        let q = supabaseAdmin
          .from('schedule_board_view')
          .select('job_number, title, customer_name, status, scheduled_date, operator_name, helper_name, location, job_type')
          .eq('tenant_id', tenantId)
          .order('scheduled_date', { ascending: false })
          .limit(cap);
        if (personName) {
          // Strip PostgREST or() syntax characters so a name can't break the filter.
          const p = personName.replace(/[,()]/g, '').trim();
          if (p) q = q.or(`operator_name.ilike.%${p}%,helper_name.ilike.%${p}%`);
        }
        if (customerName) q = q.ilike('customer_name', `%${customerName}%`);
        if (startDate) q = q.gte('scheduled_date', startDate);
        if (endDate) q = q.lte('scheduled_date', endDate);
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw new Error(`search_job_history: ${error.message}`);
        const jobs = (data ?? []).map((j: any) => ({
          date: j.scheduled_date,
          jobNumber: j.job_number,
          title: j.title,
          customer: j.customer_name,
          operator: j.operator_name,
          helper: j.helper_name,
          status: j.status,
          location: j.location,
          jobType: j.job_type,
        }));
        return {
          count: jobs.length,
          truncated: jobs.length === cap,
          jobs,
        };
      },
    }),

    get_hours_summary: tool({
      description:
        "Payroll-style hours breakdown per employee over a date range — regular, overtime, double-time, shop, night-shift premium, total hours, late days, and out-of-town (subsistence) nights, with a per-week split. Mirrors the columns of the company's payroll worksheet. Use for 'show me hours for this pay period', 'how many OT hours did Devin have last week', or 'who has subsistence nights this period'. MANAGEMENT-ONLY: returns a permission-denied result for field roles.",
      inputSchema: z.object({
        startDate: z.string().describe('YYYY-MM-DD pay-period start (inclusive)'),
        endDate: z.string().describe('YYYY-MM-DD pay-period end (inclusive)'),
        personName: z.string().optional().describe('Optional: limit to employees whose name contains this'),
      }),
      execute: async ({ startDate, endDate, personName }) => {
        if (role === 'operator' || role === 'apprentice') {
          return { error: 'Hours/payroll data is restricted to management roles.' };
        }
        let profileQ = supabaseAdmin
          .from('profiles')
          .select('id, full_name')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);
        if (personName) profileQ = profileQ.ilike('full_name', `%${personName}%`);
        const { data: people, error: peopleError } = await profileQ;
        if (peopleError) throw new Error(`get_hours_summary (roster): ${peopleError.message}`);
        if (!people || people.length === 0) return { count: 0, employees: [] };

        const { data: cards, error } = await supabaseAdmin
          .from('timecards')
          .select(
            'user_id, date, week_start, net_hours, total_hours, regular_hours, overtime_hours, double_time_hours, night_shift_premium_hours, is_shop_hours, is_late, out_of_town'
          )
          .eq('tenant_id', tenantId)
          .gte('date', startDate)
          .lte('date', endDate)
          .in('user_id', people.map((p: any) => p.id));
        if (error) throw new Error(`get_hours_summary: ${error.message}`);

        const nameById = new Map(people.map((p: any) => [p.id, p.full_name]));
        const byUser = new Map<string, any>();
        for (const c of cards ?? []) {
          const key = c.user_id;
          if (!byUser.has(key)) {
            byUser.set(key, {
              name: nameById.get(key) ?? 'Unknown',
              regularHours: 0, overtimeHours: 0, doubleTimeHours: 0,
              shopHours: 0, nightPremiumHours: 0, totalHours: 0,
              lateDays: 0, outOfTownNights: 0, daysWorked: 0,
              weeks: new Map<string, number>(),
            });
          }
          const s = byUser.get(key);
          const net = Number(c.net_hours ?? c.total_hours ?? 0);
          const ot = Number(c.overtime_hours ?? 0);
          const dt = Number(c.double_time_hours ?? 0);
          const reg = c.regular_hours != null ? Number(c.regular_hours) : Math.max(0, net - ot - dt);
          if (c.is_shop_hours) s.shopHours += net; else s.regularHours += reg;
          s.overtimeHours += ot;
          s.doubleTimeHours += dt;
          s.nightPremiumHours += Number(c.night_shift_premium_hours ?? 0);
          s.totalHours += net;
          if (c.is_late) s.lateDays += 1;
          if (c.out_of_town) s.outOfTownNights += 1;
          s.daysWorked += 1;
          const wk = c.week_start ?? c.date;
          s.weeks.set(wk, (s.weeks.get(wk) ?? 0) + net);
        }

        const round = (n: number) => Math.round(n * 100) / 100;
        const employees = [...byUser.values()]
          .map((s: any) => ({
            name: s.name,
            regularHours: round(s.regularHours),
            overtimeHours: round(s.overtimeHours),
            doubleTimeHours: round(s.doubleTimeHours),
            shopHours: round(s.shopHours),
            nightPremiumHours: round(s.nightPremiumHours),
            totalHours: round(s.totalHours),
            lateDays: s.lateDays,
            outOfTownNights: s.outOfTownNights,
            daysWorked: s.daysWorked,
            weeklyTotals: [...s.weeks.entries()]
              .sort()
              .map(([weekStart, hours]: [string, number]) => ({ weekStart, hours: round(hours) })),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return { periodStart: startDate, periodEnd: endDate, count: employees.length, employees };
      },
    }),

    get_attendance_summary: tool({
      description:
        "Attendance summary per employee over a date range — manually marked tracker codes (T=Tardy, EA/UA=excused/unexcused absence, NCNS=no call no show, V=Vacation, STO=scheduled time off, W=Weather, H=Holiday, etc.) PLUS auto-derived lates from clock-in records and approved time-off days (the same overlays the Attendance Calendar shows). Use for 'how many times was Devin tardy this year', 'who had unexcused absences last month', or 'show me attendance for June'.",
      inputSchema: z.object({
        startDate: z.string().describe('YYYY-MM-DD range start (inclusive)'),
        endDate: z.string().describe('YYYY-MM-DD range end (inclusive)'),
        personName: z.string().optional().describe('Optional: limit to employees whose name contains this'),
      }),
      execute: async ({ startDate, endDate, personName }) => {
        // Read path matches the Attendance Calendar exactly (manual codes +
        // the same auto overlays), so Artifex's numbers always agree with the
        // grid the office is looking at: lates derive from timecards, time
        // off from approved requests — a manual code on the same day wins.
        const [eventsRes, cardsRes, timeOffRes] = await Promise.all([
          supabaseAdmin
            .from('attendance_events')
            .select('user_id, date, code, note')
            .eq('tenant_id', tenantId)
            .gte('date', startDate)
            .lte('date', endDate),
          supabaseAdmin
            .from('timecards')
            .select('user_id, date, is_late, late_minutes')
            .eq('tenant_id', tenantId)
            .eq('is_late', true)
            .gte('date', startDate)
            .lte('date', endDate)
            .limit(5000),
          supabaseAdmin
            .from('operator_time_off')
            .select('operator_id, date, end_date, type')
            .eq('tenant_id', tenantId)
            .eq('status', 'approved')
            .lte('date', endDate)
            .gte('end_date', startDate),
        ]);
        if (eventsRes.error) throw new Error(`get_attendance_summary: ${eventsRes.error.message}`);

        const events = eventsRes.data ?? [];
        const lateCards = cardsRes.data ?? [];
        const timeOff = timeOffRes.data ?? [];
        const manualByUserDate = new Set(events.map((e: any) => `${e.user_id}|${e.date}`));

        const allIds = [
          ...events.map((e: any) => e.user_id),
          ...lateCards.map((c: any) => c.user_id),
          ...timeOff.map((t: any) => t.operator_id),
        ];
        if (allIds.length === 0) return { periodStart: startDate, periodEnd: endDate, count: 0, employees: [] };
        const namesById = await lookupNames(tenantId, allIds);

        const byUser = new Map<string, any>();
        const bucket = (uid: string) => {
          if (!byUser.has(uid)) {
            byUser.set(uid, {
              name: namesById.get(uid) ?? 'Unknown',
              codeCounts: {} as Record<string, number>,
              autoLateDays: 0,
              autoLateMinutes: 0,
              autoTimeOffDays: 0,
              days: [] as any[],
            });
          }
          return byUser.get(uid);
        };
        for (const e of events) {
          const s = bucket(e.user_id);
          s.codeCounts[e.code] = (s.codeCounts[e.code] ?? 0) + 1;
          s.days.push({ date: e.date, code: e.code, ...(e.note ? { note: e.note } : {}) });
        }
        for (const c of lateCards) {
          if (manualByUserDate.has(`${c.user_id}|${c.date}`)) continue; // manual code wins that day
          const s = bucket(c.user_id);
          s.autoLateDays += 1;
          s.autoLateMinutes += Number(c.late_minutes ?? 0);
        }
        for (const t of timeOff) {
          const from = new Date(`${t.date}T00:00:00`);
          const to = new Date(`${t.end_date ?? t.date}T00:00:00`);
          for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
            const iso = `${y}-${mm}-${dd}`;
            if (iso < startDate || iso > endDate) continue;
            if (manualByUserDate.has(`${t.operator_id}|${iso}`)) continue;
            bucket(t.operator_id).autoTimeOffDays += 1;
          }
        }

        let employees = [...byUser.values()];
        if (personName) {
          const needle = personName.toLowerCase();
          employees = employees.filter((s: any) => s.name.toLowerCase().includes(needle));
        }
        employees.sort((a, b) => a.name.localeCompare(b.name));
        return {
          periodStart: startDate,
          periodEnd: endDate,
          note: 'codeCounts = manually marked tracker codes; autoLateDays/autoTimeOffDays are derived from clock-ins and approved time off (same overlays the Attendance Calendar shows). For "how many times late/tardy", use T count + autoLateDays.',
          count: employees.length,
          employees,
        };
      },
    }),

    update_ticket_draft: tool({
      description:
        "LIVE DRAFT PAD — saves NOTHING. While collecting job-ticket details in conversation, call this after EVERY user message with ALL slots gathered so far (even partial). It renders the ticket form on the user's screen filling in live, so they can watch and correct you as you go. Always call it during ticket building, before you have enough to create.",
      inputSchema: z.object({
        customerName: z.string().optional(),
        jobType: z.string().optional().describe('Snap to the closest real service type before drafting'),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        scope: z.string().optional(),
        address: z.string().optional(),
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
      }),
      execute: async (slots) => ({ ok: true, drafted: Object.keys(slots).filter((k) => (slots as any)[k]) }),
    }),

    create_job_ticket: tool({
      description:
        "CREATE a new job ticket (quick-add) on the schedule. WRITE ACTION — only call this after you have collected the required details AND the user has explicitly confirmed a read-back summary in this conversation. Required: customer/contractor name, job type (MUST be one of the company's service types — see the enum; map what the user SAID to the closest one, e.g. 'wall saw' -> 'Wall/Track Sawing', and include your mapping in the read-back), start date. Optional: scope description, address, site contact name/phone, end date, priority. The job lands pending review and office staff complete the full form afterward.",
      inputSchema: z.object({
        customerName: z.string().min(1).describe('Customer / contractor name'),
        jobType: z
          .enum(['Electric Core Drilling', 'High Frequency Core Drilling', 'Hydraulic Core Drilling', 'Diesel Floor Sawing', 'Electric Floor Sawing', 'Wall/Track Sawing', 'Chain Sawing', 'Handheld / Push Sawing', 'Wire Sawing', 'GPR Scanning', 'Selective Demo', 'Brokk', 'Other'])
          .describe("The company's service types — voice transcripts are noisy ('wall sign' means 'Wall/Track Sawing'); ALWAYS snap to the closest real service and confirm it in the read-back"),
        startDate: z.string().describe('Scheduled start date, YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD (defaults to start date)'),
        scope: z.string().optional().describe('Scope / work description'),
        address: z.string().optional().describe('Jobsite address'),
        contactName: z.string().optional().describe('Site contact name'),
        contactPhone: z.string().optional().describe('Site contact phone'),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      }),
      execute: async ({ customerName, jobType, startDate, endDate, scope, address, contactName, contactPhone, priority }) => {
        // Write access mirrors the schedule board's own quick-add population.
        const CAN_CREATE = ['admin', 'super_admin', 'operations_manager', 'salesman'];
        if (!CAN_CREATE.includes(role)) {
          return { error: 'Creating job tickets is restricted to admin, operations, and sales roles.' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          return { error: 'startDate must be YYYY-MM-DD.' };
        }
        if (endDate && endDate < startDate) {
          return { error: 'endDate must be on or after startDate.' };
        }

        const jobNumber = `QA-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        // The pending queue shows "Submitted by {salesman_name}" — stamp the
        // logged-in creator so voice tickets never read "Unknown".
        const { data: creator } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        const { data: job, error } = await supabaseAdmin
          .from('job_orders')
          .insert({
            job_number: jobNumber,
            title: `${customerName.trim()} — ${jobType.trim()}`,
            customer_name: customerName.trim(),
            customer_contact: contactPhone || null,
            status: role === 'super_admin' ? 'scheduled' : 'pending_approval',
            priority: priority || 'medium',
            scheduled_date: startDate,
            end_date: endDate || startDate,
            description: scope || null,
            job_type: jobType.trim(),
            address: address || null,
            location: address || null,
            foreman_name: contactName || null,
            foreman_phone: contactPhone || null,
            salesman_name: creator?.full_name || null,
            created_by: userId,
            created_via: 'artifex',
            missing_info_items: ['equipment_needed', 'jobsite_conditions', 'permits', 'full_scope'],
            missing_info_note: 'Created by Artifex (voice/chat) — please complete the full Schedule Form.',
            tenant_id: tenantId,
          })
          .select('id, job_number, status')
          .single();
        if (error) throw new Error(`create_job_ticket: ${error.message}`);

        Promise.resolve(
          supabaseAdmin.from('audit_logs').insert({
            user_id: userId,
            action: 'artifex_job_created',
            entity_type: 'job_order',
            entity_id: job.id,
            details: { job_number: jobNumber, customer: customerName.trim(), job_type: jobType.trim(), scheduled_date: startDate },
          })
        ).then(() => {}).catch(() => {});

        return {
          created: true,
          jobNumber: job.job_number,
          status: job.status,
          note:
            job.status === 'pending_approval'
              ? 'Created as pending approval — an admin approves it on the schedule board.'
              : 'Created directly on the schedule.',
        };
      },
    }),

    invite_team_member: tool({
      description:
        "SEND A PLATFORM INVITATION to a new team member by email (they get a branded setup link to create their own password). WRITE ACTION — only call after the user confirms name + email + role in a read-back. The role must be BELOW the caller's own rank (you can never invite a super_admin). Roles: admin, operations_manager, salesman, supervisor, shop_manager, shop_help, inventory_manager, operator, apprentice.",
      inputSchema: z.object({
        fullName: z.string().min(1).describe('New team member full name'),
        email: z.string().email().describe('Their email — the invite goes here'),
        role: z.enum(['admin', 'operations_manager', 'salesman', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager', 'operator', 'apprentice']),
        phone: z.string().optional().describe('Optional cell number — the setup link is ALSO texted from the company toll-free line'),
      }),
      execute: async ({ fullName, email, role: targetRole, phone }) => {
        // Same rank guard as the invite screen: strictly below the inviter.
        if (!canInviteRole(role, targetRole)) {
          return { error: `Your role (${getRoleLabel(role)}) cannot invite a ${getRoleLabel(targetRole)}.` };
        }
        if (!isEmailConfigured()) return { error: 'Email is not configured on the platform.' };
        const cleanEmail = email.trim().toLowerCase();

        // Cross-tenant takeover guard (same rule as the invite screen): an
        // email that exists ANYWHERE on the platform cannot be re-invited.
        const { data: existing } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .ilike('email', cleanEmail)
          .maybeSingle();
        if (existing) return { error: 'That email already has an account on the platform.' };

        const { data: inviter } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('name, company_code')
          .eq('id', tenantId)
          .maybeSingle();

        const { data: invite, error } = await supabaseAdmin
          .from('user_invitations')
          .insert({ tenant_id: tenantId, email: cleanEmail, role: targetRole, invited_name: fullName.trim(), invited_by: userId })
          .select('token')
          .single();
        if (error || !invite?.token) return { error: 'Could not create the invitation (they may already be invited).' };

        const branding = await getTenantEmailBranding(tenantId);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pontifexindustries.com';
        const html = await generateInviteEmail({
          inviteeName: fullName.trim(),
          inviterName: inviter?.full_name || 'Your team',
          tenantName: tenant?.name || branding.companyName,
          roleLabel: getRoleLabel(targetRole),
          companyCode: tenant?.company_code ?? undefined,
          setupUrl: `${baseUrl}/setup-account?token=${invite.token}`,
          brandColor: branding.brandColor,
          accentColor: branding.accentColor,
          logoUrl: branding.logoUrl,
        });
        const sent = await sendEmail({
          to: cleanEmail,
          subject: `You're invited to join ${tenant?.name || branding.companyName}`,
          html,
        });
        if (!sent) return { error: 'Invitation created but the email failed to send — resend it from Team Management.' };
        // Optional SMS with the same setup link (best-effort, metered).
        let texted = false;
        if (phone) {
          const formatted = formatPhoneNumber(phone);
          if (formatted) {
            const { sendSMSAny } = await import('@/lib/sms');
            const sms = await sendSMSAny({
              to: formatted,
              message: `${tenant?.name || branding.companyName}: you're invited to join the team. Set up your account: ${baseUrl}/setup-account?token=${invite.token}`,
              tenantId,
              source: 'team_invite_sms',
            }).catch(() => ({ success: false }));
            texted = !!(sms as any)?.success;
          }
        }
        return { invited: true, email: cleanEmail, texted, role: getRoleLabel(targetRole), note: 'They have 7 days to accept the setup link.' };
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
