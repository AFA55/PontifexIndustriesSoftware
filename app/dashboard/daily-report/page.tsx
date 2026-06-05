'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  ChevronLeft,
  Briefcase,
  Lightbulb,
  Target,
  StickyNote,
  Mic,
  MicOff,
  CheckCircle2,
  Loader2,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DraftState {
  what_i_did: string;
  what_i_learned: string;
  what_to_work_on: string;
  additional_notes: string;
}

type SectionKey = keyof DraftState;

interface Section {
  key: SectionKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  placeholder: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Sections config
// ---------------------------------------------------------------------------
const SECTIONS: Section[] = [
  {
    key: 'what_i_did',
    label: 'What I Did Today',
    description: 'Describe the work you performed on-site or in the shop.',
    icon: <Briefcase className="w-5 h-5" />,
    placeholder: 'e.g. Operated 14" Husqvarna blade on slab cut at Greenville job, approx 120 LF…',
    required: true,
  },
  {
    key: 'what_i_learned',
    label: 'What I Learned',
    description: 'Any new skills, techniques, or insights from today.',
    icon: <Lightbulb className="w-5 h-5" />,
    placeholder: 'e.g. Learned how to set blade depth for post-tension slabs without scoring…',
    required: false,
  },
  {
    key: 'what_to_work_on',
    label: 'Needs Work',
    description: 'What do you want to improve going forward?',
    icon: <Target className="w-5 h-5" />,
    placeholder: 'e.g. Need to get faster at blade changes — took 8 minutes today, target is 4…',
    required: false,
  },
  {
    key: 'additional_notes',
    label: 'Additional Notes',
    description: 'Anything else to flag — safety concerns, equipment issues, questions.',
    icon: <StickyNote className="w-5 h-5" />,
    placeholder: 'e.g. Blade guard on K970 is cracked — flagged for shop…',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ALLOWED_ROLES = new Set(['operator', 'apprentice', 'shop_help', 'shop_manager']);

// ---------------------------------------------------------------------------
// Main page (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------
export default function DailyReportPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0618] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      }
    >
      <DailyReportPage />
    </Suspense>
  );
}

function DailyReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);

  // ── Draft state ───────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<DraftState>({
    what_i_did: '',
    what_i_learned: '',
    what_to_work_on: '',
    additional_notes: '',
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // ── Voice ─────────────────────────────────────────────────────────────────
  const [voiceSupported, setVoiceSupported] = useState<boolean | null>(null);
  const [listeningKey, setListeningKey] = useState<SectionKey | null>(null);
  const recognitionRef = useRef<any>(null);

  // ── Auto-save refs ────────────────────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<DraftState>(draft);
  draftRef.current = draft;
  const alreadySubmitted = useRef(false);

  // ── Token helper ──────────────────────────────────────────────────────────
  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!ALLOWED_ROLES.has(user.role)) {
      router.push('/dashboard');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  // ── Detect voice support ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  // ── Load existing draft/report ────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const token = await getToken();
      const res = await fetch(`/api/operator/daily-report?date=${todayString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (json.data) {
        const r = json.data;
        setDraft({
          what_i_did: r.what_i_did ?? '',
          what_i_learned: r.what_i_learned ?? '',
          what_to_work_on: r.what_to_work_on ?? '',
          additional_notes: r.additional_notes ?? '',
        });
        if (r.submitted_at && !r.is_draft) {
          alreadySubmitted.current = true;
          setSubmitted(true);
        }
      }
    } catch (err: any) {
      // Loading an existing draft failed. The form is still usable, but flag it
      // so the operator can retry rather than risk overwriting a hidden draft.
      console.warn('[daily-report] load error:', err?.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    loadReport();
  }, [authChecked, loadReport]);

  // ── Auto-save (debounced, 10 s) ───────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (alreadySubmitted.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const current = draftRef.current;
      // Don't bother saving empty form
      const hasAny = Object.values(current).some(v => v.trim().length > 0);
      if (!hasAny) return;

      setAutoSaveStatus('saving');
      try {
        const token = await getToken();
        await fetch('/api/operator/daily-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...current, date: todayString(), submit: false }),
        });
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 10_000);
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // ── Field change ──────────────────────────────────────────────────────────
  function handleChange(key: SectionKey, value: string) {
    setDraft(prev => ({ ...prev, [key]: value }));
    scheduleSave();
  }

  // ── Voice ─────────────────────────────────────────────────────────────────
  function stopListening() {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setListeningKey(null);
  }

  function startListening(key: SectionKey) {
    if (listeningKey !== null) stopListening();

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = 'en-US';
    recog.maxAlternatives = 1;

    recog.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(' ');
      setDraft(prev => {
        const existing = prev[key];
        const joined = existing.trim()
          ? `${existing.trim()} ${transcript.trim()}`
          : transcript.trim();
        return { ...prev, [key]: joined };
      });
      scheduleSave();
    };

    recog.onerror = () => { stopListening(); };
    recog.onend = () => { stopListening(); };

    recognitionRef.current = recog;
    setListeningKey(key);
    try { recog.start(); } catch { stopListening(); }
  }

  function toggleVoice(key: SectionKey) {
    if (listeningKey === key) {
      stopListening();
    } else {
      startListening(key);
    }
  }

  // Cleanup on unmount
  useEffect(() => () => { stopListening(); }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (submitting || submitted) return;
    if (!draft.what_i_did.trim()) {
      setError('"What I Did Today" is required before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch('/api/operator/daily-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...draft, date: todayString(), submit: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to submit report.');
      }

      alreadySubmitted.current = true;
      setSubmitted(true);

      if (redirectParam === 'timecard') {
        router.push('/dashboard/timecard');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-[#0b0618] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  // ── Render: submitted success card ────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0b0618] text-white flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-[#0b0618]/90 backdrop-blur border-b border-white/10 px-4 py-3 pt-safe-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold tracking-tight">Daily Report</h1>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div>
              <p className="text-xl font-semibold text-white">Report submitted!</p>
              <p className="mt-1 text-white/60 text-sm">
                Great work today. You can now clock out.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/timecard')}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              Go to Timecard
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full py-2 px-4 rounded-xl text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: form ──────────────────────────────────────────────────────────
  const canSubmit = draft.what_i_did.trim().length > 0 && !submitting;

  return (
    <div className="min-h-screen bg-[#0b0618] text-white flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-[#0b0618]/90 backdrop-blur border-b border-white/10 px-4 py-3 pt-safe-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight leading-tight">Daily Report</h1>
          <p className="text-xs text-white/40 leading-tight">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Auto-save indicator */}
        {autoSaveStatus !== 'idle' && (
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            {autoSaveStatus === 'saving' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Clock className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Saved</span>
              </>
            )}
          </span>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-5 space-y-4 max-w-xl mx-auto w-full pb-36">
        {/* Load-error banner — couldn't fetch any existing draft for today */}
        {loadError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-300">Couldn&apos;t load today&apos;s report</p>
              <p className="text-xs text-red-300/70 mt-0.5">
                You can still fill this out fresh, but any saved draft from earlier may not show.
              </p>
              <button
                onClick={loadReport}
                className="mt-3 inline-flex items-center gap-2 min-h-[44px] py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            </div>
          </div>
        )}

        {/* Intro pill */}
        <p className="text-white/50 text-sm leading-relaxed">
          Fill this out before you clock out. It only takes a couple of minutes and helps the team track progress.
        </p>

        {/* Sections */}
        {SECTIONS.map(section => (
          <SectionCard
            key={section.key}
            section={section}
            value={draft[section.key]}
            onChange={val => handleChange(section.key, val)}
            onToggleVoice={() => toggleVoice(section.key)}
            isListening={listeningKey === section.key}
            voiceSupported={voiceSupported ?? false}
          />
        ))}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </main>

      {/* Fixed submit footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0b0618]/95 backdrop-blur border-t border-white/10 p-4 safe-area-pb">
        <div className="max-w-xl mx-auto">
          {!draft.what_i_did.trim() && (
            <p className="text-center text-xs text-white/40 mb-2">
              Fill in "What I Did Today" to enable submit
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              'w-full py-4 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2',
              canSubmit
                ? 'bg-gradient-to-r from-emerald-500 to-green-400 hover:from-emerald-400 hover:to-green-300 text-white shadow-lg shadow-emerald-900/40'
                : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit Report'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard component
// ---------------------------------------------------------------------------
interface SectionCardProps {
  section: Section;
  value: string;
  onChange: (val: string) => void;
  onToggleVoice: () => void;
  isListening: boolean;
  voiceSupported: boolean;
}

function SectionCard({
  section,
  value,
  onChange,
  onToggleVoice,
  isListening,
  voiceSupported,
}: SectionCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    autoGrow();
  }, [value]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-indigo-400 flex-shrink-0">{section.icon}</span>
          <div className="min-w-0">
            <p className="font-semibold text-white text-[15px] leading-tight">
              {section.label}
              {section.required && (
                <span className="text-rose-400 ml-0.5">*</span>
              )}
            </p>
            <p className="text-white/40 text-xs leading-snug mt-0.5">{section.description}</p>
          </div>
        </div>

        {/* Mic button */}
        <button
          onClick={onToggleVoice}
          disabled={!voiceSupported}
          title={
            !voiceSupported
              ? 'Voice not supported on this browser'
              : isListening
              ? 'Tap to stop listening'
              : 'Tap to dictate'
          }
          className={[
            'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
            !voiceSupported
              ? 'text-white/20 cursor-not-allowed'
              : isListening
              ? 'bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse'
              : 'text-white/40 hover:text-white/80 hover:bg-white/10',
          ].join(' ')}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
        >
          {!voiceSupported ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Listening indicator */}
      {isListening && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
          Listening… speak now
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          autoGrow();
        }}
        placeholder={section.placeholder}
        rows={3}
        className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-3 text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-sm leading-relaxed min-h-[88px] transition-colors"
        style={{ overflow: 'hidden' }}
        aria-label={section.label}
      />
    </div>
  );
}
