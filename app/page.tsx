import type { Metadata } from 'next';
import Image from 'next/image';
import {
  ArrowRight,
  Calendar,
  MapPin,
  Smartphone,
  Wrench,
  FileText,
  Mic,
  LayoutDashboard,
  Boxes,
  Bot,
  Server,
  XCircle,
  CheckCircle2,
  Hammer,
  Truck,
  Users,
  Compass,
  PenTool,
  Plug,
  LifeBuoy,
} from 'lucide-react';
import MarketingNav from '@/components/marketing/MarketingNav';
import HomeJsonLd from '@/components/marketing/HomeJsonLd';

// ─── Per-page metadata (homepage canonical + OG) ───────────────────────────────
export const metadata: Metadata = {
  title: 'Custom Software & AI Automations Built Around How You Work',
  description:
    'You already own the tools and skills that get the job done — now own the digital tools too. Pontifex Industries builds adaptable custom software and AI automations around how construction, trades, and field-service companies actually work. Request a demo.',
  alternates: { canonical: 'https://www.pontifexindustries.com' },
  openGraph: {
    type: 'website',
    url: 'https://www.pontifexindustries.com',
    title: 'Custom Software & AI Automations Built Around How You Work',
    description:
      'Own the digital tools that run your business — adaptable custom software built around your workflow, not the other way around. Proven with Patriot Concrete Cutting.',
    siteName: 'Pontifex Industries',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Custom Software & AI Automations Built Around How You Work',
    description:
      'Adaptable custom software and AI automations built around how your company already works. Request a demo.',
  },
};

// ─── FAQ content (shared with JSON-LD) ─────────────────────────────────────────
const FAQS = [
  {
    q: 'What does Pontifex Industries actually build?',
    a: 'Adaptable software built around how your company already works — operations platforms, field and crew apps, scheduling and dispatch, GPS timecards, equipment tracking, invoicing, and AI automations. The construction and field-service trades are our home base, but the approach fits any business underserved by rigid, generic software.',
  },
  {
    q: 'How is this different from off-the-shelf software?',
    a: 'Off-the-shelf tools force your team to change for the software. We do the opposite: we design and build tools that fit your operation, integrate with your team, and replace the spreadsheets, paper, and disconnected apps slowing you down. You own and control the digital tools that run your business.',
  },
  {
    q: 'Do you build AI automations?',
    a: 'Yes. We already ship voice-driven equipment checkout, voice-to-text job logs, and skill-based smart scheduling for a real company. Agentic automations handle the repetitive work — parsing voice into data, chasing timecards, generating documents — so your team can focus on the job.',
  },
  {
    q: 'I am not in construction. Can you still help?',
    a: 'Yes. Construction and field service is where we started, but the core idea is the same for any industry left behind by outdated, one-size-fits-all software: if the tools in your industry do not fit how you work, we can build a custom solution that does.',
  },
  {
    q: 'How do I get started?',
    a: 'Request a demo. We will walk through how you work today, show you what we have built for companies like Patriot Concrete Cutting, and map out what an adaptable, tailored solution would look like for your business.',
  },
];

