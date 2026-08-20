export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/completion-summary
 * Everything the Completed Job Ticket screen renders: the job as the office
 * wrote it (scope, quote, equipment, conditions, PPE, permits), the work that
 * came back, the hours it took paired day by day, the paperwork, and the photos.
 *
 * WHAT WENT WRONG HERE (fixed Aug 17 2026). The select below used to name
 * ELEVEN columns while the page read about forty. Every field it never asked
 * for arrived `undefined` and rendered blank — customer name, address, dates,
 * PO number, site contact, salesperson, description, the sign-off PDF — which
 * on screen is indistinguishable from "we never collected it". It also signed
 * `liability_release_pdf_url` / `work_order_pdf_url` / `silica_plan_pdf_url`,
 * three columns that do not exist on `job_orders` (the real ones are
 * `liability_release_pdf`, `agreement_pdf`, `silica_form_pdf`), and it returned
 * neither `labor_rows` nor `documents` even though the page reads both — so the
 * Labor Hours table was empty on every job regardless of the data. This is the
 * third time on this platform that an unselected column has been mistaken for
 * missing data; the select is now explicit about every field the page names.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { attributableTimecards } from '@/lib/job-clock-attribution';
import { bookedEndDateOf, dropHelperDoubleCountedCards } from '@/lib/labor-cost';
import {
  buildCompletedJobDays,
  laborRowHours,
  type DayTimecardLike,
} from '@/lib/completed-job-days';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // READ-ONLY, widened to match the page that calls it.
    // This route is the ONLY source of signed photos + PDFs for Completed Job
    // Tickets. On 403 the page silently fell back to a client-side Supabase read
    // that deliberately leaves photos empty — so Adam saw a ticket with no
    // photos and no labor hours, and nothing said why.
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;

    // Tenant scoping: super_admin may pass ?tenantId= to override; everyone
    // else is locked to their own tenant. Mirrors the pattern in /summary.
    const overrideTenantId = request.nextUrl.searchParams.get('tenantId');
    const tenantId = auth.tenantId ?? (auth.role === 'super_admin' ? overrideTenantId : null);
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
        { status: 400 }
      );
    }

    // ── 1. Fetch the job ────────────────────────────────────────────────────
    //
    // EVERY NAME BELOW MUST BE A REAL COLUMN. PostgREST rejects the WHOLE
    // select on a single bad name (42703), so one typo does not degrade the
    // response — it errors the query, `.single()` fails, and this route returns
    // 404 "Job not found" for every job. The page then falls back to its
    // degraded client path: no day-by-day panel, no attributed/clocked
    // labelling, and hours computed by the same net_hours-first rule this
    // sprint proved wrong. The feature reads as merely empty rather than dead,
    // which is why it survived a full build and typecheck.
    //
    // This route shipped that bug twice. First with
    // liability_release_pdf_url / work_order_pdf_url / silica_plan_pdf_url,
    // then again with agreement_pdf_generated_at / silica_form_completed_at.
    // The real columns are `liability_release_pdf`, `agreement_pdf` and
    // `silica_form_pdf`; there are no `_url`, `_generated_at` or `_completed_at`
    // siblings. All 83 names below were checked against information_schema.
    //
    // `tsc` cannot catch this class of error and neither can `npm run build`.
    // The only guard is confirming a column exists before adding it here.
    //
    // Comments do NOT belong inside the template literal — its contents are
    // sent verbatim as the column list, so a `//` line becomes a bogus column
    // name and reintroduces exactly the failure described above.
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select(`
        id, job_number, title, project_name, status, tenant_id, customer_id,
        customer_name, customer_contact, customer_email, site_contact_phone,
        foreman_name, foreman_phone, salesman_name, salesperson_email,
        address, location, job_site_number, directions,
        scheduled_date, scheduled_end_date, end_date, actual_end_date,
        work_started_at, route_started_at, work_completed_at,
        completion_submitted_at, completion_signed_at, completion_signer_name,
        completion_pdf_url, completion_signature_url, completion_signature,
        completion_notes, contact_not_on_site,
        customer_signature, customer_signed_at,
        liability_release_pdf, liability_release_signed_by, liability_release_signed_at,
        agreement_pdf, silica_form_pdf,
        require_waiver_signature, utility_waiver_signed, utility_waiver_signed_at,
        utility_waiver_signer_name,
        po_number, customer_job_number, description, work_performed,
        operator_notes, issues_encountered, materials_used, equipment_used,
        billing_type, estimated_cost, job_quote, total_revenue, estimated_hours,
        expected_scope, scope_details, scope_photo_urls,
        equipment_needed, special_equipment, special_equipment_notes,
        equipment_selections, equipment_rentals, equipment_rental_flags,
        jobsite_conditions, ppe_required, additional_safety_requirements,
        permit_required, permits,
        assigned_to, helper_assigned_to,
        is_multi_day, total_days_worked, total_hours_worked,
        customer_overall_rating, customer_cleanliness_rating,
        customer_communication_rating, customer_feedback_comments, feedback_submitted_at,
        photo_urls
      `)
      .eq('id', jobId);

    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      console.error('[completion-summary] job fetch failed', { jobId, tenantId, jobError });
      return NextResponse.json({ error: 'Job not found', debug: jobError?.message }, { status: 404 });
    }

    // ── 2. Fetch work_items ─────────────────────────────────────────────────
    let workItemsQuery = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) workItemsQuery = workItemsQuery.eq('tenant_id', tenantId);
    const { data: workItems } = await workItemsQuery.order('day_number', { ascending: true });

    // ── 3. Fetch daily_job_logs ─────────────────────────────────────────────
    let logsQuery = supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) logsQuery = logsQuery.eq('tenant_id', tenantId);
    const { data: dailyLogs } = await logsQuery.order('log_date', { ascending: true });

    // ── 4. The crew's CLOCK CARDS ───────────────────────────────────────────
    // Was `.eq('job_order_id', jobId).order('work_date')` — two bugs in one
    // line. `timecards` has no `work_date` column (it is `date`), so the order
    // clause errored the query and `timecards` came back null on EVERY job; and
    // even had it run, only a minority of production cards carry a job link.
    // `attributableTimecards` is the shared rule the printed work ticket uses,
    // so the ticket, the labor cost and this screen can no longer disagree
    // about who worked a job. Cards taken WITHOUT a job link come back in
    // `attributedIds` and stay labelled as attributed all the way to the pixel.
    let helperLogsQuery = supabaseAdmin
      .from('helper_work_logs')
      .select('id, helper_id, log_date, hours_worked, work_description, started_at, completed_at, is_shop_ticket')
      .eq('job_order_id', jobId);
    if (tenantId) helperLogsQuery = helperLogsQuery.eq('tenant_id', tenantId);
    const [{ data: helperLogs }, { data: crewRows }] = await Promise.all([
      helperLogsQuery.order('log_date', { ascending: true }),
      supabaseAdmin.from('job_crew').select('user_id').eq('job_order_id', jobId),
    ]);

    const jobAny = job as Record<string, any>;
    const crewUserIds = Array.from(
      new Set(
        [
          jobAny.assigned_to,
          jobAny.helper_assigned_to,
          ...((crewRows || []) as Array<{ user_id: string | null }>).map((c) => c.user_id),
          ...((dailyLogs || []) as Array<{ operator_id: string | null }>).map((l) => l.operator_id),
          ...((helperLogs || []) as Array<{ helper_id: string | null }>).map((h) => h.helper_id),
        ].filter(Boolean) as string[]
      )
    );
    const crewDates = Array.from(
      new Set(
        [
          ...((dailyLogs || []) as Array<{ log_date: string | null }>).map((l) => l.log_date),
          ...((helperLogs || []) as Array<{ log_date: string | null }>).map((h) => h.log_date),
        ].filter(Boolean) as string[]
      )
    );
    // `tenantId` is passed rather than dropped: this route previously carried
    // its own `.eq('tenant_id', tenantId)` on the timecard read and lost it
    // when the query moved into `attributableTimecards`. `supabaseAdmin`
    // bypasses RLS, so that filter is the only tenant boundary on this path.
    const {
      cards: attributedCards,
      attributedIds,
      splitDates,
      // Each card's share of a day the crew ran more than one job, divided at
      // the in-route presses. See `boundarySegments` in job-clock-attribution.
      boundarySegments,
      boundaryIds,
    } = await attributableTimecards(
      jobId,
      crewUserIds,
      crewDates,
      'id, user_id, date, clock_in_time, clock_out_time, total_hours, net_hours, ' +
        'regular_hours, overtime_hours, night_shift_premium_hours, ' +
        'is_shop_hours, is_shop_time, work_location, job_order_id',
      'timecards',
      tenantId
    );

    // DON'T BILL THE SAME PERSON-DAY TWICE — the helper's own log row wins over
    // their inferred day card. This guard was written once, for the P&L route,
    // and this route (which feeds the screen the office writes invoices from)
    // did not have it. It is now the shared rule in lib/labor-cost.ts, applied
    // here so `labor_rows` and `work_days` below are built from the same cards.
    const timecards = dropHelperDoubleCountedCards(
      attributedCards as Array<{ id: string; user_id?: string | null; date?: string | null }>,
      // A boundary-divided card is inferred for this job the same way an
      // untagged one is, so the double-count guard must see it too.
      new Set([...attributedIds, ...boundaryIds]),
      helperLogs as Array<{ helper_id: string | null; log_date: string | null; hours_worked: number | null }>
    );

    // Names for everyone who can appear on this screen.
    const nameIds = Array.from(
      new Set([
        ...crewUserIds,
        ...((timecards || []) as Array<{ user_id: string | null }>).map((t) => t.user_id),
        ...((workItems || []) as Array<{ operator_id: string | null }>).map((w) => w.operator_id),
      ].filter(Boolean) as string[])
    );
    const names = new Map<string, string | null>();
    if (nameIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', nameIds);
      for (const p of profs || []) names.set(p.id, p.full_name ?? null);
    }

    // WORK PERFORMED next to THE HOURS IT TOOK, one day at a time — the office
    // prices a day, so a day is the unit this returns (founder, Aug 17 2026).
    const workDays = buildCompletedJobDays({
      logs: dailyLogs || [],
      workItems: workItems || [],
      timecards: timecards || [],
      helperLogs: helperLogs || [],
      names,
      attributedIds,
      splitDates,
      // A shared day divides at the in-route presses, and the segment then
      // supersedes the on-site window below — the boundary is the START OF THE
      // NEXT JOB, not this one's completion.
      boundarySegments,
      // The on-site window, so each line can carry the hours THIS JOB is
      // charged next to the person's paid day. Without it the panel showed a
      // paid day (18.27h on JOB-2026-343888) beside a Labor Cost tile built on
      // job-bounded hours (9.74h) with nothing to reconcile them.
      job: {
        work_started_at: jobAny.work_started_at ?? null,
        route_started_at: jobAny.route_started_at ?? null,
        work_completed_at: jobAny.work_completed_at ?? null,
        // Gives the window a real end when the closing stamp is missing on an
        // already-completed job — otherwise it runs forever. See
        // `bookedSpanEndDay` in lib/labor-cost.ts.
        status: jobAny.status ?? null,
        booked_end_date: bookedEndDateOf(
          jobAny.scheduled_end_date,
          jobAny.end_date,
          jobAny.scheduled_date
        ),
      },
    });

    // The flat Labor Hours table the page has always rendered — now actually
    // returned (it read `data.labor_rows`, which this route never sent, so the
    // table was empty on every job) and now sourced from the SAME attributed
    // cards as the day view, so the two can never disagree.
    // Typed as `DayTimecardLike[]`, not `Record<string, any>[]` — every field
    // read below is declared on that interface, so the row shape is CHECKED
    // rather than cast away. A cast here would hide the next column rename the
    // way `work_date` and `clock_in` already hid theirs on this screen.
    const laborRows = ((timecards || []) as DayTimecardLike[]).map((t) => {
      // `laborRowHours` carries three rules this line used to restate:
      // `paidOrLiveCardHours` rather than `net_hours ?? total_hours` (neither
      // column is reliably the lunch-adjusted one and the smaller is the one
      // that got its deduction); SHOP-ZEROED like the day cards above (these
      // rows were not, so this table could show shop hours as job labor); and:
      //
      // THE SEGMENT, WHEN THE DAY DIVIDED. `boundarySegments` was wired into
      // `buildCompletedJobDays` twenty lines above and NOT into this table, so
      // the same cards were billed twice over on one screen: Sterling's day rows
      // read 3.55 / 2.62 (6.17) while this table — the degraded path's only
      // source of hours, and its own footer total — read 19.15, the two crew's
      // WHOLE paid days. A card here can be tagged to another job entirely; only
      // its segment belongs to this one. The rule is `laborRowHours`, shared so
      // no consumer of these cards can restate it wrong a third time.
      const { total, divided, shop } = laborRowHours(t, boundarySegments.get(t.id));
      // REGULAR / OT / NIGHT ARE FACTS ABOUT THE DAY AND DO NOT DIVIDE. The
      // premium split is computed against the whole clocked day (Conrade's Aug 19
      // card: 8.00 regular + 2.09 OT) and nothing records which job the overtime
      // fell in — the same argument that leaves the lunch on the day. Printing
      // the day's 8.00 regular beside a 3.55 total makes a row that does not add
      // up, and apportioning the OT would invent the fact that is missing. So a
      // divided row states its segment as straight time and claims no premium;
      // the day's own split stays on the timecard, where it is true.
      const ot = divided ? 0 : Number(t.overtime_hours) || 0;
      const ns = divided ? 0 : Number(t.night_shift_premium_hours) || 0;
      const reg = divided
        ? total
        : t.regular_hours != null
          ? Number(t.regular_hours) || 0
          : Math.max(0, total - ot);
      return {
        // `user_id` and `date` are nullable on the row. The old
        // `Record<string, any>` cast typed that away, so `names.get(undefined)`
        // compiled clean and would have quietly produced an 'Unknown' operator
        // on a real card. Handled explicitly now instead.
        operator_name: (t.user_id ? names.get(t.user_id) : null) || 'Unknown',
        date: t.date ?? '',
        regular_hrs: reg,
        ot_hrs: ot,
        ns_hrs: ns,
        total,
        attributed: attributedIds.has(t.id),
        shop,
      };
    });

    // ── 5. Fetch invoices ───────────────────────────────────────────────────
    let invoicesQuery = supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('job_order_id', jobId);
    // invoices may not have job_order_id directly — try via line items if none found
    const { data: directInvoices } = await invoicesQuery;

    let invoices = directInvoices || [];
    if (invoices.length === 0) {
      // fallback: look up via invoice_line_items
      const { data: lineItems } = await supabaseAdmin
        .from('invoice_line_items')
        .select('invoice_id')
        .eq('job_order_id', jobId);

      if (lineItems && lineItems.length > 0) {
        const invoiceIds = [...new Set(lineItems.map((li) => li.invoice_id))];
        let fallbackQuery = supabaseAdmin
          .from('invoices')
          .select('*')
          .in('id', invoiceIds);
        if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId);
        const { data: fallbackInvoices } = await fallbackQuery;
        invoices = fallbackInvoices || [];
      }
    }

    // ── 6. Fetch billing_milestones ─────────────────────────────────────────
    let milestonesQuery = supabaseAdmin
      .from('billing_milestones')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) milestonesQuery = milestonesQuery.eq('tenant_id', tenantId);
    const { data: billingMilestones } = await milestonesQuery.order('milestone_percent', { ascending: true });

    // ── 7. Calculate scope_completion ───────────────────────────────────────
    const items = workItems || [];

    const actualCores = items.reduce((sum, i) => sum + Number(i.core_quantity || 0), 0);
    const actualLinearFeet = items.reduce((sum, i) => sum + Number(i.linear_feet_cut || 0), 0);

    const expectedScope = (job.expected_scope as Record<string, unknown>) || {};
    const expectedCores = Number(expectedScope.cores || 0);
    const expectedLinearFeet = Number(expectedScope.linear_feet || 0);

    const pct = (actual: number, expected: number) =>
      expected > 0 ? Math.min(100, Math.round((actual / expected) * 1000) / 10) : 0;

    const scopeCompletion = {
      cores: {
        expected: expectedCores,
        actual: actualCores,
        percent: pct(actualCores, expectedCores),
      },
      linear_feet: {
        expected: expectedLinearFeet,
        actual: actualLinearFeet,
        percent: pct(actualLinearFeet, expectedLinearFeet),
      },
    };

    // PDF buckets (completion-pdfs, contracts) are private (security F1) —
    // sign the doc URLs so the admin viewer can load them. signStoredUrl only
    // touches private-bucket URLs; others pass through unchanged.
    // COLUMN NAMES, not wishes. This used to sign `liability_release_pdf_url`,
    // `work_order_pdf_url` and `silica_plan_pdf_url` — three names that do not
    // exist on `job_orders`, so all three resolved to undefined and the page's
    // doc cards never rendered. The real columns are below. They are also not
    // URLs: `liability_release_pdf` / `agreement_pdf` / `silica_form_pdf` hold
    // base64 payloads (all NULL in production today), so only a value that
    // actually looks like a URL is signed; anything else is passed through for
    // the client to decode, exactly as the Completed Jobs archive does.
    const { signStoredUrl, signStoredUrls } = await import('@/lib/storage-url-server');
    const j = job as any;
    const asUrl = (v: unknown): string | null =>
      typeof v === 'string' && /^(https?:)?\/\//.test(v.trim()) ? v.trim() : null;
    const [completionPdf, liabilityPdf, workOrderPdf, silicaPdf] = await Promise.all([
      signStoredUrl(j.completion_pdf_url),
      signStoredUrl(asUrl(j.liability_release_pdf)),
      signStoredUrl(asUrl(j.agreement_pdf)),
      signStoredUrl(asUrl(j.silica_form_pdf)),
    ]);

    // The page reads `data.documents` and this route never sent it, so the
    // extra generated paperwork was invisible here while showing fine on the
    // Completed Jobs archive.
    let docsQuery = supabaseAdmin
      .from('pdf_documents')
      .select('id, document_name, document_type, file_url, generated_at')
      .eq('job_id', jobId)
      .eq('is_latest', true);
    if (tenantId) docsQuery = docsQuery.eq('tenant_id', tenantId);
    const { data: docRows } = await docsQuery.order('generated_at', { ascending: false });
    const signedDocUrls = await signStoredUrls(
      ((docRows || []) as Array<{ file_url: string | null }>).map((d) => d.file_url || '')
    );
    const documents = ((docRows || []) as Array<Record<string, unknown>>).map((d, i) => ({
      ...d,
      file_url: signedDocUrls[i] || d.file_url,
    }));

    // Latest customer satisfaction review for this job (was hardcoded null, so
    // reviews were stored but never shown on the per-job screen).
    const { data: reviewRows } = await supabaseAdmin
      .from('customer_surveys')
      .select('overall_rating, cleanliness_rating, communication_rating, likely_to_use_again_rating, operator_feedback_notes, feedback_text, submitted_at')
      .eq('job_order_id', (job as any).id)
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .limit(1);
    const review = reviewRows?.[0] as any || null;

    return NextResponse.json({
      success: true,
      data: {
        job: {
          ...job,
          completion_pdf_url: completionPdf,
          liability_release_pdf_url: liabilityPdf,
          work_order_pdf_url: workOrderPdf,
          silica_plan_pdf_url: silicaPdf,
          // `job_orders` has no `actual_cost` column (verified against
          // production). The screen's "Actual Cost" is the labor breakdown from
          // /api/admin/job-pnl/[id]; null here keeps it falling through to that
          // rather than inventing a figure.
          actual_cost: null,
          // The office's own words for the job. `scope_of_work` is not a column
          // either — `description` is — so the page's fallback chain only ever
          // had one real link in it.
          scope_of_work: null,
          // Customer review (field names match the completed-job-tickets page).
          customer_overall_rating: review?.overall_rating ?? null,
          customer_cleanliness_rating: review?.cleanliness_rating ?? null,
          customer_communication_rating: review?.communication_rating ?? null,
          customer_likely_again_rating: review?.likely_to_use_again_rating ?? null,
          customer_feedback_comments: review?.feedback_text || review?.operator_feedback_notes || null,
          customer_review_at: review?.submitted_at ?? null,
          completed_at: (job as any).actual_end_date ?? (job as any).completion_submitted_at ?? null,
          salesperson_id: null,
        },
        work_items: workItems || [],
        // Operator job photos, SIGNED (job-photos bucket is private). The
        // Completed Job Ticket page previously got no photos key and fell back
        // to a nonexistent `job_photos` table — photos never showed.
        photos: (
          await signStoredUrls(Array.isArray(j.photo_urls) ? j.photo_urls : [])
        ).map((url: string, i: number) => ({
          id: `${(job as any).id}-photo-${i}`,
          url,
          caption: null,
          uploaded_at: (job as any).completion_submitted_at ?? '',
        })),
        daily_logs: dailyLogs || [],
        timecards: timecards || [],
        // Work performed beside the hours it took, day by day.
        work_days: workDays,
        labor_rows: laborRows,
        helper_logs: helperLogs || [],
        documents,
        labor_attribution: {
          attributed_card_count: attributedIds.size,
          unattributable_dates: Array.from(splitDates).sort(),
        },
        invoices,
        billing_milestones: billingMilestones || [],
        scope_completion: scopeCompletion,
      },
    });
  } catch (error: unknown) {
    console.error('Error in GET /completion-summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
