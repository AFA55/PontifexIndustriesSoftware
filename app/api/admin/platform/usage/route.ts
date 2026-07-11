export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/platform/usage?month=YYYY-MM — Platform Hub "AI & Usage".
 * Per-tenant operating-cost rollup for the month: AI (Artifex tokens), voice
 * (ElevenLabs chars), Maps calls — all from ai_usage — plus SMS from
 * message_usage (raw cost vs billed = OUR MARGIN, platform-owner eyes only)
 * and managed ad spend from hiring_billing. super_admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const monthParam = request.nextUrl.searchParams.get('month'); // YYYY-MM
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(monthParam ?? '')
    ? (monthParam as string).split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();

  const [tenantsRes, aiRes, msgRes, adsRes] = await Promise.all([
    supabaseAdmin.from('tenants').select('id, name, company_code'),
    supabaseAdmin
      .from('ai_usage')
      .select('tenant_id, model, input_tokens, output_tokens, cost_usd')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(50000),
    supabaseAdmin
      .from('message_usage')
      .select('tenant_id, channel, segments, raw_cost, billed_amount')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(50000),
    supabaseAdmin.from('hiring_billing').select('tenant_id, lifetime_billed, balance_owed'),
  ]);

  if (tenantsRes.error) return NextResponse.json({ error: 'Failed to load tenants' }, { status: 500 });

  type Row = {
    tenantId: string; name: string; companyCode: string | null;
    aiCalls: number; aiTokens: number; aiCost: number;
    voiceChars: number; voiceCost: number;
    mapsCalls: number; mapsCost: number;
    smsCount: number; smsRawCost: number; smsBilled: number;
    adsLifetimeBilled: number; adsBalanceOwed: number;
  };
  const byTenant = new Map<string, Row>();
  const rowFor = (id: string): Row => {
    if (!byTenant.has(id)) {
      const t = (tenantsRes.data ?? []).find((x: any) => x.id === id);
      byTenant.set(id, {
        tenantId: id, name: t?.name ?? 'Unknown', companyCode: t?.company_code ?? null,
        aiCalls: 0, aiTokens: 0, aiCost: 0,
        voiceChars: 0, voiceCost: 0,
        mapsCalls: 0, mapsCost: 0,
        smsCount: 0, smsRawCost: 0, smsBilled: 0,
        adsLifetimeBilled: 0, adsBalanceOwed: 0,
      });
    }
    return byTenant.get(id)!;
  };

  for (const u of aiRes.data ?? []) {
    const r = rowFor(u.tenant_id);
    const cost = Number(u.cost_usd ?? 0);
    if (u.model?.startsWith('elevenlabs')) {
      r.voiceChars += Number(u.output_tokens ?? 0);
      r.voiceCost += cost;
    } else if (u.model?.startsWith('google/')) {
      r.mapsCalls += 1;
      r.mapsCost += cost;
    } else {
      r.aiCalls += 1;
      r.aiTokens += Number(u.input_tokens ?? 0) + Number(u.output_tokens ?? 0);
      r.aiCost += cost;
    }
  }
  for (const u of msgRes.data ?? []) {
    const r = rowFor(u.tenant_id);
    r.smsCount += 1;
    r.smsRawCost += Number(u.raw_cost ?? 0);
    r.smsBilled += Number(u.billed_amount ?? 0);
  }
  for (const b of adsRes.data ?? []) {
    const r = rowFor(b.tenant_id);
    r.adsLifetimeBilled += Number(b.lifetime_billed ?? 0);
    r.adsBalanceOwed += Number(b.balance_owed ?? 0);
  }

  const round = (n: number) => Math.round(n * 10000) / 10000;
  const tenants = [...byTenant.values()]
    .map((r) => ({
      ...r,
      aiCost: round(r.aiCost), voiceCost: round(r.voiceCost), mapsCost: round(r.mapsCost),
      smsRawCost: round(r.smsRawCost), smsBilled: round(r.smsBilled),
      totalCost: round(r.aiCost + r.voiceCost + r.mapsCost + r.smsRawCost),
      smsMargin: round(r.smsBilled - r.smsRawCost),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return NextResponse.json({
    success: true,
    data: {
      month: `${y}-${String(m).padStart(2, '0')}`,
      tenants,
      totals: {
        cost: round(tenants.reduce((s, t) => s + t.totalCost, 0)),
        smsBilled: round(tenants.reduce((s, t) => s + t.smsBilled, 0)),
        smsMargin: round(tenants.reduce((s, t) => s + t.smsMargin, 0)),
      },
    },
  });
}
