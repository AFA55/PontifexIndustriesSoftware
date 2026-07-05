'use client';

export const dynamic = 'force-dynamic';

/**
 * /jobs — the "Opifex" job-board product front door (a Pontifex Industries company).
 *
 * Pontifex-OWNED surface (brand rules apply — this is NOT a tenant page):
 * deep-indigo dark hero (#120A24), the journey gradient (#7C3AED→#DB2777→#EF4444)
 * used ONCE on the headline + the primary CTA. Pitch: hire from Facebook,
 * Instagram & TikTok instead of job boards — AI writes the ad, candidates apply
 * on their phones, you pay only for ad spend.
 *
 * Two CTAs:
 *   "Sign in"     → /company-login (company code OPIFEX)
 *   "Get started" → the signup form below → POST /api/hiring/public/signup
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles,
  ListFilter,
  Users,
  Languages,
  ArrowRight,
  CheckCircle2,
  Smartphone,
  Loader2,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI writes your ad',
    body: 'Give us a job title and a description. We generate the ad creative, headline variants, and screener questions — branded to your company.',
  },
  {
    icon: ListFilter,
    title: 'Auto-screening built in',
    body: 'Capability questions filter out applicants who can’t do the work before you ever pick up the phone. Auto-reject rules run instantly.',
  },
  {
    icon: Users,
    title: 'One pipeline',
    body: 'Every candidate lands in one place — review, shortlist, comment with your team, and export. No more digging through Messenger.',
  },
  {
    icon: Languages,
    title: 'Spanish translation built in',
    body: 'One click translates your ad and application into Spanish as a linked variant of the same job — one pipeline, twice the reach.',
  },
];

export default function JobBoardLandingPage() {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (companyName.trim().length < 2) {
      setError('Please enter your company name.');
      return;
    }
    if (!contactName.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid work email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/hiring/public/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || 'Something went wrong. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/40';

  return (
    <main className="min-h-screen bg-[#120A24] text-white">
      {/* ── Nav ── */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Pontifex Industries" width={34} height={34} priority />
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            Pontifex Industries <span className="text-slate-400 font-medium">Job Board</span>
          </span>
        </div>
        <Link
          href="/company-login"
          className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-medium text-slate-200 ring-1 ring-white/15 transition hover:bg-white/5"
        >
          Sign in
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10">
            <Smartphone className="h-3.5 w-3.5 text-violet-400" aria-hidden />
            Reach the workers who aren&apos;t on job boards
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Hire from{' '}
            <span className="bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#EF4444] bg-clip-text text-transparent">
              Facebook, Instagram &amp; TikTok
            </span>
            {' '}— not job boards.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            AI writes your job ad. Candidates apply on their phones in under two minutes.
            You pay only for ad spend — no subscription, no per-seat fees.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#signup"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#EF4444] px-6 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
            >
              Get started
              <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
            <Link
              href="/company-login"
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl px-6 text-base font-medium text-slate-200 ring-1 ring-white/15 transition hover:bg-white/5"
            >
              Sign in with company code <span className="ml-1.5 font-semibold text-white">OPIFEX</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
                <f.icon className="h-5 w-5 text-violet-400" aria-hidden />
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing blurb ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="rounded-2xl bg-white/[0.04] p-8 ring-1 ring-white/10 sm:p-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            No subscription. Pay only for ad spend.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
            Set a daily budget per job — your ads run until it&apos;s spent, and your bill is just
            the ad spend. Pause anytime. Most trades roles see qualified candidates for a few
            dollars each.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {['No monthly fee', 'No per-seat pricing', 'Pause or close jobs anytime'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Signup ── */}
      <section id="signup" className="mx-auto max-w-6xl scroll-mt-8 px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Get started
          </h2>
          <p className="mt-2 text-center text-base text-slate-400">
            Create your account — your first job ad is minutes away.
          </p>

          <div className="mt-8 rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10 sm:p-8">
            {done ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold">You&apos;re almost in</h3>
                <p className="mt-2 text-base text-slate-300">
                  Check your email to finish setting up your account.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="signup-company" className="block text-sm font-medium text-slate-200">
                    Company name
                  </label>
                  <input
                    id="signup-company"
                    type="text"
                    autoComplete="organization"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Mechanical"
                    className={`mt-2 ${inputClass}`}
                  />
                </div>
                <div>
                  <label htmlFor="signup-name" className="block text-sm font-medium text-slate-200">
                    Your name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="First and last name"
                    className={`mt-2 ${inputClass}`}
                  />
                </div>
                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-slate-200">
                    Work email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={`mt-2 ${inputClass}`}
                  />
                </div>
                <div>
                  <label htmlFor="signup-phone" className="block text-sm font-medium text-slate-200">
                    Phone <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="signup-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 555-1234"
                    className={`mt-2 ${inputClass}`}
                  />
                </div>

                {error && (
                  <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/20">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-base font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  {submitting ? 'Creating your account…' : 'Create my account'}
                </button>
                <p className="text-center text-xs text-slate-500">
                  Already have an account?{' '}
                  <Link href="/company-login" className="text-slate-300 underline underline-offset-2">
                    Sign in
                  </Link>{' '}
                  with company code <span className="font-semibold text-slate-300">OPIFEX</span>.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={20} height={20} />
            <span>Opifex — the Pontifex Industries job board</span>
          </div>
          <span>&copy; {new Date().getFullYear()} Pontifex Industries</span>
        </div>
      </footer>
    </main>
  );
}
