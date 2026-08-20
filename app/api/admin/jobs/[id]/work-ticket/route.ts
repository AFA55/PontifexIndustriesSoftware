export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/work-ticket?mode=job|day|week&date=YYYY-MM-DD
 *
 * Everything the printed WORK TICKET needs, grouped BY DAY and, inside each
 * day, BY OPERATOR. Backs app/dashboard/admin/jobs/[id]/work-ticket, whose
 * sheet prints the work rolled up on one side and these person-days on the
 * other.
 *
 * `mode` DEFAULTS TO 'job' — the whole span the crew was here. It used to
 * default to 'day', and that is the entire bug behind JOB-2026-793440: two men
 * worked Monday and Tuesday, all four clock cards were attributable, and the
 * sheet printed Tuesday because Tuesday was the only day it asked for.
 *
 * WHICH DAYS THE JOB RAN is answered from FIVE sources unioned, never one:
 * clock cards linked to the job, cards attributed to it by the office's
 * placement, operator daily logs, helper work logs, and the board's own
 * `job_daily_assignments`. A day the crew worked and never filed paperwork for
 * used to be invisible no matter how the hours rules read.
 *
 * Tenant scoping: the job row is fetched first and its `tenant_id` becomes the
 * scope for every subsequent query on a table that HAS a tenant_id column. A
 * non-super-admin whose own tenant doesn't match gets a 404 (never a
 * cross-tenant read); super_admin needs no `?tenantId=` because the job itself
 * supplies the scope. `profiles` IS scoped too (it does have tenant_id —
 * defence in depth; every id it resolves already came from a scoped row).
 *
 * GET — requireSalesStaff (PRINT_VIEWER_ROLES). Was requireAdmin, which meant
 * the job page admitted five roles and this route answered three: the two
 * "project manager" roles (salesman, supervisor) got a rendered Print Work
 * Ticket button and a 403 behind it. Read-only render of a job they may
 * already open — the tenant scoping below is what protects the data, and it is
 * unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { notFoundInCompany } from '@/lib/tenant-scope';
import { toLocalYMD } from '@/lib/dates';
import { attributableTimecards, TIMECARD_ATTRIBUTION_SELECT } from '@/lib/job-clock-attribution';
import { STANDBY_HOURLY_RATE, STANDBY_MINIMUM_HOURS } from '@/lib/legal/standby-policy';
import {
  buildTicketDays,
  datesWorked,
  defaultAnchorDate,
  grandTotalHours,
  resolveCrewRoles,
  spanOf,
  ticketRange,
  type TicketDailyLog,
  type TicketHelperLog,
  type TicketMode,
  type TicketTimecardRow,
  type TicketWorkItem,
} from '@/lib/work-ticket';

