'use client';

export const dynamic = 'force-dynamic';

/**
 * Platform Hub — AI & Usage (Phase 2 of docs/plans/FINISH_LINE_PHASES.md).
 * Per-company operating cost for a month: Artifex AI, ElevenLabs voice,
 * Google Maps calls, SMS (raw vs billed = margin), managed ad spend.
 * Platform-owner (super_admin) eyes only — margins are NEVER tenant-visible.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CircuitBoard, Loader2, MessageSquareText, Mic2, Map as MapIcon, Megaphone, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

interface TenantUsage {
  tenantId: string; name: string; companyCode: string | null;
  aiCalls: number; aiTokens: number; aiCost: number;
  voiceChars: number; voiceCost: number;
  mapsCalls: number; mapsCost: number;
  smsCount: number; smsRawCost: number; smsBilled: number; smsMargin: number;
  adsLifetimeBilled: number; adsBalanceOwed: number;
  totalCost: number;
}

const usd = (n: number, dp = 2) => `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export default function PlatformUsagePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [tenants, setTenants] = useState<TenantUsage[]>([]);
  const [totals, setTotals] = useState<{ cost: number; smsBilled: number; smsMargin: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (u.role !== 'super_admin') { router.push('/dashboard'); return; }
    setReady(true);
  }, [router]);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/platform/usage?month=${m}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setTenants(json.data.tenants);
        setTotals(json.data.totals);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready) load(month); }, [ready, month, load]);

  if (!ready) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/platform"
            aria-label="Back to Platform Hub"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <CircuitBoard className="h-5 w-5 text-amber-400" /> AI &amp; Usage
            </h1>
            <p className="text-sm text-white/40">Per-company operating cost · margins are platform-only</p>
          </div>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white outline-none focus:border-amber-400/50 [color-scheme:dark]"
        />
      </div>

      {/* Totals strip */}
      {totals && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Our total cost ({month})</p>
            <p className="mt-1 font-mono text-2xl font-bold text-white">{usd(totals.cost)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">SMS billed to tenants</p>
            <p className="mt-1 font-mono text-2xl font-bold text-white">{usd(totals.smsBilled)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
              <TrendingUp className="h-3 w-3" /> SMS margin
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-300">{usd(totals.smsMargin)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-white/30" /></div>
      ) : tenants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center">
          <p className="font-semibold text-white/70">No usage recorded for {month}</p>
          <p className="mt-1 text-sm text-white/35">Usage appears here as companies use Artifex, voice, SMS, and Maps.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => (
            <div key={t.tenantId} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">
                  {t.name}
                  {t.companyCode && <span className="ml-2 text-xs font-semibold text-white/35">{t.companyCode}</span>}
                </p>
                <p className="font-mono text-lg font-bold text-amber-300">{usd(t.totalCost)} <span className="text-xs font-medium text-white/35">our cost</span></p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                <UsageCell icon={CircuitBoard} label="Artifex AI" value={usd(t.aiCost, 3)} sub={`${t.aiCalls} calls · ${(t.aiTokens / 1000).toFixed(1)}k tok`} />
                <UsageCell icon={Mic2} label="Voice" value={usd(t.voiceCost, 3)} sub={`${(t.voiceChars / 1000).toFixed(1)}k chars`} />
                <UsageCell icon={MapIcon} label="Maps" value={usd(t.mapsCost, 3)} sub={`${t.mapsCalls} calls`} />
                <UsageCell
                  icon={MessageSquareText}
                  label="SMS"
                  value={`${usd(t.smsRawCost, 3)} → ${usd(t.smsBilled, 2)}`}
                  sub={`${t.smsCount} msgs · margin ${usd(t.smsMargin, 2)}`}
                  accent={t.smsMargin > 0}
                />
                <UsageCell icon={Megaphone} label="Ads (lifetime)" value={usd(t.adsLifetimeBilled)} sub={t.adsBalanceOwed > 0 ? `${usd(t.adsBalanceOwed)} owed` : 'settled'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageCell({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/40">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className={`mt-1 truncate font-mono text-sm font-bold ${accent ? 'text-emerald-300' : 'text-white/90'}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-white/35">{sub}</p>
    </div>
  );
}
