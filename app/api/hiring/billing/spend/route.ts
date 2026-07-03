export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/billing/spend — Phase 1 manual ad-spend entry.
 *
 * SUPER_ADMIN ONLY: this is a Pontifex-operator action (we run the ads from
 * the single agency ad account and key in what the platform charged us).
 * Customers never call this and never see raw_cost.
 *
 * Body: { tenant_id?, job_id?, spend_date?, channel, raw_cost, note? }
 *  - tenant resolution: explicit body.tenant_id → job's tenant → resolveBillingTenant
 *  - billed_amount = raw_cost × the tenant's ad_spend_markup (default 1.5)
 *  - increments hiring_jobs.total_spend by billed_amount when job_id given
 *  - increments hiring_billing.balance_owed by billed_amount
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { AD_CHANNELS, type AdChannel } from '@/lib/hiring/types';
import { billAmount, ensureBillingRow, roundMoney } from '@/lib/hiring/billing';

interface SpendBody {
  tenant_id?: unknown;
  job_id?: unknown;
  spend_date?: unknown;
  channel?: unknown;
  raw_cost?: unknown;
  note?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as SpendBody;

    // ── validate inputs ──────────────────────────────────────────────────
    const channel = typeof body.channel === 'string' ? body.channel : '';
    if (!(AD_CHANNELS as readonly string[]).includes(channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${AD_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    const rawCost = typeof body.raw_cost === 'number' ? body.raw_cost : NaN;
    if (!Number.isFinite(rawCost) || rawCost <= 0) {
      return NextResponse.json({ error: 'raw_cost must be a number greater than 0' }, { status: 400 });
    }
    if (rawCost > 10000) {
      return NextResponse.json(
        { error: 'raw_cost cannot exceed $10,000 per entry — split unusually large spend into multiple entries.' },
        { status: 400 }
      );
    }

    let spendDate: string | undefined;
    if (body.spend_date !== undefined && body.spend_date !== null && body.spend_date !== '') {
      if (typeof body.spend_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.spend_date)) {
        return NextResponse.json({ error: 'spend_date must be YYYY-MM-DD' }, { status: 400 });
      }
      // Reject well-formed but impossible dates (e.g. 2026-02-31 parses to Invalid Date).
      if (Number.isNaN(new Date(body.spend_date + 'T00:00:00').getTime())) {
        return NextResponse.json({ error: 'spend_date is not a valid calendar date' }, { status: 400 });
      }
      spendDate = body.spend_date;
    }

    const note =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    const jobId = typeof body.job_id === 'string' && body.job_id ? body.job_id : null;
    const bodyTenantId =
      typeof body.tenant_id === 'string' && body.tenant_id ? body.tenant_id : null;

    // ── resolve tenant (job wins consistency checks) ─────────────────────
    interface JobRow {
      id: string;
      tenant_id: string;
    }
    let tenantId = bodyTenantId;
    let job: JobRow | null = null;

    if (jobId) {
      const { data: jobRow, error: jobError } = await supabaseAdmin
        .from('hiring_jobs')
        .select('id, tenant_id')
        .eq('id', jobId)
        .is('deleted_at', null)
        .maybeSingle();
      if (jobError || !jobRow) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      const typedJob = jobRow as unknown as JobRow;
      if (tenantId && tenantId !== typedJob.tenant_id) {
        return NextResponse.json(
          { error: 'job_id does not belong to the given tenant_id' },
          { status: 400 }
        );
      }
      job = typedJob;
      tenantId = typedJob.tenant_id;
    }

    if (!tenantId) {
      const scope = await resolveBillingTenant(request, auth);
      if ('response' in scope) return scope.response;
      tenantId = scope.tenantId;
    }

    // ── compute billed amount at the tenant's markup ─────────────────────
    const billing = await ensureBillingRow(tenantId);
    const billedAmount = billAmount(rawCost, Number(billing.ad_spend_markup));

    const { data: entry, error: insertError } = await supabaseAdmin
      .from('hiring_spend_ledger')
      .insert({
        tenant_id: tenantId,
        job_id: job?.id ?? null,
        ...(spendDate ? { spend_date: spendDate } : {}),
        channel: channel as AdChannel,
        raw_cost: rawCost,
        billed_amount: billedAmount,
        note,
      })
      .select('*')
      .single();
    if (insertError || !entry) {
      return NextResponse.json(
        { error: insertError?.message || 'Could not record spend' },
        { status: 500 }
      );
    }

    // ── roll up atomically via service-role RPCs (guardian S1) — no
    // read-modify-write races between concurrent spend entries. ───────────
    const { data: rpcBalance, error: balanceError } = await supabaseAdmin.rpc(
      'increment_hiring_balance',
      { p_tenant_id: tenantId, p_amount: billedAmount }
    );
    if (balanceError) {
      return NextResponse.json(
        { error: `Spend recorded (${entry.id}) but balance update failed: ${balanceError.message}` },
        { status: 500 }
      );
    }
    const newBalance = roundMoney(Number(rpcBalance));

    if (job) {
      const { error: jobSpendError } = await supabaseAdmin.rpc('increment_hiring_job_spend', {
        p_job_id: job.id,
        p_amount: billedAmount,
      });
      if (jobSpendError) {
        return NextResponse.json(
          {
            error: `Spend and balance recorded (${entry.id}) but job total_spend update failed: ${jobSpendError.message}`,
          },
          { status: 500 }
        );
      }
    }

    // Fire-and-forget history event.
    Promise.resolve(
      supabaseAdmin.from('hiring_events').insert({
        tenant_id: tenantId,
        job_id: job?.id ?? null,
        event_type: 'spend_recorded',
        meta: { channel, billed_amount: billedAmount, spend_date: entry.spend_date },
        actor_id: auth.userId,
      })
    ).then(() => {}).catch(() => {});

    // Caller is super_admin (Pontifex operator) — raw_cost is fine to return here.
    return NextResponse.json({
      success: true,
      data: { entry, newBalance },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
