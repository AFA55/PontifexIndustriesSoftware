'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock, Plus, ChevronRight, AlertTriangle, Wrench, Truck, Package,
  Mic, Loader2, RotateCcw, ClipboardList, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/auth';
import NfcClockInModal from '@/components/NfcClockInModal';
import DailyEquipmentNeeds from './DailyEquipmentNeeds';
import CommandCenterLaunch from '@/components/command-center/CommandCenterLaunch';

/**
 * Shop Manager dashboard — Phase 1A skeleton.
 * Vibrant gradient KPI tiles + clock-in widget + action cards.
 * KPIs read 0 until Phase 1B/2 populate equipment + maintenance data.
 */

interface CurrentTimecard {
  id: string;
  clockInTime: string;
}

export default function ShopManagerDashboard({ user }: { user: User }) {
  // Clock state
  const [clocked, setClocked] = useState(false);
  const [card, setCard] = useState<CurrentTimecard | null>(null);
  const [hours, setHours] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // KPIs (read 0 until Phase 1B+ populate)
  const [maintenanceInbox, setMaintenanceInbox] = useState(0);
  const [pendingChecks, setPendingChecks] = useState(0);
  const [returnedQueue, setReturnedQueue] = useState(0);
  const [vehiclesOos, setVehiclesOos] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Run in parallel: current timecard + equipment counts (status filtered).
      const [curRes, oosRes, returnedRes, vehiclesOosRes] = await Promise.all([
        fetch('/api/timecard/current', { headers }),
        fetch('/api/admin/equipment?status=out_of_service&limit=200', { headers }),
        fetch('/api/admin/equipment?status=pending_putaway&limit=200', { headers }),
        fetch('/api/admin/equipment?kind=vehicle&status=out_of_service&limit=200', { headers }),
      ]);

      if (curRes.ok) {
        const j = await curRes.json();
        if (j.isClockedIn && j.data) {
          setClocked(true);
          setCard({ id: j.data.id, clockInTime: j.data.clockInTime });
        } else {
          setClocked(false);
          setCard(null);
        }
      }

      // Maintenance Inbox + Pending Pre-Use Checks populate in Phase 2/3.
      setMaintenanceInbox(0);
      setPendingChecks(0);

      if (returnedRes.ok) {
        const j = await returnedRes.json();
        setReturnedQueue(j.pagination?.total ?? (j.data?.length ?? 0));
      }
      if (vehiclesOosRes.ok) {
        const j = await vehiclesOosRes.json();
        setVehiclesOos(j.pagination?.total ?? (j.data?.length ?? 0));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!clocked || !card) return;
    const tick = () => {
      const ms = Date.now() - new Date(card.clockInTime).getTime();
      setHours(parseFloat((ms / 3_600_000).toFixed(2)));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clocked, card]);

  async function performClockIn(data: {
    method: string;
    nfc_tag_id?: string;
    nfc_tag_uid?: string;
    remote_photo_url?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) {
    setClockBusy(true);
    setClockMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const res = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          clock_in_method: data.method,
          nfc_tag_id: data.nfc_tag_id,
          nfc_tag_uid: data.nfc_tag_uid,
          remote_photo_url: data.remote_photo_url,
          work_location: 'shop',  // shop manager always at shop
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.details || 'Failed to clock in');
      setClocked(true);
      setCard({ id: j.data.id, clockInTime: j.data.clockInTime });
      setShowModal(false);
      setClockMsg({ type: 'success', text: 'Clocked in.' });
      fetchAll();
    } catch (err: any) {
      setClockMsg({ type: 'error', text: err.message || 'Failed to clock in' });
      throw err;
    } finally {
      setClockBusy(false);
    }
  }

  async function performClockOut(data: { latitude: number; longitude: number; accuracy?: number }) {
    setClockBusy(true);
    setClockMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const res = await fetch('/api/timecard/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ latitude: data.latitude, longitude: data.longitude, accuracy: data.accuracy }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.details || 'Failed to clock out');
      setClocked(false);
      setCard(null);
      setHours(0);
      setShowModal(false);
      setClockMsg({ type: 'success', text: 'Clocked out.' });
      fetchAll();
    } catch (err: any) {
      setClockMsg({ type: 'error', text: err.message || 'Failed to clock out' });
      throw err;
    } finally {
      setClockBusy(false);
    }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 bg-gray-50 dark:bg-slate-900 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-600 to-sky-600 bg-clip-text text-transparent">
            Welcome back, {user.name?.split(' ')[0] ?? 'Shop Manager'}!
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/admin/inventory-control?tab=checkout"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold shadow-lg shadow-rose-500/30 transition-all hover:-translate-y-0.5"
          >
            <Package className="w-4 h-4" />
            Check Out Equipment
          </Link>
          <Link
            href="/dashboard/admin/inventory-control?tab=checkin"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white text-sm font-semibold shadow-lg shadow-teal-500/30 transition-all hover:-translate-y-0.5"
          >
            <RotateCcw className="w-4 h-4" />
            Check In
          </Link>
        </div>
      </div>

      {/* Clock-in widget */}
      <div
        className={`relative overflow-hidden rounded-2xl shadow-lg p-5 sm:p-6 transition-all ${
          clocked
            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30 text-white'
            : 'bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-slate-900/30'
        }`}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <Clock className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold text-white/75">
                {clocked ? 'You are clocked in' : 'Start your shift'}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-tight">
                {clocked ? `${hours.toFixed(2)} hrs today` : 'Not clocked in'}
              </p>
              {clocked && card && (
                <p className="text-xs text-white/70 mt-0.5">
                  Since {new Date(card.clockInTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={clockBusy}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50 ${
              clocked
                ? 'bg-white text-rose-600 hover:bg-rose-50'
                : 'bg-white text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {clockBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : clocked ? 'Clock Out' : 'Clock In'}
          </button>
        </div>
        {clockMsg && (
          <p className="mt-3 text-sm text-white/95 font-medium">{clockMsg.text}</p>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiTile
          icon={<Wrench className="w-6 h-6 text-white" />}
          gradient="from-purple-500 to-violet-600"
          shadow="shadow-purple-500/30"
          value={maintenanceInbox}
          label="Maintenance Inbox"
          loading={loading}
          href="/dashboard/admin/maintenance"
        />
        <KpiTile
          icon={<ClipboardList className="w-6 h-6 text-white" />}
          gradient="from-amber-500 to-orange-600"
          shadow="shadow-amber-500/30"
          value={pendingChecks}
          label="Pending Pre-Use Checks"
          loading={loading}
          href="/dashboard/admin/shop-tasks"
        />
        <KpiTile
          icon={<RotateCcw className="w-6 h-6 text-white" />}
          gradient="from-teal-500 to-emerald-600"
          shadow="shadow-teal-500/30"
          value={returnedQueue}
          label="Returned — Needs Put-Away"
          loading={loading}
          href="/dashboard/admin/inventory-control?tab=checkin"
        />
        <KpiTile
          icon={<Truck className="w-6 h-6 text-white" />}
          gradient="from-rose-500 to-red-600"
          shadow="shadow-rose-500/30"
          value={vehiclesOos}
          label="Vehicles Out of Service"
          loading={loading}
          href="/dashboard/admin/fleet"
        />
      </div>

      {/* Action cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <ActionCard
          href="/dashboard/admin/inventory-control"
          icon={<RotateCcw className="w-5 h-5" />}
          title="Inventory Control"
          subtitle="Check out, check in, search history — one page"
          tone="rose"
        />
        <ActionCard
          href="/dashboard/admin/equipment"
          icon={<Package className="w-5 h-5" />}
          title="Equipment Inventory"
          subtitle="All saws, drills, generators, hand tools"
          tone="cyan"
        />
        <ActionCard
          href="/dashboard/admin/fleet"
          icon={<Truck className="w-5 h-5" />}
          title="Fleet"
          subtitle="Trucks, trailers, registration + insurance"
          tone="blue"
        />
        <ActionCard
          href="/dashboard/admin/maintenance"
          icon={<Wrench className="w-5 h-5" />}
          title="Maintenance Inbox"
          subtitle="Triage operator-submitted equipment issues"
          tone="purple"
        />
      </div>

      {/* Daily Equipment Needs — morning staging view */}
      <DailyEquipmentNeeds />

      {/* Phase 1A footer note */}
      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 rounded-2xl p-4 text-sm text-violet-700 dark:text-violet-300">
        <p className="font-semibold mb-1">Phase 1A — foundation only</p>
        <p className="text-violet-600 dark:text-violet-400 text-xs">
          Equipment inventory CRUD ships in Phase 1B. Maintenance + checkout flows in Phase 2-3. Until then these cards are placeholders so you can see the shape of the dashboard.
        </p>
      </div>

      {showModal && (
        <NfcClockInModal
          isShopHours={true}
          isClockedIn={clocked}
          onClockIn={performClockIn}
          onClockOut={async (d) => performClockOut({ latitude: d.latitude, longitude: d.longitude, accuracy: d.accuracy })}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Command Center launch (shop_manager is an office/management role) */}
      <CommandCenterLaunch />
    </div>
  );
}

function KpiTile({
  icon, gradient, shadow, value, unit, label, loading, href,
}: {
  icon: React.ReactNode; gradient: string; shadow: string;
  value: string | number; unit?: string; label: string;
  loading?: boolean; href?: string;
}) {
  const inner = (
    <div className={`relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-br ${gradient} ${shadow} shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 h-full text-white group`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
          {icon}
        </div>
        {href && <ChevronRight className="w-5 h-5 text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition" />}
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-white/20 rounded animate-pulse" />
      ) : (
        <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-none">
          {value}
          {unit && <span className="text-sm font-medium text-white/75 ml-1.5">{unit}</span>}
        </p>
      )}
      <p className="text-xs sm:text-sm text-white/80 mt-2 font-medium">{label}</p>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

const TONE_MAP: Record<string, string> = {
  cyan: 'bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 border-cyan-200 dark:border-cyan-800/50 text-cyan-700 dark:text-cyan-400',
  blue: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400',
  amber: 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400',
  rose: 'bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-400',
  teal: 'bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 border-teal-200 dark:border-teal-800/50 text-teal-700 dark:text-teal-400',
  purple: 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-400',
};

function ActionCard({
  href, icon, title, subtitle, tone,
}: { href: string; icon: React.ReactNode; title: string; subtitle: string; tone: keyof typeof TONE_MAP }) {
  return (
    <Link
      href={href}
      className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${TONE_MAP[tone]}`}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 ml-auto flex-shrink-0 opacity-50" />
    </Link>
  );
}