// ─── Section heading helper ────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest bg-violet-500/10 border border-violet-500/30 text-violet-300">
      {children}
    </span>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      <HomeJsonLd faqs={FAQS} />
      <MarketingNav />

      <main>
        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section className="relative flex flex-col items-center justify-center px-6 pt-32 pb-24 sm:pt-40 sm:pb-28 overflow-hidden">
          {/* Brand gradient wash (purple → fuchsia → rose) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-[0.18]"
            style={{
              background:
                'radial-gradient(60% 50% at 70% 0%, #7C3AED, transparent), radial-gradient(45% 40% at 15% 30%, #DB2777, transparent), radial-gradient(40% 40% at 80% 80%, #EF4444, transparent)',
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(124,58,237,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.05) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black, transparent)',
            }}
          />

          <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
            <Eyebrow>
              <Hammer className="w-3.5 h-3.5" />
              Custom Software &amp; AI Automations
            </Eyebrow>

            {/* The single H1 */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05]">
              You own the tools that do the work.{' '}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
                Now own the digital ones too.
              </span>
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mx-auto">
              You already own the trucks, the saws, and the skills that get the job done. Stop renting
              rigid, generic software you can&apos;t control. Pontifex builds{' '}
              <span className="text-white font-medium">
                adaptable digital tools around how you already work
              </span>{' '}
              — so the software fits your business, not the other way around.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/request-demo"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 hover:opacity-90 text-white font-bold text-lg transition-all shadow-lg shadow-violet-900/40"
              >
                Request a Demo
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-lg transition-all"
              >
                Contact Us
              </a>
            </div>

            <p className="text-zinc-500 text-sm">
              Built in Upstate South Carolina — we work hands-on with the teams we build for.
            </p>

            <ul className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {[
                'Built around your workflow',
                'You own and control your data',
                'AI automations included',
              ].map((s) => (
                <li
                  key={s}
                  className="px-4 py-2 rounded-xl bg-zinc-800/60 border border-white/[0.08] text-zinc-400 text-sm"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 1. THE PROBLEM ────────────────────────────────────────────────── */}
        <section id="problem" className="relative py-24 px-6 border-t border-white/[0.05]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14 space-y-4">
              <Eyebrow>The Problem</Eyebrow>
              <h2 className="text-3xl sm:text-5xl font-black leading-tight">
                Your business isn&apos;t generic.{' '}
                <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
                  Your software shouldn&apos;t be either.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                Construction and trades companies get stuck with outdated, rigid, one-size-fits-all
                software. There are few real options built for how you actually operate — and the ones
                that exist put you at the mercy of the vendor.
              </p>
            </div>

            <ul className="grid sm:grid-cols-2 gap-5">
              {[
                {
                  title: 'Rigid, one-size-fits-all tools',
                  desc: 'You bend your workflow to fit the software instead of the software fitting your crews, your jobs, and your process.',
                },
                {
                  title: 'You don’t own your data',
                  desc: 'Your jobs, your customers, your history — locked inside someone else’s platform, on their terms, behind their export limits.',
                },
                {
                  title: 'At the mercy of the vendor',
                  desc: 'Prices rise, features change, support disappears. You adapt to their roadmap because you have no say in it.',
                },
                {
                  title: 'Held together by spreadsheets',
                  desc: 'Paper timecards, group texts, five disconnected apps, and a whiteboard. No single source of truth.',
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="flex items-start gap-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] p-6"
                >
                  <span className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                    <XCircle className="w-5 h-5 text-rose-400" />
                  </span>
                  <div>
                    <h3 className="font-bold text-zinc-100 mb-1">{item.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 2. THE SHIFT ──────────────────────────────────────────────────── */}
        <section className="relative py-24 px-6 overflow-hidden border-t border-white/[0.05]">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-[0.14]"
            style={{
              background:
                'radial-gradient(50% 60% at 50% 50%, #7C3AED, transparent), radial-gradient(40% 40% at 85% 30%, #EF4444, transparent)',
            }}
          />
          <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
            <Eyebrow>The Shift</Eyebrow>
            <h2 className="text-3xl sm:text-5xl font-black leading-tight">
              You own the saws, the trucks, and the crews.{' '}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
                Now own the software that runs the business.
              </span>
            </h2>
            <p className="text-zinc-300 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto">
              You invested in the physical tools and the skills to do the work right. The digital tools
              that run the business deserve the same treatment — tailored, controlled by you, and built
              to fit how your company already operates. AI changed the math: what used to take a software
              team and an IT department, you can now own.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {[
                { icon: Truck, label: 'Trucks & saws — yours' },
                { icon: Users, label: 'Crews & skills — yours' },
                { icon: Server, label: 'Digital tools — now yours too' },
              ].map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-sm"
                >
                  <c.icon className="w-4 h-4 text-violet-400" />
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. THE SOLUTION (how it works + proof modules) ────────────────── */}
        <section id="how" className="relative py-24 px-6 border-t border-white/[0.05]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14 space-y-4">
              <Eyebrow>How It Works</Eyebrow>
              <h2 className="text-3xl sm:text-5xl font-black leading-tight">
                Software that works the way{' '}
                <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
                  your company already works.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                We start with how you operate today, then design and build around it — and roll it out to
                your team. Not a generic tool bolted on. A real platform that fits.
              </p>
            </div>

            {/* Process */}
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
              {[
                { icon: Compass, step: 'Discover', desc: 'We learn your workflow on the ground — your crews, jobs, and the way decisions actually get made.' },
                { icon: PenTool, step: 'Design', desc: 'We map the software to your process, not the other way around. You stay in control of the direction.' },
                { icon: Hammer, step: 'Build', desc: 'We build the platform and the automations that fit your operation — tailored, not templated.' },
                { icon: Plug, step: 'Integrate & Support', desc: 'We roll it out to your team, integrate the pieces, and keep improving it alongside you.' },
              ].map((s, i) => (
                <li
                  key={s.step}
                  className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                      <s.icon className="w-5 h-5 text-violet-300" />
                    </span>
                    <span className="text-zinc-600 font-black text-2xl">{i + 1}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{s.step}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">{s.desc}</p>
                </li>
              ))}
            </ol>

            {/* Proof modules */}
            <div className="text-center mb-10 space-y-3">
              <h3 className="text-2xl sm:text-3xl font-black">
                Real modules we&apos;ve already built
              </h3>
              <p className="text-zinc-400 max-w-2xl mx-auto">
                Not a wish list — these run in production today for a real concrete-cutting company.
              </p>
            </div>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: Calendar, title: 'Scheduling & Dispatch', desc: 'A real-time schedule board with skill matching and crew availability at a glance.' },
                { icon: MapPin, title: 'GPS & NFC Timecards', desc: 'Operators clock in on-site. Overtime, breaks, and payroll-ready exports — automatic.' },
                { icon: Smartphone, title: 'Field Execution App', desc: 'Crews see the job, log work, upload photos, and capture signatures from their phone.' },
                { icon: Wrench, title: 'Equipment & Fleet', desc: 'Know where every tool is, who has it, and what needs service — tracked, not guessed.' },
                { icon: FileText, title: 'Dispatch, Tickets & Invoicing', desc: 'Tickets auto-generated, signatures captured, invoices and exports a click away.' },
                { icon: Mic, title: 'Voice & AI Automations', desc: 'Voice equipment checkout, voice-to-text logs, and smart skill-based scheduling.' },
              ].map((m) => (
                <li
                  key={m.title}
                  className="group rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6 space-y-3 hover:border-violet-500/30 hover:bg-violet-500/[0.04] transition-all"
                >
                  <span className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                    <m.icon className="w-5 h-5 text-violet-300" />
                  </span>
                  <h4 className="text-lg font-bold text-white">{m.title}</h4>
                  <p className="text-zinc-500 text-sm leading-relaxed">{m.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 4. CUSTOM SOLUTIONS ───────────────────────────────────────────── */}
        <section id="custom" className="relative py-24 px-6 border-t border-white/[0.05]">
          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <Eyebrow>Custom Builds</Eyebrow>
                <h2 className="text-3xl sm:text-4xl font-black leading-tight">
                  Need something built for{' '}
                  <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
                    your exact workflow?
                  </span>{' '}
                  We build it.
                </h2>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  The modules above are proof, not a fixed product. If your operation needs something
                  specific, we&apos;ll build it around the way you work. And if your industry&apos;s
                  software has left you behind entirely, we can create a custom solution from the ground
                  up — adaptable to any business, not just the trades.
                </p>
                <a
                  href="/request-demo"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 hover:opacity-90 text-white font-bold transition-all shadow-lg shadow-violet-900/40"
                >
                  Request a Demo
                  <ArrowRight className="w-5 h-5" />
                </a>
              </div>

              <ul className="grid gap-4">
                {[
                  { icon: LayoutDashboard, title: 'Operations platforms', desc: 'One system of record for the whole business.' },
                  { icon: Boxes, title: 'Field & crew apps', desc: 'Built for people who aren’t at a desk all day.' },
                  { icon: Bot, title: 'Agentic AI automations', desc: 'Software that does the repetitive work for you.' },
                  { icon: Plug, title: 'Integrations & dashboards', desc: 'Connect the tools you already use; see it all in one place.' },
                ].map((c) => (
                  <li
                    key={c.title}
                    className="flex items-start gap-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5"
                  >
                    <span className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                      <c.icon className="w-5 h-5 text-violet-300" />
                    </span>
                    <div>
                      <h3 className="font-bold text-zinc-100">{c.title}</h3>
                      <p className="text-zinc-500 text-sm">{c.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── 5. PROOF — Patriot case study ─────────────────────────────────── */}
        <section id="proof" className="relative py-24 px-6 overflow-hidden border-t border-white/[0.05]">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-[0.12]"
            style={{
              background:
                'radial-gradient(45% 50% at 20% 40%, #7C3AED, transparent), radial-gradient(45% 50% at 80% 60%, #EF4444, transparent)',
            }}
          />
          <div className="relative z-10 max-w-5xl mx-auto">
            <div className="text-center mb-12 space-y-4">
              <Eyebrow>Proof</Eyebrow>
              <h2 className="text-3xl sm:text-5xl font-black leading-tight">
                A real company.{' '}
                <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
                  A real, running platform.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                Patriot Concrete Cutting runs its entire operation on a custom platform we built around
                their crews — scheduling, dispatch, GPS timecards, equipment, job logs, invoicing, and a
                customer portal. One source of truth, owned by them.
              </p>
            </div>

            <div className="rounded-3xl bg-white/[0.03] border border-white/[0.08] p-8 sm:p-10 grid sm:grid-cols-3 gap-8 items-center">
              <div className="sm:col-span-2 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                    <Hammer className="w-6 h-6 text-violet-300" />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-white">Patriot Concrete Cutting</h3>
                    <p className="text-zinc-500 text-sm">Concrete cutting &amp; field operations</p>
                  </div>
                </div>
                <blockquote className="text-zinc-300 text-lg leading-relaxed border-l-2 border-violet-500/50 pl-5">
                  &ldquo;We went from scheduling by memory and chasing paper timecards on Friday to one
                  platform that runs the whole operation — built around how our crews actually work.&rdquo;
                </blockquote>
                <ul className="flex flex-wrap gap-3">
                  {['Schedule board', 'GPS / NFC timecards', 'Voice equipment checkout', 'Invoicing', 'Customer portal'].map(
                    (t) => (
                      <li
                        key={t}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-200 text-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t}
                      </li>
                    )
                  )}
                </ul>
                <a
                  href="/patriot"
                  className="inline-flex items-center gap-2 text-violet-300 hover:text-violet-200 font-semibold transition-colors"
                >
                  See what we built for Patriot
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-1 gap-4">
                {[
                  { stat: 'One', label: 'platform for the whole operation' },
                  { stat: '~20 hrs', label: 'admin time saved per week' },
                  { stat: '100%', label: 'of their data, owned by them' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-2xl bg-gradient-to-br from-violet-600/15 to-rose-600/10 border border-violet-500/20 p-4 text-center"
                  >
                    <div className="text-2xl font-black text-white">{s.stat}</div>
                    <div className="text-zinc-400 text-xs leading-snug mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── WHO IT'S FOR ──────────────────────────────────────────────────── */}
        <section className="relative py-20 px-6 border-t border-white/[0.05]">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Eyebrow>Who It&apos;s For</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">
              Construction &amp; trades first — but the approach fits any business outgrowing generic
              software.
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Concrete cutting, field service, and the trades are our home base. But the same idea works
              for any operations-heavy business stuck with spreadsheets, paper, and software it
              doesn&apos;t control. If the tools in your industry don&apos;t fit how you work, that&apos;s
              exactly the problem we solve.
            </p>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section className="relative py-24 px-6 border-t border-white/[0.05]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12 space-y-3">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="text-3xl sm:text-4xl font-black">Questions, answered</h2>
            </div>
            <div className="space-y-4">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6 open:border-violet-500/30"
                >
                  <summary className="flex items-center justify-between cursor-pointer list-none font-bold text-white text-lg">
                    {f.q}
                    <ArrowRight className="w-5 h-5 text-violet-400 shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="text-zinc-400 leading-relaxed mt-3">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. FINAL CTA ──────────────────────────────────────────────────── */}
        <section id="contact" className="relative py-28 px-6 overflow-hidden border-t border-white/[0.05]">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-[0.2]"
            style={{
              background:
                'radial-gradient(50% 60% at 50% 0%, #7C3AED, transparent), radial-gradient(45% 50% at 80% 80%, #EF4444, transparent)',
            }}
          />
          <div className="relative z-10 max-w-2xl mx-auto text-center space-y-8">
            <h2 className="text-3xl sm:text-5xl font-black leading-tight">
              Stop adapting to your software.{' '}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
                Make it adapt to you.
              </span>
            </h2>
            <p className="text-zinc-400 text-lg sm:text-xl leading-relaxed">
              Tell us how your business works. We&apos;ll show you what it looks like when the digital
              tools finally fit.
            </p>
            <div className="flex flex-col items-center gap-4">
              <a
                href="/request-demo"
                className="group inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 hover:opacity-90 text-white font-bold text-xl transition-all shadow-2xl shadow-violet-900/50"
              >
                Request a Demo
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="mailto:pontifexindustries@gmail.com"
                className="text-zinc-400 hover:text-white text-sm font-medium transition-colors"
              >
                Or contact us directly →
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-12 px-6">
        <div className="max-w-6xl mx-auto grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Pontifex Industries logo" width={28} height={28} className="w-7 h-7" />
              <span className="font-bold text-white text-sm tracking-tight">Pontifex Industries</span>
            </div>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Custom software &amp; AI automations built around how your business actually works.
            </p>
            <address className="not-italic text-zinc-500 text-sm space-y-1">
              <p>Upstate South Carolina</p>
              <a href="mailto:pontifexindustries@gmail.com" className="hover:text-violet-400 transition-colors">
                pontifexindustries@gmail.com
              </a>
            </address>
          </div>

          <nav aria-label="Product" className="space-y-3">
            <h2 className="text-zinc-300 text-sm font-semibold">Product</h2>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li><a href="#how" className="hover:text-zinc-300 transition-colors">How It Works</a></li>
              <li><a href="#custom" className="hover:text-zinc-300 transition-colors">Custom Builds</a></li>
              <li><a href="#proof" className="hover:text-zinc-300 transition-colors">Proof</a></li>
              <li><a href="/request-demo" className="hover:text-zinc-300 transition-colors">Request a Demo</a></li>
            </ul>
          </nav>

          <nav aria-label="Company" className="space-y-3">
            <h2 className="text-zinc-300 text-sm font-semibold">Company</h2>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li><a href="/support" className="hover:text-zinc-300 transition-colors">Support</a></li>
              <li><a href="mailto:pontifexindustries@gmail.com" className="hover:text-zinc-300 transition-colors">Contact</a></li>
              <li><a href="/company-login" className="hover:text-zinc-300 transition-colors">Log In</a></li>
            </ul>
          </nav>

          <nav aria-label="Legal" className="space-y-3">
            <h2 className="text-zinc-300 text-sm font-semibold">Legal</h2>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li><a href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</a></li>
            </ul>
          </nav>
        </div>
        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-zinc-600 text-xs">© 2026 Pontifex Industries. All rights reserved.</p>
          <p className="text-zinc-600 text-xs inline-flex items-center gap-1.5">
            <LifeBuoy className="w-3.5 h-3.5" /> Proudly built in Upstate SC
          </p>
        </div>
      </footer>
    </div>
  );
}
