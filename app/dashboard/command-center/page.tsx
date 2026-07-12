'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Clock,
  Users,
  Receipt,
  Wrench,
  Bell,
  Briefcase,
  ClipboardCheck,
  ChevronLeft,
  Maximize2,
  Minimize2,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { formatTime } from '@/lib/dates';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';
import { useArtifexVoice } from '@/lib/use-artifex-voice';
import { useTheme } from '@/contexts/ThemeContext';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';
import NeuralBrain, { type NeuralBrainState } from '@/components/command-center/NeuralBrain';
import ArtifexAmbient from '@/components/command-center/ArtifexAmbient';
import ArtifexCanvas, { type CanvasActivity } from '@/components/command-center/ArtifexCanvas';
import ArtifexChat, { type ArtifexConversationSummary } from '@/components/command-center/ArtifexChat';

interface OverviewData {
  clockedIn: number;
  rosterCount: number;
  todaysJobs: number;
  pendingApprovals: number;
  unreadAlerts: number;
  asOf: string | null;
}

interface ManagementTab {
  label: string;
  href: string;
  icon: LucideIcon;
}

const TABS: ManagementTab[] = [
  { label: 'Schedule Board', href: '/dashboard/admin/schedule-board', icon: CalendarDays },
  { label: 'Timecards', href: '/dashboard/admin/timecards', icon: Clock },
  { label: 'Team Profiles', href: '/dashboard/admin/team-profiles', icon: Users },
  { label: 'Invoicing', href: '/dashboard/admin/billing', icon: Receipt },
  { label: 'Equipment', href: '/dashboard/admin/equipment', icon: Wrench },
];

