export const dynamic = 'force-dynamic';

/**
 * Crew management for a job — additional crew beyond the LEAD (assigned_to).
 * Stored in job_crew with role 'operator' (full work-performed input; the lead
 * still completes the ticket) or 'helper' (light helper-work-log flow).
 * One day-complete per job (the lead) + full input from each co-operator +
 * short descriptions from helpers.
 *
 * GET    — list crew members (user_id, role, full_name)
 * POST   — add a crew member { user_id, role? } (role 'helper' default,
 *          'operator' allowed); tenant-checked
 * DELETE — remove a crew member (?userId=)
 *
 * Management only (requireScheduleBoardAccess); tenant-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { sendNotification } from '@/lib/send-reminder';
import { sendSMS } from '@/lib/sms';
import { tenantToday } from '@/lib/tenant-timezone';

type RouteContext = { params: Promise<{ id: string }> };

/** A ticket SMS only makes sense while the job is still going to be worked. */
const SMS_ELIGIBLE_STATUSES = ['scheduled', 'assigned', 'in_progress'];

async function loadJob(jobId: string, tenantId: string | null) {
  let q = supabaseAdmin
    .from('job_orders')
    .select(
      'id, tenant_id, status, assigned_to, helper_assigned_to, job_number, customer_name, location, job_type, arrival_time, scheduled_date, scheduled_end_date, end_date, dispatched_at',
    )
    .eq('id', jobId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q.maybeSingle();
  return data;
}

/** "14:30" → "2:30 PM" (matches the dispatch SMS format in lib/dispatch.ts). */
function formatTime(t: string | null | undefined) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId && auth.role !== 'super_admin') {
      return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });
    }

    // Confirm the job belongs to the caller's tenant before returning its crew —
    // supabaseAdmin bypasses RLS, so this app-guard is the tenant boundary.
    const job = await loadJob(jobId, tenantId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: rows } = await supabaseAdmin
      .from('job_crew')
      .select('user_id, role')
      .eq('job_order_id', jobId);

    const ids = (rows || []).map((r) => r.user_id);
    const nameMap = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', ids);
      for (const p of profs || []) nameMap.set(p.id, p.full_name);
    }

    const crew = (rows || []).map((r) => ({
      user_id: r.user_id,
      role: r.role,
      full_name: nameMap.get(r.user_id) || null,
    }));
    return NextResponse.json({ success: true, data: crew });
  } catch (error) {
    console.error('Error in GET /crew:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });

    const body = await request.json();
    const userId = body.user_id;
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }
    // Crew role: 'helper' (default, light work-log) or 'operator' (full
    // work-performed input). 'lead' is NOT a crew role — the lead lives on
    // job_orders.assigned_to and changes only via the /assign reassignment path.
    const role = body.role === undefined || body.role === null ? 'helper' : body.role;
    if (role !== 'helper' && role !== 'operator') {
      return NextResponse.json({ error: "role must be 'helper' or 'operator'" }, { status: 400 });
    }
    // The "Make lead" flow re-POSTs the OUTGOING lead here so they keep working
    // the job. That is a demotion, not a new assignment — texting them a fresh
    // "📋 Job Dispatched" for a job they were already leading is wrong, so that
    // path passes reason:'lead_change' to get the accurate wording and no SMS.
    const isLeadChange = body.reason === 'lead_change';

    const job = await loadJob(jobId, tenantId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // The lead (assigned_to) is not a crew helper.
    if (job.assigned_to === userId) {
      return NextResponse.json({ error: 'That operator is already the lead on this job.' }, { status: 400 });
    }

    // The added user must belong to the same tenant (no cross-tenant crewing).
    const { data: addUser } = await supabaseAdmin
      .from('profiles')
      .select('id, tenant_id, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!addUser || addUser.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'That user is not in your company.' }, { status: 400 });
    }

    // "Did this POST actually change anything?" must be answered ATOMICALLY —
    // a plain upsert reports success whether it inserted or updated, so a
    // retried request on a flaky field connection would fire a second billed
    // SMS. `ignoreDuplicates` makes PostgREST emit ON CONFLICT DO NOTHING and
    // return rows only for a genuine INSERT; the follow-up UPDATE carries
    // `.neq('role', role)` so it likewise matches nothing unless the role really
    // changed. No read-then-write window for two admins to race through.
    const { data: insertedRows, error } = await supabaseAdmin
      .from('job_crew')
      .upsert(
        { tenant_id: tenantId, job_order_id: jobId, user_id: userId, role, added_by: auth.userId },
        { onConflict: 'job_order_id,user_id', ignoreDuplicates: true },
      )
      .select('id');
    if (error) {
      console.error('Error adding crew member:', error);
      return NextResponse.json({ error: 'Failed to add crew member' }, { status: 500 });
    }

    const isNewCrewMember = (insertedRows?.length ?? 0) > 0;
    let roleChanged = false;
    if (!isNewCrewMember) {
      const { data: updatedRows, error: roleErr } = await supabaseAdmin
        .from('job_crew')
        .update({ role })
        .eq('job_order_id', jobId)
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .neq('role', role)
        .select('id');
      if (roleErr) {
        console.error('Error updating crew role:', roleErr);
        return NextResponse.json({ error: 'Failed to update crew role' }, { status: 500 });
      }
      roleChanged = (updatedRows?.length ?? 0) > 0;
    }

    if (!isNewCrewMember && !roleChanged) {
      return NextResponse.json({
        success: true,
        data: { user_id: userId, full_name: addUser.full_name, role, notified: false },
      });
    }

    // ── Notify the added crew member ─────────────────────────────────────────
    // THE LATE-ADD PROBLEM (founder: "is it actually still going to send the
    // operator ticket?"): dispatch is a ONE-TIME latch per job
    // (job_orders.dispatched_at, see lib/dispatch.ts) and it only ever texts
    // assigned_to + helper_assigned_to. So someone added to job_crew AFTER the
    // ticket was pushed used to receive nothing but a bell row. We now always
    // deliver a real notification here (in-app + push, per the user's prefs),
    // and when the job is ALREADY dispatched we also send the full ticket SMS
    // right now — their copy of the dispatch they missed.
    //
    // The SMS is gated three ways on top of that, because job_orders.dispatched_at
    // is a PERMANENT latch and completed jobs stay on the board: without these,
    // the ordinary payroll/attribution backfill onto a job that finished weeks ago
    // would text a real operator a dispatch for a job that is over.
    const alreadyDispatched = !!job.dispatched_at;
    // `end_date` is NOT reliably after `scheduled_date` in prod (one live row has
    // an end_date three weeks BEFORE its start), so take the max the same way
    // crewTimecardSpan does rather than trusting the first non-null.
    let lastDay: string | null = job.scheduled_date || null;
    for (const candidate of [job.end_date, job.scheduled_end_date]) {
      if (candidate && (!lastDay || candidate > lastDay)) lastDay = candidate;
    }
    // Tenant wall clock, not the server's UTC — Vercel rolls over at 8pm ET.
    const stillUpcoming = !lastDay || lastDay >= (await tenantToday(tenantId));
    const smsWorthSending =
      alreadyDispatched &&
      !isLeadChange &&
      SMS_ELIGIBLE_STATUSES.includes(String(job.status)) &&
      stillUpcoming;

    const roleLabel = role === 'operator' ? 'operator' : 'helper';
    const where = job.customer_name
      ? `${job.customer_name}${job.location ? ` at ${job.location}` : ''}`
      : 'a job';
    const title = isLeadChange
      ? 'Lead changed on your job'
      : smsWorthSending
        ? 'Job ticket — you were added 📋'
        : 'Added to a job 📋';
    const message = isLeadChange
      ? `You're no longer the lead on ${where}, but you're still on the crew as an operator. Open My Jobs to log the work you perform — the new lead completes the ticket.`
      : role === 'operator'
        ? `You were added to ${where} as an operator. Open My Jobs to log the work you perform — the lead completes the ticket.`
        : `You were added to ${where} as a helper. Open My Jobs to submit what you did.`;

    Promise.resolve(
      sendNotification({
        userId,
        tenantId,
        category: 'job_dispatched',
        title,
        message,
        inAppType: 'job_order',
        jobOrderId: jobId,
        actionUrl: `/dashboard/my-jobs/${jobId}`,
        metadata: { job_order_id: jobId, is_helper: role === 'helper', role },
      }),
    ).catch((e) => console.error('crew add notify failed:', e));

    if (smsWorthSending) {
      Promise.resolve(
        (async () => {
          const { data: prof } = await supabaseAdmin
            .from('profiles')
            .select('phone_number')
            .eq('id', userId)
            .maybeSingle();
          if (!prof?.phone_number) return;
          const formattedDate = job.scheduled_date
            ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })
            : '';
          const smsMessage = [
            `📋 Job Dispatched${formattedDate ? ` — ${formattedDate}` : ''}`,
            `Job #: ${job.job_number}`,
            `Customer: ${job.customer_name}`,
            job.location ? `Location: ${job.location}` : null,
            job.arrival_time ? `Arrival: ${formatTime(job.arrival_time)}` : null,
            job.job_type ? `Type: ${job.job_type}` : null,
            `(You are assigned as ${roleLabel === 'helper' ? 'Helper' : 'Operator'})`,
            'Open the Pontifex app → My Jobs to view your ticket.',
          ].filter(Boolean).join('\n');
          await sendSMS({ to: prof.phone_number, message: smsMessage, jobId });
        })(),
      ).catch((e) => console.error('crew add SMS failed:', e));
    }

    return NextResponse.json({
      success: true,
      data: { user_id: userId, full_name: addUser.full_name, role, notified: true },
    });
  } catch (error) {
    console.error('Error in POST /crew:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId query param is required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('job_crew')
      .delete()
      .eq('job_order_id', jobId)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);
    if (error) {
      console.error('Error removing crew member:', error);
      return NextResponse.json({ error: 'Failed to remove crew member' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { removed: userId } });
  } catch (error) {
    console.error('Error in DELETE /crew:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
