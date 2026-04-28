export const dynamic = 'force-dynamic';

/**
 * GET /api/sales/dashboard
 *
 * Sales-specific dashboard:
 *   - Quoted-revenue MTD/YTD (sum of job_orders.total_revenue, scoped to created_by=salesman)
 *   - Active / completed job counts
 *   - Commission ledger (pending + earned, MTD/YTD)
 *   - Per-job breakdown
 *
 * Quoted revenue is the salesman's "booked" number — what they sold, regardless
 * of whether the office has invoiced or collected yet. Commission is driven by
 * paid invoices (invoices.paid_at + invoices.amount_paid).
 *
 * Auth: requireAuth. super_admin may pass ?userId=<uuid> to view another salesman.
 * Other roles: scoped to self.
 *
 * Each section catches independently — partial data is better than total failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function monthStartDate(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

function monthEndDate(offset = 0): Date {
  const d = new Date();
  // last day of month at 23:59:59
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 23, 59, 59, 999);
}

function yearStartDate(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1);
}

function yearEndDate(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function trendPct(current: number, prior: number): number {
  if (prior === 0) return 0;
  return Math.round(((current - prior) / prior) * 100 * 10) / 10;
}

function num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

const TERMINAL_STATUSES = ['completed', 'cancelled', 'archived'];

// ─── section fetchers ───────────────────────────────────────────────────────

/**
 * Quoted revenue rollups: MTD, YTD, last-month.
 * Scope: job_orders.created_by = userId, tenant-scoped.
 */
async function getQuoted(tenantId: string | null, userId: string) {
  try {
    const buildSum = async (start: Date, end: Date) => {
      let q = supabaseAdmin
        .from('job_orders')
        .select('total_revenue')
        .eq('created_by', userId)
        .gte('scheduled_date', isoDate(start))
        .lte('scheduled_date', isoDate(end))
        .is('deleted_at', null);

      if (tenantId) q = q.eq('tenant_id', tenantId);

      const { data, error } = await q;
      if (error) {
        console.error('[sales/dashboard] quoted query error:', error.message);
        return 0;
      }
      return (data ?? []).reduce((acc, r: any) => acc + num(r.total_revenue), 0);
    };

    const [mtd, lastMonth, ytd] = await Promise.all([
      buildSum(monthStartDate(0), monthEndDate(0)),
      buildSum(monthStartDate(-1), monthEndDate(-1)),
      buildSum(yearStartDate(), yearEndDate()),
    ]);

    return {
      mtd,
      ytd,
      last_month: lastMonth,
      trend_pct: trendPct(mtd, lastMonth),
    };
  } catch (err: any) {
    console.error('[sales/dashboard] quoted error:', err?.message);
    return { mtd: 0, ytd: 0, last_month: 0, trend_pct: 0 };
  }
}

/**
 * Job counts: active, completed-MTD, total-MTD.
 */
async function getJobs(tenantId: string | null, userId: string) {
  try {
    const monthStart = isoDate(monthStartDate(0));
    const monthEnd = isoDate(monthEndDate(0));

    const baseActive = supabaseAdmin
      .from('job_orders')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .not('status', 'in', `(${TERMINAL_STATUSES.map(s => `"${s}"`).join(',')})`)
      .is('deleted_at', null);

    const baseCompletedMtd = supabaseAdmin
      .from('job_orders')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('status', 'completed')
      .gte('scheduled_date', monthStart)
      .lte('scheduled_date', monthEnd)
      .is('deleted_at', null);

    const baseTotalMtd = supabaseAdmin
      .from('job_orders')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .gte('scheduled_date', monthStart)
      .lte('scheduled_date', monthEnd)
      .is('deleted_at', null);

    const activeQ = tenantId ? baseActive.eq('tenant_id', tenantId) : baseActive;
    const completedQ = tenantId ? baseCompletedMtd.eq('tenant_id', tenantId) : baseCompletedMtd;
    const totalQ = tenantId ? baseTotalMtd.eq('tenant_id', tenantId) : baseTotalMtd;

    const [activeRes, completedRes, totalRes] = await Promise.all([activeQ, completedQ, totalQ]);

    return {
      active_count: activeRes.count ?? 0,
      completed_count_mtd: completedRes.count ?? 0,
      total_count_mtd: totalRes.count ?? 0,
    };
  } catch (err: any) {
    console.error('[sales/dashboard] jobs error:', err?.message);
    return { active_count: 0, completed_count_mtd: 0, total_count_mtd: 0 };
  }
}

/**
 * Commission rollups + per-job breakdown.
 *
 * Linkage: invoices have NO job_id column. We resolve via invoice_line_items.job_order_id.
 * Multiple jobs per invoice → distribute amount_paid proportionally by line-item amount.
 */