type RouteContext = { params: Promise<{ id: string }> };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const url = new URL(request.url);
    // 'job' is the DEFAULT — a ticket that opens on one day cannot answer "who
    // was where and when". See `ticketRange` in lib/work-ticket.ts.
    const modeParam = url.searchParams.get('mode');
    const mode: TicketMode =
      modeParam === 'week' ? 'week' : modeParam === 'day' ? 'day' : 'job';
    const dateParam = url.searchParams.get('date');

    // ── 1. Job (also the tenant scope for everything below) ────────────────
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select(
        `id, job_number, tenant_id, status, customer_name, customer_contact, customer_email,
         foreman_name, foreman_phone, site_contact_phone, location, address, description,
         po_number, customer_job_number, job_site_number, project_name, title,
         scheduled_date, scheduled_end_date, end_date, actual_end_date,
         assigned_to, helper_assigned_to, parent_job_id,
         completion_signature, completion_signer_name, completion_signed_at,
         customer_signature, customer_signed_at,
         require_waiver_signature, utility_waiver_signed, utility_waiver_signed_at,
         utility_waiver_signer_name, liability_release_signed_at`
      )
      .eq('id', jobId)
      .maybeSingle();

    // Missing and cross-company get the SAME answer, deliberately — a 404 that
    // confirmed "that one lives at Patriot" would let anyone walk ids to
    // enumerate another company's data. The wording names the company the
    // caller is signed in to, which they already know, so a founder who is in
    // the Pontifex portal looking at a Patriot job is told why rather than
    // being shown a bare "Job not found". See lib/tenant-scope.ts.
    if (jobError || !job) {
      return notFoundInCompany(auth.tenantId);
    }
    // Only this company's jobs. `auth.tenantId` is non-null for every role
    // except a tenant-less super_admin.
    if (auth.tenantId && job.tenant_id !== auth.tenantId) {
      return notFoundInCompany(auth.tenantId);
    }
    const tenantId: string | null = job.tenant_id ?? auth.tenantId ?? null;
    // The job row already proved the tenant above; this keeps every child query
    // scoped to the SAME tenant (defence in depth against a mis-tagged row).
    const scoped = (q: any) => (tenantId ? q.eq('tenant_id', tenantId) : q);

    // ── 2. Crew, times, work, notes ─────────────────────────────────────────
    const [crewRes, logRes, wiRes, helperRes, standbyRes, subsistRes] = await Promise.all([
      scoped(supabaseAdmin.from('job_crew').select('user_id, role').eq('job_order_id', jobId)),
      scoped(
        supabaseAdmin
          .from('daily_job_logs')
          .select('id, operator_id, log_date, day_number, hours_worked, work_performed, notes')
          .eq('job_order_id', jobId)
      ),
      scoped(
        supabaseAdmin
          .from('work_items')
          .select(
            `id, operator_id, daily_log_id, day_number, work_date, work_type, quantity, notes, details_json,
             core_quantity, core_size, core_depth_inches, linear_feet_cut, cut_depth_inches,
             accessibility_rating, accessibility_description, created_at`
          )
          .eq('job_order_id', jobId)
      ),
      scoped(
        supabaseAdmin
          .from('helper_work_logs')
          .select('helper_id, log_date, work_description, hours_worked')
          .eq('job_order_id', jobId)
          .eq('is_shop_ticket', false)
      ),
      scoped(
        supabaseAdmin
          .from('standby_logs')
          .select('id, started_at, ended_at, duration_hours, reason, client_representative_name')
          .eq('job_order_id', jobId)
      ),
      scoped(
        supabaseAdmin
          .from('subsistence_nights')
          .select('id, night_date, operator_id')
          .eq('job_order_id', jobId)
      ),
    ]);

    const crewRows = (crewRes.data || []) as Array<{ user_id: string; role: string | null }>;
    const logs = (logRes.data || []) as TicketDailyLog[];
    const workItems = (wiRes.data || []) as TicketWorkItem[];
    const helperLogs = (helperRes.data || []) as TicketHelperLog[];
    const standby = (standbyRes.data || []) as Array<{
      id: string;
      started_at: string | null;
      ended_at: string | null;
      duration_hours: number | null;
      reason: string | null;
      client_representative_name: string | null;
    }>;
    const subsistence = (subsistRes.data || []) as Array<{ night_date: string | null }>;

    // ── 2b. The crew's CLOCK CARDS ───────────────────────────────────────────
    // `tcRes` above only asked for cards tagged `job_order_id = this job`, and
    // only 34 of 251 production cards carry that tag — so the printed ticket
    // showed START and END blank and "0.00" against real work days. On
    // JOB-2026-424813 the whole week printed 47.47 hours with Aug 3 at 0.00,
    // even though Zack was on the clock 9.82 hours that day.
    //
    // `attributableTimecards` is the same rule the Daily Progress panel uses —
    // one shared implementation so the printed sheet and the screen can never
    // disagree about a day. It counts a card only when it is linked to this
    // job, or when it has no link and its owner touched no other job that day.
    const ticketUserIds = Array.from(
      new Set(
        [
          job.assigned_to,
          job.helper_assigned_to,
          ...crewRows.map((c) => c.user_id),
          ...logs.map((l) => l.operator_id),
          ...helperLogs.map((h) => h.helper_id),
        ].filter(Boolean) as string[]
      )
    );
    const ticketDates = Array.from(
      new Set(
        [
          ...logs.map((l) => l.log_date),
          ...helperLogs.map((h) => h.log_date),
        ].filter(Boolean) as string[]
      )
    );
    // `tenantId` is passed like every other read on this route. Without it the
    // helper's own queries run unscoped under `supabaseAdmin` (which bypasses
    // RLS): a second tenant's placement on the same date can make one of these
    // people look "placed on 2 jobs" and their card is dropped — a silent
    // cross-tenant UNDER-count on the sheet the office files.
    const {
      cards: attributedCards,
      attributedIds,
      offJobPersonDays,
      // The days whose card was dropped as unattributable. Discarding this was
      // how a man who clocked 8.58 hours printed as "no clock card was
      // recorded" — see `hours_split` in lib/work-ticket.ts.
      splitPersonDays,
      // THE IN-ROUTE PRESS IS THE JOB BOUNDARY (founder, Aug 19). On a day the
      // crew ran two jobs off one clock cycle, this carries each card's share
      // of it. Without it the second job fell back to its daily log's open
      // duration — Sterling printed 0.04 h against three and a half hours.
      boundarySegments,
    } = await attributableTimecards(
      jobId,
      ticketUserIds,
      ticketDates,
      TIMECARD_ATTRIBUTION_SELECT,
      'timecards',
      tenantId
    );
    const timecards = attributedCards as TicketTimecardRow[];

    // WHO LED EACH DAY, AND WHO WAS SENT WITH THEM.
    //
    // The office reassigns leads mid-job, so the job-level `assigned_to` is not
    // enough to decide whose measurements the sheet prints. The per-day crew
    // ledger is the office's own record of it — and of who was on this job on
    // which date, which is the question the printed sheet exists to answer. The
    // helper column is read too now: the board writes both seats, and reading
    // only the operator meant a helper the office SENT could not put a day on
    // the sheet.
    //
    // TENANT-SCOPED like every other read on this route. `supabaseAdmin`
    // bypasses RLS and this one was running across all tenants.
    const { data: dayAssignRows, error: dayAssignError } = await scoped(
      supabaseAdmin
        .from('job_daily_assignments')
        .select('assignment_date, operator_id, helper_id, day_sequence')
        .eq('job_order_id', jobId)
        // ORDERED so `leadByDate` is DECIDED rather than whatever PostgREST
        // happened to return. The map takes the FIRST operator it sees for a
        // date, and with no ORDER BY that was the storage order — a reindex or
        // a re-save could silently change whose measurements the printed sheet
        // carries. `day_sequence` is the board's own ordering of a day's jobs;
        // `assignment_date` breaks the remaining tie. No production job/date
        // has two operator rows today, so nothing on any sheet moves — this
        // only stops it moving on its own later.
        .order('day_sequence', { ascending: true, nullsFirst: false })
        .order('assignment_date', { ascending: true })
    );
    // A dead read here must not present as "nobody was scheduled" — that is the
    // exact shape of the bug this ticket keeps hitting (a failed select
    // rendering as an empty job). Answer 500 via the outer catch instead.
    if (dayAssignError) {
      throw new Error(
        `job_daily_assignments read failed: ${dayAssignError.message ?? 'unknown error'}`
      );
    }
    const dayAssignments = (dayAssignRows ?? []) as Array<{
      assignment_date: string | null;
      operator_id: string | null;
      helper_id: string | null;
      day_sequence: number | null;
    }>;
    const leadByDate = new Map<string, string>();
    // `user_id|YYYY-MM-DD` for everyone the board placed on THIS job.
    const scheduledPersonDays = new Set<string>();
    const scheduledDates = new Set<string>();
    for (const r of dayAssignments) {
      if (!r.assignment_date) continue;
      if (r.operator_id) {
        if (!leadByDate.has(r.assignment_date)) leadByDate.set(r.assignment_date, r.operator_id);
        scheduledPersonDays.add(`${r.operator_id}|${r.assignment_date}`);
      }
      if (r.helper_id) scheduledPersonDays.add(`${r.helper_id}|${r.assignment_date}`);
      // Skeleton rows hold a date open on the board with nobody on it — they
      // are not a day anyone was here.
      if (r.operator_id || r.helper_id) scheduledDates.add(r.assignment_date);
    }

    // ── 3. Names for everyone who can appear on the ticket ─────────────────
    const memberIds = new Set<string>();
    if (job.assigned_to) memberIds.add(job.assigned_to);
    if (job.helper_assigned_to) memberIds.add(job.helper_assigned_to);
    for (const c of crewRows) if (c.user_id) memberIds.add(c.user_id);
    for (const t of timecards) if (t.user_id) memberIds.add(t.user_id);
    for (const l of logs) if (l.operator_id) memberIds.add(l.operator_id);
    for (const w of workItems) if (w.operator_id) memberIds.add(w.operator_id);
    for (const h of helperLogs) if (h.helper_id) memberIds.add(h.helper_id);
    // …and everyone the BOARD placed here. A man scheduled onto this job who
    // never clocked in still gets a row (see `scheduledPersonDays`), and a row
    // reading "Crew member" is not an answer to "who was where".
    for (const key of scheduledPersonDays) memberIds.add(key.slice(0, key.lastIndexOf('|')));

    const names = new Map<string, string | null>();
    if (memberIds.size > 0) {
      const { data: profs } = await scoped(
        supabaseAdmin
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(memberIds))
      );
      for (const p of profs || []) names.set(p.id, p.full_name ?? null);
    }

    // ── 4. Duplicated-job lineage (parent + sibling crew tickets) ──────────
    let parentJob: { id: string; job_number: string } | null = null;
    if (job.parent_job_id) {
      const { data: parent } = await scoped(
        supabaseAdmin.from('job_orders').select('id, job_number').eq('id', job.parent_job_id)
      ).maybeSingle();
      parentJob = parent ?? null;
    }
    const { data: childRows } = await scoped(
      supabaseAdmin
        .from('job_orders')
        .select('id, job_number')
        .eq('parent_job_id', jobId)
        .is('deleted_at', null)
    );

    // ── 5. Range + grouping ────────────────────────────────────────────────
    const today = toLocalYMD();
    // EVERY DAY THIS CREW WAS ON THIS JOB — the five paths, unioned, because a
    // reader that checks only one has caused this exact bug repeatedly here:
    // clock cards (linked or attributed), operator logs, work items, helper
    // logs, and the office's own board. A future placement is excluded: the
    // board holds next week, and a printed ticket must not claim a day that
    // has not happened.
    const worked = Array.from(
      new Set([
        ...datesWorked(timecards, logs, workItems, helperLogs),
        ...Array.from(scheduledDates).filter((d) => d <= today),
      ])
    ).sort();
    const anchor = dateParam && YMD.test(dateParam) ? dateParam : defaultAnchorDate(worked, today);
    const range = ticketRange(mode, anchor, spanOf(worked));

    const days = buildTicketDays({
      range,
      timecards,
      logs,
      workItems,
      helperLogs,
      roles: resolveCrewRoles({
        assigned_to: job.assigned_to,
        helper_assigned_to: job.helper_assigned_to,
        crew: crewRows,
      }),
      names,
      fallbackOperatorId: job.assigned_to ?? null,
      // The printed sheet carries the LEAD's measurements only — see the note
      // on `quantitiesFrom`. Everyone else keeps their name and hours.
      quantitiesFrom: 'lead',
      leadByDate,
      // Days the office's own ledger puts these people on OTHER jobs. Without
      // this the daily log's `hours_worked` becomes the day's hours whenever no
      // card claimed the day, and a five-minute closeout typed from the next
      // job's truck printed as a work day — Dante's 0.09 Wednesday on
      // JOB-2026-277097. See `offJobPersonDays` in lib/work-ticket.ts.
      offJobPersonDays,
      // The board's own placements — a day the office SENT someone to is a day
      // on the sheet even when nobody clocked or filed anything from it.
      scheduledPersonDays,
      // Days the board split between this job and another, so the sheet can say
      // "hours split across jobs" instead of asserting nothing was clocked.
      splitPersonDays,
      // Which of these hours are inferred rather than read off a tagged card.
      // The founder writes invoices from this sheet; the two must not print
      // identically. See `hours_attributed` in lib/work-ticket.ts.
      attributedCardIds: attributedIds,
      // Each card's share of a day the crew split between jobs, bounded by the
      // in-route presses. See `boundarySegments` in lib/work-ticket.ts.
      boundarySegments,
      todayYMD: today,
    });

    // ── 6. Standby / subsistence inside the printed range ──────────────────
    const standbyInRange = standby.filter((s) => {
      if (!s.started_at) return false;
      const d = new Date(s.started_at);
      if (Number.isNaN(d.getTime())) return false;
      const ymd = toLocalYMD(d);
      return ymd >= range.from && ymd <= range.to;
    });
    const standbyHours = standbyInRange.reduce((sum, s) => sum + (Number(s.duration_hours) || 0), 0);
    const subsistenceNights = subsistence.filter(
      (s) => s.night_date && s.night_date >= range.from && s.night_date <= range.to
    ).length;

    // Standby terms for the agreement block. SINGLE SOURCE OF TRUTH: the
    // tenant's active policy, else the constants /api/standby actually bills
    // with. Never a ticket-only rate — the customer signs both documents.
    let standbyRate: number = STANDBY_HOURLY_RATE;
    let standbyMinimumHours: number = STANDBY_MINIMUM_HOURS;
    if (tenantId) {
      const { data: policy } = await supabaseAdmin
        .from('standby_policies')
        .select('hourly_rate, minimum_charge_hours')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        // A policy that takes effect NEXT month must not price today's ticket.
        .lte('effective_date', today)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (policy?.hourly_rate != null && Number(policy.hourly_rate) > 0) {
        standbyRate = Number(policy.hourly_rate);
      }
      if (policy?.minimum_charge_hours != null && Number(policy.minimum_charge_hours) > 0) {
        standbyMinimumHours = Number(policy.minimum_charge_hours);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        job: {
          id: job.id,
          job_number: job.job_number,
          status: job.status,
          customer_name: job.customer_name,
          contact_name: job.customer_contact ?? job.foreman_name ?? null,
          contact_phone: job.site_contact_phone ?? job.foreman_phone ?? null,
          address: job.address ?? job.location ?? null,
          location: job.location ?? null,
          description: job.description ?? null,
          po_number: job.po_number ?? job.customer_job_number ?? null,
          job_site_number: job.job_site_number ?? null,
          project_name: job.project_name ?? job.title ?? null,
          scheduled_date: job.scheduled_date ?? null,
          end_date: job.end_date ?? job.scheduled_end_date ?? job.actual_end_date ?? null,
          lead_name: job.assigned_to ? names.get(job.assigned_to) ?? null : null,
          helper_name: job.helper_assigned_to ? names.get(job.helper_assigned_to) ?? null : null,
          signature_url: job.completion_signature || job.customer_signature || null,
          signer_name: job.completion_signer_name ?? null,
          signed_at: job.completion_signed_at ?? job.customer_signed_at ?? null,
          // Signature STATUS, not the wall of legal text (founder, Aug 12: "it
          // just has to show if it's been signed or not, because it gets signed
          // digitally — I don't need the verbiage").
          waiver_required: job.require_waiver_signature === true,
          waiver_signed: job.utility_waiver_signed === true,
          waiver_signed_at: job.utility_waiver_signed_at ?? null,
          waiver_signer_name: job.utility_waiver_signer_name ?? null,
          completion_signed: !!(job.completion_signature || job.customer_signature),
          parent_job: parentJob,
          sibling_jobs: ((childRows || []) as Array<{ id: string; job_number: string }>).map((c) => ({
            id: c.id,
            job_number: c.job_number,
          })),
        },
        mode,
        anchor_date: anchor,
        range,
        dates_worked: worked,
        days,
        totals: {
          hours: grandTotalHours(days),
          standby_hours: Math.round(standbyHours * 100) / 100,
          subsistence_nights: subsistenceNights,
        },
        standby: standbyInRange,
        standby_rate: standbyRate,
        standby_minimum_hours: standbyMinimumHours,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /work-ticket:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
