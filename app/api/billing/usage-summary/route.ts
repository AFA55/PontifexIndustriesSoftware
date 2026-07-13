export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/usage-summary?month=YYYY-MM — TENANT-FACING usage summary.
 *
 * What a client company's admin sees about their own metered usage: message
 * counts and BILLED amounts for the month. Deliberately excludes raw provider
 * costs, our margin, and platform AI/voice operating costs — those live only
 * on the super_admin platform usage API (/api/admin/platform/usage). Keep it
 * that way: this response is rendered inside the tenant's own UI.
 *
 * Access: requireAdmin; tenant resolved like the other billing routes
 * (tenant admin -> own tenant; super_admin -> ?tenantId or sole tenant).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  const monthParam = request.nextUrl.searchParams.get('month');
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(monthParam ?? '')
    ? (monthParam as string).split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from('message_usage')
      .select('channel, billed_amount, invoiced')
      .eq('tenant_id', tenantId)
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(50000);
    if (error) throw error;

    let smsCount = 0;
    let emailCount = 0;
    let billed = 0;
    let pendingBilled = 0; // accrued this month, not yet invoiced
    for (const row of data ?? []) {
      if (row.channel === 'sms') smsCount += 1;
      else emailCount += 1;
      const amt = Number(row.billed_amount ?? 0);
      billed += amt;
      if (!row.invoiced) pendingBilled += amt;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return NextResponse.json({
      success: true,
      data: {
        month: `${y}-${String(m).padStart(2, '0')}`,
        smsCount,
        emailCount,
        billedTotal: round(billed),
        pendingBilled: round(pendingBilled),
        minimumNote: 'Usage under $1.00 in a month is not charged.',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
