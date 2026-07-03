'use client';

export const dynamic = 'force-dynamic';

/**
 * New Job — the Hireline-style 2-step creation flow:
 * Step 1: Job Title + Job Description (+ optional Location + Language).
 * Step 2: the fun generating state while POST /jobs then /generate run,
 * then straight to the job workspace.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lightbulb } from 'lucide-react';
import { getCurrentUser, type User } from '@/lib/auth';
import type { HiringJob } from '@/lib/hiring/types';
import { HIRING_ADMIN_ROLES } from '@/lib/hiring/types';
import { Button, Card, PageHeader, Alert, Spinner } from '@/components/ui';
import { hiringFetch, HiringApiError } from '@/components/hiring/api';

const INPUT_CLS =
  'w-full rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 ' +
  'px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm text-gray-900 dark:text-white ' +
  'placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/40';

const GENERATING_MESSAGES = [
  'Building your ad…',
  'Extracting the top selling points…',
  'Writing your headline variants…',
  'Drafting screener questions…',
  'Polishing the pay banner…',
];

export default function NewHiringJobPage() {
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [phase, setPhase] = useState<'form' | 'generating'>('form');
  const [error, setError] = useState<string | null>(null);
  const [msgIndex, setMsgIndex] = useState(0);
  const router = useRouter();
  const submittingRef = useRef(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!HIRING_ADMIN_ROLES.includes(currentUser.role)) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  // Rotate the fun generating messages
  useEffect(() => {
    if (phase !== 'generating') return;
    const t = setInterval(() => {
      setMsgIndex((i) => (i + 1) % GENERATING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(t);
  }, [phase]);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setPhase('generating');
    try {
      const created = await hiringFetch<{ job: HiringJob }>('/api/hiring/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          ...(location.trim() ? { location: location.trim() } : {}),
          language,
        }),
      });
      // Generate the ad kit + suggested screeners. If generation hiccups,
      // still land on the workspace — Regenerate Ad retries it there.
      try {
        await hiringFetch(`/api/hiring/jobs/${created.job.id}/generate`, { method: 'POST' });
      } catch {
        /* non-fatal — workspace has a Regenerate button */
      }
      router.push(`/dashboard/hiring/jobs/${created.job.id}`);
    } catch (err) {
      submittingRef.current = false;
      setPhase('form');
      if (err instanceof HiringApiError && err.status === 403) {
        setError("Hiring isn't enabled for your company. Contact Pontifex to turn it on.");
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create the job');
      }
    }
  };

  if (!user) return null;

  if (phase === 'generating') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-transparent flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Sparkles className="h-8 w-8 animate-pulse" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{GENERATING_MESSAGES[msgIndex]}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-white/60">
            We&apos;re turning your description into a scroll-stopping ad, an application form,
            and screener questions. Takes about 15 seconds.
          </p>
          <div className="mt-6 flex justify-center"><Spinner size="lg" brand /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-transparent">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6">
        <PageHeader
          backHref="/dashboard/hiring"
          backLabel="Job Board"
          title="New Job"
          subtitle="Step 1 of 2 — tell us about the job"
        />

        {error && (
          <div className="mb-4">
            <Alert variant="danger" title="Couldn't create the job">{error}</Alert>
          </div>
        )}

        <Card>
          <div className="space-y-5">
            <div>
              <label htmlFor="job-title" className="block text-sm font-semibold text-gray-800 dark:text-white mb-1">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                id="job-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Concrete Cutting Operator"
                className={INPUT_CLS}
              />
            </div>

            <div>
              <label htmlFor="job-description" className="block text-sm font-semibold text-gray-800 dark:text-white mb-1">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="job-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={10}
                placeholder="Describe the role, the work, the schedule, the pay, and what makes your company a great place to work…"
                className={INPUT_CLS}
              />
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-brand/5 dark:bg-brand/10 px-3.5 py-3">
                <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-brand" />
                <p className="text-xs text-gray-600 dark:text-white/70">
                  We&apos;ll extract the top selling points from your job description and build the ad,
                  application form, and screener questions for you — based on what gets the right
                  candidates to apply. <span className="font-semibold">Be detailed!</span> e.g. an explicit
                  work schedule (Mon–Fri, 9–6) helps.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="job-location" className="block text-sm font-semibold text-gray-800 dark:text-white mb-1">
                  Location <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="job-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Bakersfield, CA"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label htmlFor="job-language" className="block text-sm font-semibold text-gray-800 dark:text-white mb-1">
                  Language
                </label>
                <select
                  id="job-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'es')}
                  className={INPUT_CLS}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
                  The ad and application come out in this language. You can translate later with one click.
                </p>
              </div>
            </div>

            <Button
              fullWidth
              size="lg"
              leftIcon={<Sparkles className="w-5 h-5" />}
              disabled={!canSubmit}
              onClick={submit}
            >
              Build my ad
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
