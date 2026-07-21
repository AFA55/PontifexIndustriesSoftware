/**
 * /jobs — marketing page for the Pontifex hiring module (the job board).
 *
 * (Jul 21, 2026) Opifex was folded into the platform as a feature — this page
 * no longer sells a standalone product or self-serve signup. It showcases the
 * hiring module and funnels to /request-demo like every other feature.
 * See docs/plans/OPIFEX_FEATURE_PLAN.md.
 *
 * Pontifex-OWNED surface (brand rules apply — this is NOT a tenant page):
 * deep-indigo dark hero (#120A24), the journey gradient (#7C3AED→#DB2777→#EF4444)
 * used ONCE on the headline + the primary CTA.
 */

import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  Sparkles,
  ListFilter,
  Users,
  Languages,
  ArrowRight,
  CheckCircle2,
  Smartphone,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Hiring & Job Board — Pontifex Industries',
  description:
    'Hire from Facebook, Instagram & TikTok — AI-written job ads, mobile applications, and one candidate pipeline, built into the Pontifex platform.',
};

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
  return (
    <main className="min-h-screen bg-[#120A24] text-white">
      {/* ── Nav ── */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Pontifex Industries" width={34} height={34} priority />
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            Pontifex Industries <span className="text-slate-400 font-medium">Job Board</span>
          </span>
        </Link>
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
            A Pontifex platform feature — reach the workers who aren&apos;t on job boards
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
            Every applicant lands in the same platform your team already runs on.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/request-demo"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#EF4444] px-6 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
            >
              Request a demo
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link
              href="/company-login"
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl px-6 text-base font-medium text-slate-200 ring-1 ring-white/15 transition hover:bg-white/5"
            >
              Sign in to your company
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
            Part of your platform. Pay only for ad spend.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
            The job board is a module of the Pontifex platform — turn it on for your company and
            set a daily budget per job. Your ads run until it&apos;s spent, and your bill is just
            the ad spend. Pause anytime. Most trades roles see qualified candidates for a few
            dollars each.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {['Included as a platform module', 'No per-seat pricing', 'Pause or close jobs anytime'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Link
              href="/request-demo"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-base font-semibold text-white transition hover:bg-violet-500"
            >
              See it on your jobs — request a demo
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={20} height={20} />
            <span>The Pontifex Industries job board</span>
          </div>
          <span>&copy; {new Date().getFullYear()} Pontifex Industries</span>
        </div>
      </footer>
    </main>
  );
}