async function getCommissions(
  tenantId: string | null,
  userId: string,
  defaultRate: number
) {
  try {
    // 1. Pull all jobs created by this salesman (we need them for the breakdown
    //    AND to know which invoices/line items concern this user).
    let jobsQ = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, status, scheduled_date, total_revenue, commission_rate')
      .eq('created_by', userId)
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: false, nullsFirst: false })
      .limit(500); // hard cap; we trim breakdown to 50 below

    if (tenantId) jobsQ = jobsQ.eq('tenant_id', tenantId);

    const { data: jobs, error: jobsErr } = await jobsQ;
    if (jobsErr) {
      console.error('[sales/dashboard] commissions: jobs error:', jobsErr.message);
      return emptyCommissions();
    }
    if (!jobs || jobs.length === 0) return emptyCommissions();

    const jobIds = jobs.map((j: any) => j.id);
    const jobMap = new Map<string, any>(jobs.map((j: any) => [j.id, j]));

    // 2. Pull all invoice_line_items linked to those jobs.
    let lineItemsQ = supabaseAdmin
      .from('invoice_line_items')
      .select('id, invoice_id, job_order_id, amount')
      .in('job_order_id', jobIds);

    if (tenantId) lineItemsQ = lineItemsQ.eq('tenant_id', tenantId);

    const { data: lineItems, error: liErr } = await lineItemsQ;
    if (liErr) {
      console.error('[sales/dashboard] commissions: line items error:', liErr.message);
      // Fall through with empty line items — per-job invoiced/paid will be 0 but rates still computed
    }

    const safeLineItems = lineItems ?? [];
    const invoiceIds = [...new Set(safeLineItems.map((li: any) => li.invoice_id).filter(Boolean))];

    // 3. Pull the linked invoices (need amount_paid, balance_due, paid_at, status, total_amount).
    let invoicesData: any[] = [];
    if (invoiceIds.length > 0) {
      let invoicesQ = supabaseAdmin
        .from('invoices')
        .select('id, total_amount, amount_paid, balance_due, status, paid_at')
        .in('id', invoiceIds);

      if (tenantId) invoicesQ = invoicesQ.eq('tenant_id', tenantId);

      const { data: invs, error: invErr } = await invoicesQ;
      if (invErr) {
        console.error('[sales/dashboard] commissions: invoices error:', invErr.message);
      } else if (invs) {
        invoicesData = invs;
      }
    }

    const invoiceMap = new Map<string, any>(invoicesData.map((i: any) => [i.id, i]));

    // 4. For each invoice, compute the proportion of its total amount that maps
    //    to each linked job (based on summed line-item amounts). Distribute
    //    amount_paid and balance_due proportionally.
    //
    //    For each invoice:
    //      - groupedByJob: { job_id: sum_of_li_amount_for_this_job_on_this_invoice }
    //      - invoiceLineSum: sum of all line-item amounts on this invoice
    //
    //    Per-job allocation:
    //      job_invoiced  = (groupedByJob[job] / invoiceLineSum) * invoice.total_amount
    //      job_paid      = (groupedByJob[job] / invoiceLineSum) * invoice.amount_paid
    //      job_unpaid    = (groupedByJob[job] / invoiceLineSum) * invoice.balance_due
    //
    //    If invoiceLineSum === 0 or invoice not found, skip.

    type JobAgg = {
      total_invoiced: number;
      total_paid: number;
      total_unpaid: number; // proportional balance_due across all linked invoices
    };
    const jobAgg = new Map<string, JobAgg>();

    // Group line items by invoice for proportional split.
    const linesByInvoice = new Map<string, { job_order_id: string; amount: number }[]>();
    for (const li of safeLineItems) {
      if (!li.invoice_id || !li.job_order_id) continue;
      const arr = linesByInvoice.get(li.invoice_id) ?? [];
      arr.push({ job_order_id: li.job_order_id, amount: num(li.amount) });
      linesByInvoice.set(li.invoice_id, arr);
    }

    // Track per-invoice paid/unpaid contribution to the "earned this period" rollups.
    // We'll compute earned MTD/YTD/last-month at the *invoice* level (not per job)
    // based on paid_at, then attribute proportionally.
    let earnedMtd = 0;
    let earnedYtd = 0;
    let earnedLastMonth = 0;
    let pendingTotal = 0;

    const monthStart = monthStartDate(0).getTime();
    const monthEnd = monthEndDate(0).getTime();
    const lastMonthStart = monthStartDate(-1).getTime();
    const lastMonthEnd = monthEndDate(-1).getTime();
    const yearStart = yearStartDate().getTime();
    const yearEnd = yearEndDate().getTime();

    for (const [invoiceId, lines] of linesByInvoice) {
      const invoice = invoiceMap.get(invoiceId);
      if (!invoice) continue;

      const totalAmt = num(invoice.total_amount);
      const paidAmt = num(invoice.amount_paid);
      const balanceAmt = num(invoice.balance_due);
      const lineSum = lines.reduce((acc, li) => acc + li.amount, 0);
      if (lineSum <= 0) continue;

      const paidAtMs = invoice.paid_at ? new Date(invoice.paid_at).getTime() : null;
      const isPaidThisMonth = paidAtMs !== null && paidAtMs >= monthStart && paidAtMs <= monthEnd;
      const isPaidThisYear = paidAtMs !== null && paidAtMs >= yearStart && paidAtMs <= yearEnd;
      const isPaidLastMonth = paidAtMs !== null && paidAtMs >= lastMonthStart && paidAtMs <= lastMonthEnd;

      // Group lines by job for this invoice
      const jobLines = new Map<string, number>();
      for (const li of lines) {
        jobLines.set(li.job_order_id, (jobLines.get(li.job_order_id) ?? 0) + li.amount);
      }

      for (const [jobId, jobLineSum] of jobLines) {
        const job = jobMap.get(jobId);
        if (!job) continue;
        const proportion = jobLineSum / lineSum;
        const jobInvoiced = totalAmt * proportion;
        const jobPaid = paidAmt * proportion;
        const jobUnpaid = balanceAmt * proportion;

        const cur = jobAgg.get(jobId) ?? { total_invoiced: 0, total_paid: 0, total_unpaid: 0 };
        cur.total_invoiced += jobInvoiced;
        cur.total_paid += jobPaid;
        cur.total_unpaid += jobUnpaid;
        jobAgg.set(jobId, cur);

        // Roll up commissions
        const rate = num(job.commission_rate ?? defaultRate) / 100;

        if (rate > 0) {
          // Pending = unpaid portion × rate (always counted regardless of paid_at)
          pendingTotal += jobUnpaid * rate;

          if (isPaidThisMonth) earnedMtd += jobPaid * rate;
          if (isPaidThisYear) earnedYtd += jobPaid * rate;
          if (isPaidLastMonth) earnedLastMonth += jobPaid * rate;
        }
      }
    }

    // 5. Build per-job breakdown (max 50, ordered by scheduled_date desc — already ordered).
    const breakdown = jobs.slice(0, 50).map((job: any) => {
      const agg = jobAgg.get(job.id) ?? { total_invoiced: 0, total_paid: 0, total_unpaid: 0 };
      const rateRaw = job.commission_rate ?? defaultRate;
      const rate = num(rateRaw);
      const rateFrac = rate / 100;
      return {
        job_id: job.id,
        job_number: job.job_number,
        job_status: job.status,
        customer_name: job.customer_name,
        scheduled_date: job.scheduled_date,
        total_quoted: num(job.total_revenue),
        total_invoiced: round2(agg.total_invoiced),
        total_paid: round2(agg.total_paid),
        commission_rate: rate,
        commission_pending: round2(agg.total_unpaid * rateFrac),
        commission_earned: round2(agg.total_paid * rateFrac),
      };
    });

    return {
      pending: round2(pendingTotal),
      earned_mtd: round2(earnedMtd),
      earned_ytd: round2(earnedYtd),
      earned_last_month: round2(earnedLastMonth),
      trend_pct: trendPct(earnedMtd, earnedLastMonth),
      breakdown,
    };
  } catch (err: any) {
    console.error('[sales/dashboard] commissions error:', err?.message);
    return emptyCommissions();
  }
}

