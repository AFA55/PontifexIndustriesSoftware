'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  MapPin,
  Camera,
  FileText,
  Bell,
  Users,
  Smartphone,
  Download,
  Tag,
  Palette,
  Infinity,
  ChevronDown,
  ChevronUp,
  Zap,
  DollarSign,
  Phone,
  ArrowRight,
  Star,
  AlertTriangle,
  TrendingDown,
  Lock,
  Database,
  X,
} from 'lucide-react';

// --- Native scroll reveal (React 19 safe — no framer-motion) ---
function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '-60px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.6s ease-out ${delay}s, transform 0.6s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// --- Section wrapper ---
function Section({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`px-4 py-20 md:py-28 ${className}`}>
      <div className="max-w-5xl mx-auto">{children}</div>
    </section>
  );
}

// --- Simple agreement modal ---
function AgreementModal({
  onAgree,
  onClose,
}: {
  onAgree: () => void;
  onClose: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#13131a] border border-white/[0.1] rounded-2xl p-8 max-w-lg w-full shadow-2xl">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-black text-white mb-1">Simple Agreement</h3>
            <p className="text-zinc-500 text-sm">Plain language — no legal jargon.</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {[
            '30-day trial at $3,747 — 100% refundable, no questions asked.',
            'If you decide to continue: $2,000 for 6 months. Your $3,747 trial payment is credited in full toward the next 6 months — you only owe the $333 one-time onboarding fee to lock it in.',
            'After the 6-month term, pricing adjusts monthly based on your actual team size.',
            'All your data is yours. Exportable at any time. No lock-in.',
            'Cancel with 30 days notice after the 6-month term ends.',
          ].map((term, i) => (
            <div key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400 text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-zinc-300 text-sm leading-relaxed">{term}</p>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-6 select-none">
          <div
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5 ${
              agreed ? 'bg-violet-600 border-violet-600' : 'border-zinc-600'
            }`}
            onClick={() => setAgreed(!agreed)}
          >
            {agreed && <CheckCircle className="w-3 h-3 text-white" />}
          </div>
          <span className="text-zinc-400 text-sm leading-relaxed">
            I&apos;ve read and agree to these terms. I understand this is a 30-day trial and I can
            request a full refund at any time within the trial period.
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20 transition-all text-sm font-semibold"
          >
            Go back
          </button>
          <button
            onClick={onAgree}
            disabled={!agreed}
            className="flex-1 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition-all"
          >
            Proceed to Payment →
          </button>
        </div>
      </div>
    </div>
  );
}

// --- CTA Button ---
function CTAButton({
  size = 'lg',
  className = '',
}: {
  size?: 'lg' | 'xl';
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  async function handleAgree() {
    setShowAgreement(false);
    setLoading(true);
    try {
      const res = await fetch('/api/create-offer-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { success?: boolean; data?: { url?: string }; error?: string };
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
      }
    } catch {
      alert('Network error. Please try again.');
      setLoading(false);
    }
  }

  const base =
    'inline-flex items-center justify-center gap-3 font-black rounded-2xl transition-all duration-200 cursor-pointer';
  const sizes = {
    lg: 'px-8 py-4 text-lg',
    xl: 'px-10 py-5 text-xl',
  };

  return (
    <>
      <button
        onClick={() => setShowAgreement(true)}
        disabled={loading}
        className={`${base} ${sizes[size]} bg-violet-600 hover:bg-violet-500 active:scale-95 text-white shadow-lg shadow-violet-900/50 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          <>
            Claim Your Offer — $3,747
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>
      {showAgreement && (
        <AgreementModal onAgree={handleAgree} onClose={() => setShowAgreement(false)} />
      )}
    </>
  );
}

// --- Comparison data ---
const comparisonRows = [
  {
    label: 'Sign-on / training cost',
    dsm: '$2,100',
    cenpoint: '$2,500',
    pontifex: '$0',
    pontifexHighlight: true,
  },
  {
    label: 'First 6 months',
    dsm: '$2,148',
    cenpoint: '$2,400 minimum',
    pontifex: '$2,000',
    pontifexHighlight: false,
  },
  {
    label: 'Total — year one',
    dsm: '$6,396+',
    cenpoint: '$7,300+',
    pontifex: '~$4,080',
    pontifexHighlight: true,
    bold: true,
  },
  {
    label: 'Helper / apprentice tracking',
    dsm: false,
    cenpoint: false,
    pontifex: true,
  },
  {
    label: 'Unlimited custom changes',
    dsm: false,
    cenpoint: false,
    pontifex: true,
  },
  {
    label: '30-day money-back guarantee',
    dsm: false,
    cenpoint: false,
    pontifex: true,
  },
  {
    label: 'Personal developer on call',
    dsm: false,
    cenpoint: false,
    pontifex: true,
  },
  {
    label: 'Built for concrete cutting',
    dsm: false,
    cenpoint: false,
    pontifex: true,
  },
];

type ComparisonCell = string | boolean;

function ComparisonCell({
  value,
  isPontifex = false,
}: {
  value: ComparisonCell;
  isPontifex?: boolean;
}) {
  if (typeof value === 'boolean') {
    return value ? (
      <CheckCircle className={`w-5 h-5 mx-auto ${isPontifex ? 'text-violet-400' : 'text-green-400'}`} />
    ) : (
      <XCircle className="w-5 h-5 mx-auto text-red-400/60" />
    );
  }
  return (
    <span className={isPontifex ? 'text-violet-300 font-bold' : 'text-zinc-300'}>
      {value}
    </span>
  );
}

// --- Value stack features ---
const features = [
  {
    icon: Calendar,
    name: 'Smart Schedule Board',
    description: 'Drag-and-drop dispatch with operator availability, skill warnings, and real-time status colors.',
    competitorValue: '$180/mo at competitors',
  },
  {
    icon: Smartphone,
    name: 'Operator Mobile App',
    description: 'GPS-verified clock in/out, daily job logs, photos — all from a phone browser, nothing to install.',
    competitorValue: '$15/operator/mo',
  },
  {
    icon: Clock,
    name: 'Payroll Automation',
    description: 'What used to take 1/3 of a workweek now takes 2–3 hours of confirmation. Timecard segments, break deductions, batch approval.',
    competitorValue: '$120/mo',
  },
  {
    icon: FileText,
    name: 'Job Tracking — Dispatch to Invoice',
    description: 'Dispatch tickets, work logs, photo capture, customer signatures, PDF invoices — one unbroken chain.',
    competitorValue: '$200/mo',
  },
  {
    icon: Shield,
    name: 'Facility Compliance & Badge Tracking',
    description: 'Safety badge expiration alerts, site-specific requirements, auto-compliance checks per job.',
    competitorValue: '$80/mo',
  },
  {
    icon: Bell,
    name: 'Real-Time Notifications',
    description: 'Job completions, operator clock-ins, change requests, approval needed — all pushed instantly.',
    competitorValue: '$40/mo',
  },
  {
    icon: Users,
    name: 'Customer Management',
    description: 'Contact database, job history, electronic signatures, customer portal access.',
    competitorValue: '$60/mo',
  },
  {
    icon: Download,
    name: 'QuickBooks CSV Export',
    description: 'One-click payroll and billing exports formatted for direct import to QuickBooks.',
    competitorValue: '$50/mo',
  },
  {
    icon: Tag,
    name: 'NFC Time Clock Tags',
    description: 'Operators tap an NFC tag on-site to clock in — GPS-verified location, zero-friction.',
    competitorValue: '$100 setup + $30/mo',
  },
  {
    icon: Palette,
    name: 'Fully White-Labeled',
    description: 'Your colors, your logo, your brand. Looks like software your company built — not off-the-shelf.',
    competitorValue: 'Not available',
  },
  {
    icon: Infinity,
    name: 'Unlimited Change Requests',
    description: 'Anything that doesn\'t fit your workflow — you tell Andres, it gets fixed. No tickets, no extra fees.',
    competitorValue: 'Not available',
  },
  {
    icon: MapPin,
    name: 'GPS Clock-In Verification',
    description: 'Every clock-in is location-stamped. Operators can\'t self-report start times — the system verifies they\'re actually on-site.',
    competitorValue: '$50/mo',
  },
  {
    icon: Camera,
    name: 'In-App Photo Capture',
    description: 'Before/after job photos attached directly to work logs and dispatch tickets.',
    competitorValue: 'Included in mobile',
  },
  {
    icon: Database,
    name: 'Automated Contact Backups',
    description: 'Daily automatic backups of all customer and contact data. Export anytime — your data is always yours.',
    competitorValue: 'Not available',
  },
  {
    icon: Lock,
    name: 'Enterprise-Grade Security',
    description: 'Supabase (backed by AWS), RLS policies on every table, daily backups, 99.9% uptime SLA.',
    competitorValue: 'Standard',
  },
];

const competitorTotal = 930 + 15 * 10;
const annualCompetitorValue = competitorTotal * 12;

// --- FAQ items ---
const faqs = [
  {
    q: 'What if something breaks?',
    a: 'You call or text Andres directly. Not a helpdesk, not a ticket system, not "we\'ll get back to you in 3–5 business days." Me, personally, within hours.',
  },
  {
    q: 'What if my operators can\'t figure it out?',
    a: 'It was built to be dead simple. Clock in, log work, clock out. Every operator we\'ve tested picks it up in under 10 minutes. We\'ll also do a 30-minute walkthrough with your whole crew on day one.',
  },
  {
    q: 'What happens after the 30 days?',
    a: 'Pricing adjusts based on your actual team size at that point — how many operators and helpers you have on the platform. We\'ll review your crew together and confirm the exact rate before you commit to anything.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'Operators use it on their phone browser — nothing to install. You manage everything from a full web dashboard on any device.',
  },
  {
    q: 'What about my data?',
    a: 'Hosted on Supabase (backed by AWS), enterprise-grade security, row-level security on every table, daily automated backups, 99.9% uptime SLA. Contact data is exportable at any time. Your data is always yours.',
  },
  {
    q: 'How does the money-back guarantee work?',
    a: 'If after 30 days you don\'t think it\'s worth every penny — just tell me. I\'ll process 100% of the $3,747 refund with no questions, no contracts, and no hard feelings. The risk is entirely on me.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="border border-white/[0.08] rounded-2xl overflow-hidden"
      onClick={() => setOpen(!open)}
    >
      <button className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-white/[0.03] transition-colors">
        <span className="font-semibold text-white">{q}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-zinc-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-zinc-500 flex-shrink-0" />
        )}
      </button>
      <div
        style={{
          maxHeight: open ? '400px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out, opacity 0.25s ease-out',
          opacity: open ? 1 : 0,
        }}
        className="px-6 pb-6"
      >
        <p className="text-zinc-400 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

// ===========================
// MAIN PAGE
// ===========================
export default function OfferPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top nav bar */}
      <div className="border-b border-white/[0.05] px-6 py-4 sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white">Pontifex Industries</span>
          </div>
          <CTAButton size="lg" className="hidden md:inline-flex !py-2.5 !px-6 !text-base" />
        </div>
      </div>

      {/* ─── HERO ─── */}
      <Section className="pt-24 md:pt-32 pb-20 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 rounded-full px-4 py-2 text-violet-300 text-sm font-semibold mb-8">
            <Star className="w-4 h-4" />
            Exclusive Offer — Built for Patriot Concrete Cutting
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.05] mb-6 tracking-tight">
            Built For Patriot.
            <br />
            <span className="text-violet-400">Backed By A Guarantee.</span>
          </h1>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto mb-12 leading-relaxed">
            One platform that runs your whole operation — scheduling, payroll, jobs, and compliance.
            Custom-built for concrete cutting.{' '}
            <span className="text-white font-semibold">Risk-free for 30 days.</span>
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
            <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5">
              <Calendar className="w-6 h-6 text-violet-400" />
              <div className="text-left">
                <p className="text-2xl font-black text-white">14+ Months</p>
                <p className="text-sm text-zinc-500">of Development</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5">
              <Shield className="w-6 h-6 text-violet-400" />
              <div className="text-left">
                <p className="text-2xl font-black text-white">100%</p>
                <p className="text-sm text-zinc-500">Money-Back Guarantee</p>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <CTAButton size="xl" />
          <p className="mt-4 text-sm text-zinc-500">
            Review a simple 5-point agreement, then proceed to secure payment.
          </p>
        </Reveal>

        <Reveal delay={0.6}>
          <div className="mt-16 flex flex-col items-center gap-2 text-zinc-600">
            <p className="text-xs uppercase tracking-widest">See why the math is obvious</p>
            <ChevronDown className="w-5 h-5 animate-bounce" />
          </div>
        </Reveal>
      </Section>

      {/* ─── THE PROBLEM ─── */}
      <Section className="bg-zinc-950/50 border-y border-white/[0.04]">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 text-red-400/80 text-sm font-semibold uppercase tracking-wider mb-4">
              <AlertTriangle className="w-4 h-4" />
              The Problem
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Operations shouldn&apos;t run on guesswork and paperwork.
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Every day without a real system costs you time, money, and mental energy.
            </p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Clock,
              title: '1/3 of a workweek — just on payroll',
              description:
                'Manually inputting times, tracking operators, chasing paperwork. Every single week. That\'s 13+ hours that should be spent running the business.',
              color: 'red',
            },
            {
              icon: MapPin,
              title: 'No clock-in verification — operators self-report',
              description:
                'No GPS check at clock-in. Operators enter whatever time they "started." No location awareness, no verification. Those extra self-reported minutes every day add up to hours of payroll every week that the clock never actually ran.',
              color: 'orange',
            },
            {
              icon: TrendingDown,
              title: 'Competitors charge a fortune',
              description:
                'DSM: $4,248 just to get started. Cenpoint: $7,300+ year one. And neither one tracks your helpers. You\'re paying operator rates for apprentices.',
              color: 'yellow',
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={i} delay={i * 0.1}>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                  <div
                    className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${
                      item.color === 'red'
                        ? 'bg-red-500/10 border border-red-500/20'
                        : item.color === 'orange'
                        ? 'bg-orange-500/10 border border-orange-500/20'
                        : 'bg-yellow-500/10 border border-yellow-500/20'
                    }`}
                  >
                    <Icon
                      className={`w-6 h-6 ${
                        item.color === 'red'
                          ? 'text-red-400'
                          : item.color === 'orange'
                          ? 'text-orange-400'
                          : 'text-yellow-400'
                      }`}
                    />
                  </div>
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{item.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* ─── COMPARISON TABLE ─── */}
      <Section id="compare">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 text-violet-400 text-sm font-semibold uppercase tracking-wider mb-4">
              <DollarSign className="w-4 h-4" />
              The Math
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              The math doesn&apos;t lie.
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Side-by-side against every alternative you&apos;ve probably considered.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-5 text-zinc-500 font-semibold text-sm bg-white/[0.02] border-b border-white/[0.06] w-1/3">
                    &nbsp;
                  </th>
                  <th className="p-5 text-center text-zinc-400 font-semibold text-sm bg-white/[0.02] border-b border-white/[0.06]">
                    DSM
                  </th>
                  <th className="p-5 text-center text-zinc-400 font-semibold text-sm bg-white/[0.02] border-b border-white/[0.06]">
                    Cenpoint
                  </th>
                  <th className="p-5 text-center bg-violet-500/10 border-b border-violet-500/30 relative">
                    <div className="flex flex-col items-center gap-1">
                      <span className="inline-flex items-center gap-1.5 bg-violet-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3" /> Best Value
                      </span>
                      <span className="text-violet-300 font-bold">Pontifex</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-white/[0.04] last:border-0 ${
                      row.bold ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    <td
                      className={`p-5 text-sm ${
                        row.bold ? 'font-bold text-white' : 'text-zinc-400'
                      }`}
                    >
                      {row.label}
                    </td>
                    <td className={`p-5 text-center text-sm ${row.bold ? 'font-bold' : ''}`}>
                      <ComparisonCell value={row.dsm} />
                    </td>
                    <td className={`p-5 text-center text-sm ${row.bold ? 'font-bold' : ''}`}>
                      <ComparisonCell value={row.cenpoint} />
                    </td>
                    <td
                      className={`p-5 text-center text-sm bg-violet-500/5 border-l border-r border-violet-500/20 ${
                        row.bold ? 'font-bold' : ''
                      }`}
                    >
                      <ComparisonCell value={row.pontifex} isPontifex />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-8 grid md:grid-cols-2 gap-4">
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
              <p className="text-sm text-red-400/70 font-semibold uppercase tracking-wider mb-2">DSM pricing note</p>
              <p className="text-zinc-300 text-sm leading-relaxed">
                DSM charges{' '}
                <span className="text-white font-semibold">$35.80/operator/month</span> —
                operators only. Every helper or apprentice costs the same full rate. With Patriot&apos;s
                crew, you&apos;re looking at $400+ per month before you&apos;ve added anyone.
              </p>
            </div>
            <div className="bg-violet-500/5 border border-violet-500/30 rounded-2xl p-6">
              <p className="text-sm text-violet-400 font-semibold uppercase tracking-wider mb-2">Pontifex 6-month deal</p>
              <p className="text-zinc-300 text-sm leading-relaxed">
                <span className="text-white font-semibold">$2,000 for 6 months</span>{' '}
                ($333.34/month) for your entire crew — operators and helpers included.
                Your $3,747 trial payment is credited in full toward the next 6 months, so you only owe{' '}
                <span className="text-violet-300 font-bold">$333 to lock in the full term</span>{' '}
                (one-time onboarding fee). After 6 months, pricing adjusts to your exact team size.
              </p>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ─── VALUE STACK ─── */}
      <Section className="bg-zinc-950/50 border-y border-white/[0.04]">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 text-violet-400 text-sm font-semibold uppercase tracking-wider mb-4">
              <Zap className="w-4 h-4" />
              Everything You Get
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              15 features. One platform. One price.
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Every single one of these would cost you separately from piecemeal software.
            </p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={i} delay={Math.floor(i / 2) * 0.05}>
                <div className="flex gap-4 bg-white/[0.03] border border-white/[0.06] hover:border-violet-500/30 hover:bg-violet-500/[0.04] rounded-2xl p-5 transition-all duration-200">
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-white">{f.name}</p>
                      <span className="text-xs text-zinc-600 whitespace-nowrap flex-shrink-0 mt-0.5">
                        {f.competitorValue}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* Value summary */}
        <Reveal>
          <div className="bg-gradient-to-br from-violet-500/10 to-violet-900/10 border border-violet-500/30 rounded-2xl p-8 text-center">
            <p className="text-zinc-400 mb-2">
              All of this separately at competitors:{' '}
              <span className="text-zinc-300 font-semibold line-through">
                ${annualCompetitorValue.toLocaleString()}+/year
              </span>
            </p>
            <p className="text-3xl md:text-4xl font-black text-white mb-1">
              Your 30-day trial:{' '}
              <span className="text-violet-400">$3,747</span>
            </p>
            <p className="text-zinc-400 text-sm mb-1">
              If you continue: $2,000 for 6 months ($333.34/month) — your $3,747 is credited.
            </p>
            <p className="text-zinc-500 text-xs mb-6">
              You only owe $333 to lock in the full 6-month term (one-time onboarding). Less than 1/6 of what DSM charges just to sign.
            </p>
            <CTAButton size="lg" />
          </div>
        </Reveal>
      </Section>

      {/* ─── GUARANTEE ─── */}
      <Section id="guarantee">
        <Reveal>
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-violet-500/10 border-2 border-violet-500/40 mb-8">
              <Shield className="w-12 h-12 text-violet-400" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              The Ironclad Guarantee
            </h2>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 md:p-12 text-left">
              <p className="text-xl md:text-2xl text-zinc-200 leading-relaxed mb-6">
                &ldquo;If after 30 days you don&apos;t think this is worth every penny, tell me.
                I&apos;ll send 100% of your money back. No contracts, no fine print, no hard
                feelings.&rdquo;
              </p>
              <p className="text-zinc-400 leading-relaxed">
                I&apos;m not here looking for a big salary just because I built something. I want to
                show you I&apos;m worth it through results first. The risk is entirely on me. Either
                the platform solves real problems for Patriot&apos;s operation — or you get every
                dollar back. I have 14 months of work invested in this. I&apos;m not worried about
                the guarantee because I know it works. But I also know you&apos;ve been burned before
                by software promises, and I want to remove every last shred of risk from your decision.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-violet-400 flex-shrink-0" />
                  <span className="text-zinc-300 text-sm">100% refund if not satisfied</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-violet-400 flex-shrink-0" />
                  <span className="text-zinc-300 text-sm">No contracts or lock-ins</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-violet-400 flex-shrink-0" />
                  <span className="text-zinc-300 text-sm">No questions asked</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ─── WHY THIS PRICE ─── */}
      <Section className="bg-zinc-950/50 border-y border-white/[0.04]">
        <Reveal>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 text-violet-400 text-sm font-semibold uppercase tracking-wider mb-4">
                <Phone className="w-4 h-4" />
                Why $3,747?
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
                Add up what you&apos;re losing right now.
              </h2>
              <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                $3,747 isn&apos;t a software fee. It&apos;s a fraction of what one year of the status quo costs you in invisible bleed.
              </p>
            </div>

            {/* ── Itemized cost breakdown ── */}
            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {/* 1. Custom dev */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-violet-500/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-violet-400 font-bold uppercase tracking-wider">1 · Custom software</p>
                  <p className="text-xl font-black text-zinc-300">$30k–$100k+</p>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Hiring a developer to build a platform shaped around concrete cutting ops costs $150–$250/hr. A real custom build runs <span className="text-white font-semibold">$30k to $100k+</span>. Off-the-shelf tools (DSM, Cenpoint) ignore 80% of how you actually work. You&apos;re getting the custom build for the price of a small fraction.
                </p>
              </div>

              {/* 2. Cost of not upgrading */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-violet-500/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-violet-400 font-bold uppercase tracking-wider">2 · Status quo cost</p>
                  <p className="text-xl font-black text-zinc-300">Compounds monthly</p>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Every month you stay on paper, spreadsheets, or generic tools is another month of buried problems — late billing, dropped follow-ups, missing photos, lost change-order context. Doesn&apos;t show up on a P&amp;L line, but it&apos;s real cash.
                </p>
              </div>

              {/* 3. Inaccurate time tracking */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-violet-500/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-violet-400 font-bold uppercase tracking-wider">3 · Phantom time</p>
                  <p className="text-xl font-black text-rose-400">~$13,680/yr</p>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Operators write down &ldquo;arrived at 8&rdquo; — they actually arrived at 8:23. Multiply <span className="text-white font-semibold">23 min × 4 days/week × 50 weeks × 4 crew × $45/hr loaded cost</span> = <span className="text-rose-300 font-semibold">$13,680/year</span> billed to you for hours nobody worked. Pontifex&apos;s 20-ft GPS clock-in eliminates it on day one.
                </p>
              </div>

              {/* 4. Admin manual entry */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-violet-500/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-violet-400 font-bold uppercase tracking-wider">4 · Admin retyping</p>
                  <p className="text-xl font-black text-rose-400">~$7,500/yr</p>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Office admin spends <span className="text-white font-semibold">30–60 min/day</span> chasing texts, photos, paper sheets, and manually retyping operator hours into payroll. At $25/hr loaded, that&apos;s <span className="text-rose-300 font-semibold">$7,500/year</span> just to keep up. Pontifex auto-flows clock-in straight to timecards — your admin sees, edits, approves. Done.
                </p>
              </div>

              {/* 5. Inefficiency on completion + invoicing */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-violet-500/30 transition-colors md:col-span-2">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-violet-400 font-bold uppercase tracking-wider">5 · Slow billing &amp; lost follow-up</p>
                  <p className="text-xl font-black text-rose-400">Days of cashflow</p>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed mb-3">
                  Every job that sits a week between completion and invoicing is a week your customer hasn&apos;t been billed. Every signature collected on paper is another hour finding the form, scanning it, attaching it, emailing it. Pontifex closes that loop:
                </p>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" /> <span>Operator&apos;s on-site customer signature → auto-converted to a polished PDF, attached to the job, viewable from the admin completed-jobs panel.</span></li>
                  <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" /> <span>Operator-uploaded completion photos visible to admin in seconds — no &ldquo;send me that pic&rdquo; texts.</span></li>
                  <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" /> <span>Operator + helper names linked directly to their timecards — admin sees who worked, edits time inline, approves payroll.</span></li>
                  <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" /> <span>Job completed → invoice draft auto-built from the operator&apos;s actual work-performed entries. Review, edit, send. Days of admin loop collapse to minutes.</span></li>
                </ul>
              </div>
            </div>

            {/* ── The math summary ── */}
            <div className="bg-gradient-to-br from-violet-500/10 to-violet-900/10 border border-violet-500/30 rounded-2xl p-8 md:p-10 mb-10">
              <p className="text-violet-400 text-xs font-bold uppercase tracking-wider mb-3">Conservative math</p>
              <div className="space-y-2 text-zinc-300 mb-5">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span>Phantom time on operators</span>
                  <span className="text-rose-300 font-semibold">$13,680/yr</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span>Admin retyping hours</span>
                  <span className="text-rose-300 font-semibold">$7,500/yr</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span>Slow billing &amp; lost cashflow</span>
                  <span className="text-rose-300 font-semibold">~$5,000/yr (low end)</span>
                </div>
                <div className="flex items-center justify-between pt-2 text-lg font-bold">
                  <span className="text-white">Hidden bleed — year one</span>
                  <span className="text-rose-400">~$26,180+</span>
                </div>
              </div>
              <div className="border-t border-white/[0.08] pt-5 flex items-center justify-between">
                <p className="text-white text-lg font-bold">Pontifex trial</p>
                <p className="text-3xl font-black text-violet-300">$3,747</p>
              </div>
              <p className="text-zinc-400 text-sm mt-3 leading-relaxed">
                One year of the leaks above pays for the platform <span className="text-white font-semibold">~7 times over</span>. And $3,747 is fully refundable for 30 days — you decide whether the math holds up before you commit.
              </p>
            </div>

            {/* ── Personal note (kept, shorter) ── */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-black text-violet-300">A</span>
                </div>
                <div>
                  <p className="font-bold text-white">Andres</p>
                  <p className="text-sm text-zinc-500">Developer &amp; operator, Pontifex Industries</p>
                </div>
              </div>
              <div className="space-y-4 text-zinc-300 leading-relaxed text-sm">
                <p>
                  I built this around real feedback from real operators and admins running real jobs.
                  Every feature was requested, tested, and refined by the people who use it daily.
                  And I keep building — new screens, custom flows, and changes shaped around what
                  Patriot specifically needs come at no extra cost during your term.
                </p>
                <p>
                  $3,747 covers the custom development that goes into your platform. I&apos;m not
                  trying to extract a big payday on day one — I&apos;m trying to{' '}
                  <span className="text-white font-semibold">prove the platform is worth more than it costs</span>{' '}
                  in the first 30 days. After that: $2,000 for 6 months, your trial credits in full,
                  you owe just $333 onboarding to continue.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ─── FAQ ─── */}
      <Section>
        <Reveal>
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Questions? I&apos;ve got answers.
            </h2>
            <p className="text-zinc-400 text-lg">
              Every objection you might have. Laid out honestly.
            </p>
          </div>
        </Reveal>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <FAQItem q={faq.q} a={faq.a} />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ─── FINAL CTA ─── */}
      <Section className="bg-gradient-to-b from-violet-950/20 to-[#0a0a0f] border-t border-white/[0.04]">
        <Reveal>
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-2 text-green-400 text-sm font-semibold mb-8">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              1 client slot — currently available
            </div>

            <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
              Start your{' '}
              <span className="text-violet-400">30-day</span>
              <br />
              risk-free trial.
            </h2>

            <p className="text-xl text-zinc-400 mb-10 leading-relaxed">
              Everything your operation needs. One platform. One price. Zero risk.
            </p>

            {/* Offer summary card */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 mb-8 text-left">
              <p className="text-xs text-violet-400 font-semibold uppercase tracking-wider mb-4">
                What you&apos;re getting today
              </p>
              <div className="space-y-3 mb-6">
                {[
                  'Full platform access — every feature, every screen',
                  '30 days to run real jobs with real operators',
                  'Andres personally on-call for every question and change',
                  '100% money-back if it doesn\'t work — zero risk',
                  'Continue: $2,000 for 6 months (trial credited in full — owe just $333 onboarding)',
                  'Daily automated backups of all your contact and job data',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-violet-400 flex-shrink-0" />
                    <span className="text-zinc-200">{item}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/[0.06] pt-6 flex items-end justify-between flex-wrap gap-4">
                <div>
                  <p className="text-zinc-500 text-sm">30-day trial investment</p>
                  <p className="text-4xl font-black text-white">$3,747</p>
                  <p className="text-zinc-600 text-sm mt-1">one-time • 100% refundable</p>
                </div>
                <CTAButton size="lg" />
              </div>
            </div>

            <p className="text-zinc-600 text-sm">
              You&apos;ll review a simple 5-point agreement before payment. Secure checkout via Stripe.
              <br />
              Questions? Text Andres directly at{' '}
              <a href="tel:+1" className="text-zinc-400 hover:text-white transition-colors">
                (contact provided after purchase)
              </a>
            </p>
          </div>
        </Reveal>
      </Section>

      {/* Footer */}
      <div className="border-t border-white/[0.04] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-zinc-500 text-sm">Pontifex Industries</span>
          </div>
          <p className="text-zinc-600 text-xs text-center">
            Built specifically for Patriot Concrete Cutting &mdash; pontifexindustries.com
          </p>
          <div className="flex items-center gap-4 text-xs text-zinc-600">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
