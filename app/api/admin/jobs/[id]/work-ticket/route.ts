export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/work-ticket?mode=day|week&date=YYYY-MM-DD
 *
 * Everything the printed WORK TICKET needs, already grouped BY DAY and, inside
 * each day, BY OPERATOR. Backs app/dashboard/admin/jobs/[id]/work-ticket.
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
    const mode: TicketMode = url.searchParams.get('mode') === 'week' ? 'week' : 'day';
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
    const { cards: attributedCards } = await attributableTimecards(
      jobId,
      ticketUserIds,
      ticketDates,
      TIMECARD_ATTRIBUTION_SELECT,
      'timecards',
      tenantId
    );
    const timecards = attributedCards as TicketTimecardRow[];

    // ── 3. Names for everyone who can appear on the ticket ─────────────────
    const memberIds = new Set<string>();
    if (job.assigned_to) memberIds.add(job.assigned_to);
    if (job.helper_assigned_to) memberIds.add(job.helper_assigned_to);
    for (const c of crewRows) if (c.user_id) memberIds.add(c.user_id);
    for (const t of timecards) if (t.user_id) memberIds.add(t.user_id);
    for (const l of logs) if (l.operator_id) memberIds.add(l.operator_id);
    for (const w of workItems) if (w.operator_id) memberIds.add(w.operator_id);
    for (const h of helperLogs) if (h.helper_id) memberIds.add(h.helper_id);

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

    // WHO LED EACH DAY. The office reassigns leads mid-job, so the job-level
    // `assigned_to` is not enough to decide whose measurements the sheet
    // prints. The per-day crew ledger is the office's own record of it.
    const { data: dayLeadRows } = await supabaseAdmin
      .from('job_daily_assignments')
      .select('assignment_date, operator_id')
      .eq('job_order_id', jobId)
      .not('operator_id', 'is', null);
    const leadByDate = new Map<string, string>(
      ((dayLeadRows as Array<{ assignment_date: string; operator_id: string }>) ?? [])
        .filter((r) => r.assignment_date && r.operator_id)
        .map((r) => [r.assignment_date, r.operator_id])
    );

    // ── 5. Range + grouping ────────────────────────────────────────────────
    const worked = datesWorked(timecards, logs, workItems, helperLogs);
    const today = toLocalYMD();
    const anchor = dateParam && YMD.test(dateParam) ? dateParam : defaultAnchorDate(worked, today);
    const range = ticketRange(mode, anchor);

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