function emptyCommissions() {
  return {
    pending: 0,
    earned_mtd: 0,
    earned_ytd: 0,
    earned_last_month: 0,
    trend_pct: 0,
    breakdown: [] as any[],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── route handler ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { tenantId, userId: authUserId, role } = auth;

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    // Resolve target user — only super_admin may view someone else.
    let targetUserId = authUserId;
    if (requestedUserId && requestedUserId !== authUserId) {
      if (role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Forbidden. Only super_admin may view another user\'s dashboard.' },
          { status: 403 }
        );
      }
      // Validate the target exists (super_admin has no fixed tenant).
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', requestedUserId)
        .maybeSingle();
      if (!targetProfile) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }
      targetUserId = requestedUserId;
    }

    // Load target profile (full_name, role, commission_rate_default, tenant_id).
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, commission_rate_default, tenant_id')
      .eq('id', targetUserId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    // Tenant scope: if caller is not super_admin, force their tenant. If super_admin
    // is viewing someone, scope to that target's tenant.
    let scopedTenantId: string | null = null;
    if (role === 'super_admin') {
      scopedTenantId = profile.tenant_id ?? null;
    } else {
      scopedTenantId = tenantId;
      // Defense in depth: target's tenant must match caller's tenant.
      if (profile.tenant_id && profile.tenant_id !== tenantId) {
        return NextResponse.json({ error: 'User not in your tenant.' }, { status: 403 });
      }
    }

    const defaultRate = num(profile.commission_rate_default);

    const [quoted, jobs, commissions] = await Promise.all([
      getQuoted(scopedTenantId, targetUserId),
      getJobs(scopedTenantId, targetUserId),
      getCommissions(scopedTenantId, targetUserId, defaultRate),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          commission_rate_default: defaultRate,
        },
        quoted,
        jobs,
        commissions,
      },
    });
  } catch (err: any) {
    console.error('[sales/dashboard] unexpected error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
