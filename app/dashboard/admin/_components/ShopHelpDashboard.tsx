'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock, Wrench, ClipboardList, RotateCcw, Loader2, CheckCircle2,
  AlertTriangle, CalendarOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/auth';
import NfcClockInModal from '@/components/NfcClockInModal';
import CommandCenterLaunch from '@/components/command-center/CommandCenterLaunch';

/**
 * Shop Helper dashboard — Phase 1A skeleton.
 * Mirrors operator dashboard energy (vibrant gradient KPIs) but with shop-helper
 * tasks instead of jobs. Tasks list will populate in Phase 2/3.
 */

interface CurrentTimecard {
  id: string;
  clockInTime: string;
}

export default function ShopHelpDashboard({ user }: { user: User }) {
  const [clocked, setClocked] = useState(false);
  const [card, setCard] = useState<CurrentTimecard | null>(null);
  const [hours, setHours] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Phase 2/3 will populate these from real APIs
  const [tasksToday, setTasksToday] = useState(0);
  const [pendingPutaway, setPendingPutaway] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const curRes = await fetch('/api/timecard/current', { headers });
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

      setTasksToday(0);
      setPendingPutaway(0);
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
          work_location: 'shop',  // shop_help always at shop
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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent">
          Welcome back, {user.name?.split(' ')[0] ?? 'Shop Helper'}!
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{today}</p>
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
              clocked ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-white text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {clockBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : clocked ? 'Clock Out' : 'Clock In'}
          </button>
        </div>
        {clockMsg && <p className="mt-3 text-sm text-white/95 font-medium">{clockMsg.text}</p>}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <KpiTile
          icon={<ClipboardList className="w-6 h-6 text-white" />}
          gradient="from-amber-500 to-orange-600"
          shadow="shadow-amber-500/30"
          value={tasksToday}
          label="My Tasks Today"
          loading={loading}
        />
        <KpiTile
          icon={<RotateCcw className="w-6 h-6 text-white" />}
          gradient="from-teal-500 to-emerald-600"
          shadow="shadow-teal-500/30"
          value={pendingPutaway}
          label="Pending Put-Away"
          loading={loading}
        />
      </div>

      {/* Empty task list placeholder */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4 text-amber-500" />
          My Tasks Today
        </h2>
        <div className="text-center py-10">
          <CheckCircle2 className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-slate-400">No tasks assigned yet.</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            Pre-use checks + delegated tasks will appear here once Phase 2-3 ships.
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/dashboard/maintenance/new"
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-400 transition-colors"
          >
            <Wrench className="w-5 h-5" />
            <span className="text-xs font-semibold text-center">Submit Maintenance Request</span>
          </Link>
          <Link
            href="/dashboard/request-time-off"
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 transition-colors"
          >
            <CalendarOff className="w-5 h-5" />
            <span className="text-xs font-semibold text-center">Request Time Off</span>
          </Link>
        </div>
      </div>

      {/* Phase 1A note */}
      <div className="bg-brand/10 dark:bg-brand/20 border border-brand/30 dark:border-brand/30 rounded-2xl p-4 text-sm text-brand dark:text-brand">
        <p className="font-semibold mb-1">Phase 1A — foundation only</p>
        <p className="text-brand dark:text-brand text-xs">
          Pre-use check tasks + delegated work appear here once Phase 2-3 ships. For now this is the dashboard shape.
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

      {/* Command Center launch (shop_help is an office/management role) */}
      <CommandCenterLaunch />
    </div>
  );
}

function KpiTile({
  icon, gradient, shadow, value, unit, label, loading,
}: {
  icon: React.ReactNode; gradient: string; shadow: string;
  value: string | number; unit?: string; label: string; loading?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-br ${gradient} ${shadow} shadow-lg h-full text-white`}>
      <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 mb-3">
        {icon}
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
}