export default function CommandCenterPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Live clock — updates every second.
  const [now, setNow] = useState<Date | null>(null);

  // Reactor size, responsive (SSR-safe: starts at a sane default, set on mount).
  const [reactorSize, setReactorSize] = useState(360);

  // Voice-first (Jul 9): the orb IS the interface. Voice lives here so the
  // orb can read the live ElevenLabs amplitude; the transcript panel is the
  // background surface, toggled on demand.
  const voice = useArtifexVoice();
  const { theme } = useTheme();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // The orb BREATHES with the voice (founder: "move and size up and down when
  // speaking") — a rAF loop scales the wrapper from the live amplitude ref.
  // Direct style writes, zero React re-renders per frame.
  const orbWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const amp = voice.amplitudeRef.current;
      smooth += (amp - smooth) * 0.3;
      if (orbWrapRef.current) {
        orbWrapRef.current.style.transform = `scale(${1 + smooth * 0.09})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [chatReactorState, setChatReactorState] = useState<NeuralBrainState>('idle');
  // Live co-pilot canvas — the latest tool call rendering as a document on
  // the right while the orb slides left (founder Jul 12).
  const [canvas, setCanvas] = useState<CanvasActivity | null>(null);

  // Conversation history — the "2nd brain" sidebar's list + selection state.
  const [conversations, setConversations] = useState<ArtifexConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Bumped ONLY on an explicit user switch (sidebar select / New chat) so the
  // component remounts with a clean useChat instance. Must NOT bump when
  // onConversationStarted silently backfills activeConversationId mid-stream
  // for a brand-new chat — that would unmount the response while it's still
  // streaming in.
  const [chatInstanceKey, setChatInstanceKey] = useState(0);

  const loadConversations = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/command-center/conversations', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setConversations(
          json.data.map((c: any) => ({ id: c.id, title: c.title ?? 'New chat', updatedAt: c.updated_at }))
        );
      }
    } catch {
      // fail-soft: sidebar just stays empty/stale, never crashes the panel
    }
  };

  // Focus mode — hides the management tabs + live rail for a clean recording
  // (just the reactor + chat), toggled by the founder before a demo/reveal.
  // Full-screen by default (founder Jul 12): the orb IS the room; management
  // shortcuts + LIVE rail are an opt-in layer via the expand toggle.
  const [focusMode, setFocusMode] = useState(true);

  // ── auth guard (client-side, same pattern as other dashboard pages) ────────
  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.push('/login');
      return;
    }
    if (![...COMMAND_CENTER_ROLES, 'operator', 'apprentice'].includes(current.role)) {
      router.push('/dashboard');
      return;
    }
    setUser(current);
    setAuthChecked(true);
  }, [router]);

  // ── live clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── responsive reactor size ─────────────────────────────────────────────────
  // Cap to the viewport so the canvas never crowds the edges on narrow phones,
  // and stay generous on larger screens.
  useEffect(() => {
    const apply = () => {
      const target = window.innerWidth < 480 ? 260 : 360;
      const fits = Math.max(180, window.innerWidth - 48); // 24px gutter each side
      setReactorSize(Math.min(target, fits));
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  // ── conversation history: load once the transcript is first opened ────────
  useEffect(() => {
    if (!authChecked || !user || !transcriptOpen) return;
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, user, transcriptOpen]);

  // ── overview data: fetch + poll every 30s, fail-soft ───────────────────────
  const overviewRef = useRef<OverviewData | null>(null);
  overviewRef.current = overview;

  useEffect(() => {
    if (!authChecked || !user) return;
    if (['operator', 'apprentice'].includes(user.role)) { setOverviewLoading(false); return; }

    let cancelled = false;

    const fetchOverview = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/command-center/overview', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return; // fail-soft: keep last value / show "—"
        const json = await res.json();
        if (!cancelled && json?.success && json.data) {
          setOverview(json.data as OverviewData);
        }
      } catch {
        // fail-soft: never crash the panel
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    };

    fetchOverview();
    const id = setInterval(fetchOverview, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authChecked, user]);

  if (!authChecked || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-[#070B14]">
        <NeuralBrain state="thinking" size={120} />
      </div>
    );
  }

  // Clock pieces (avoid SSR mismatch: now is null until mounted).
  const clockTime = now
    ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '—';
  const clockDate = now
    ? now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  const asOfLabel = overview?.asOf ? `as of ${formatTime(overview.asOf)}` : 'live';
  // Field roles get the orb + chat ONLY — management nav and the LIVE rail
  // (admin data) never render for them; the overview API stays admin-gated.
  const isFieldUser = ['operator', 'apprentice'].includes(user.role);

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* 2nd-brain ambience — connecting dots behind the whole room */}
      <ArtifexAmbient className="z-0" mode={theme === 'dark' ? 'dark' : 'light'} />
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            aria-label="Back to dashboard"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <NeuralBrain state="idle" size={28} />
            <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900 dark:text-white/90 sm:text-base">
              Artifex <span className="text-slate-400 dark:text-white/40 normal-case tracking-normal text-xs sm:text-sm">by Pontifex</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <DarkModeIconToggle />
          <button
            type="button"
            onClick={() => setFocusMode((v) => !v)}
            aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            title={focusMode ? 'Exit focus mode' : 'Focus mode (for demos)'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <Clock className="hidden h-4 w-4 text-sky-600 dark:text-sky-300/70 sm:block" />
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white sm:text-base">
              {clockTime}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-white/40">{clockDate}</div>
          </div>
        </div>
      </header>

      {/* ── Body: tabs · reactor · rail ───────────────────────────────────── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* CENTER — reactor first in DOM so it stacks on TOP on mobile */}
        <main className="order-1 flex flex-1 flex-col items-center justify-center px-4 py-8 lg:order-2 lg:py-6">
          <div className={`flex w-full items-center justify-center gap-6 transition-all duration-500 ${canvas ? 'lg:justify-between lg:px-8' : ''}`}>
          <div ref={orbWrapRef} className="relative flex shrink-0 items-center justify-center will-change-transform transition-transform duration-500">
            {/* Reactor bezel — an always-dark housing so the orb art reads
                perfectly on the light theme too (device-in-a-clean-room look). */}
            <div
              aria-hidden
              className="absolute rounded-full bg-[radial-gradient(circle_at_50%_42%,#0E1626_0%,#070B14_62%,rgba(7,11,20,0.0)_100%)] ring-1 ring-slate-300/70 shadow-[inset_0_2px_18px_rgba(0,0,0,0.55),0_18px_50px_-20px_rgba(2,6,17,0.45)] dark:ring-white/10 dark:shadow-none"
              style={{ width: reactorSize + 36, height: reactorSize + 36 }}
            />
            <NeuralBrain
              state={chatReactorState}
              size={canvas ? Math.round(reactorSize * 0.72) : reactorSize}
              getAmplitude={() => voice.amplitudeRef.current}
              className="drop-shadow-[0_0_44px_rgba(56,189,248,0.25)]"
            />
          </div>
          {canvas && (
            <div className="hidden lg:block">
              <ArtifexCanvas activity={canvas} onClose={() => setCanvas(null)} />
            </div>
          )}
          </div>
          {/* Mobile: canvas below the orb */}
          {canvas && (
            <div className="mt-4 w-full px-2 lg:hidden">
              <ArtifexCanvas activity={canvas} onClose={() => setCanvas(null)} />
            </div>
          )}

          <div className="mt-5 flex w-full flex-col items-center px-2">
            <ArtifexChat
              key={chatInstanceKey}
              voice={voice}
              variant={transcriptOpen ? 'panel' : 'hud'}
              onOpenTranscript={() => setTranscriptOpen(true)}
              onCloseTranscript={() => setTranscriptOpen(false)}
              onStateChange={setChatReactorState}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => {
                setActiveConversationId(id);
                setChatInstanceKey((k) => k + 1);
              }}
              onNewConversation={() => {
                setActiveConversationId(null);
                setChatInstanceKey((k) => k + 1);
              }}
              onConversationStarted={(id) => {
                setActiveConversationId(id);
                loadConversations();
              }}
              onToolActivity={setCanvas}
            />
            {transcriptOpen ? (
              <button
                type="button"
                onClick={() => setTranscriptOpen(false)}
                className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-sky-700 dark:text-slate-400/70 dark:hover:text-sky-200"
              >
                Back to voice
              </button>
            ) : (
              <p className="mt-4 text-center text-[10px] uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500/60">
                {asOfLabel}
              </p>
            )}
          </div>
        </main>

        {/* LEFT — management tabs (hidden in focus mode) */}
        {!focusMode && !isFieldUser && (
          <nav
            aria-label="Management"
            className="order-2 shrink-0 border-t border-slate-200 dark:border-white/10 px-4 py-5 lg:order-1 lg:w-64 lg:border-r lg:border-t-0 lg:px-4 lg:py-6"
          >
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
              Management
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {TABS.map(({ label, href, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-600 shadow-sm transition-all hover:border-sky-400/60 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75 dark:shadow-none dark:hover:bg-white/[0.07] dark:hover:text-white artifex-panel-in"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0EA5E9]/20 to-[#DC2626]/25 text-sky-200 transition-colors group-hover:from-[#0EA5E9]/40 group-hover:to-[#DC2626]/45">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate font-medium">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* RIGHT — live metric rail (hidden in focus mode) */}
        {!focusMode && !isFieldUser && (
          <aside
            aria-label="Live metrics"
            className="order-3 shrink-0 border-t border-slate-200 dark:border-white/10 px-4 py-5 lg:w-72 lg:border-l lg:border-t-0 lg:px-4 lg:py-6"
          >
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
              Live
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <MetricCard
                icon={Users}
                label="Clocked in"
                accent="from-[#0284C7] to-[#38BDF8]"
                loading={overviewLoading}
                value={
                  overview ? `${overview.clockedIn} / ${overview.rosterCount}` : null
                }
              />
              <MetricCard
                icon={Bell}
                label="Notifications"
                accent="from-[#DC2626] to-[#7F1D1D]"
                loading={overviewLoading}
                value={overview ? `${overview.unreadAlerts}` : null}
              />
              <MetricCard
                icon={Briefcase}
                label="Jobs today"
                accent="from-[#0EA5E9] to-[#DC2626]"
                loading={overviewLoading}
                value={overview ? `${overview.todaysJobs}` : null}
              />
              <MetricCard
                icon={ClipboardCheck}
                label="Pending approvals"
                accent="from-[#B91C1C] to-[#0284C7]"
                loading={overviewLoading}
                value={overview ? `${overview.pendingApprovals}` : null}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Metric card ───────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  accent: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none artifex-panel-in">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white/90`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-white/45">
          {label}
        </span>
      </div>
      <div className="mt-2.5">
        {loading && value === null ? (
          <div className="h-7 w-16 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
        ) : (
          <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {value ?? '—'}
          </span>
        )}
      </div>
    </div>
  );
}
