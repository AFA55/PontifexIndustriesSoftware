'use client';

import { useRef, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { isNativeApp } from '@/lib/is-native';
import NativeWebOnlyNotice from '@/components/NativeWebOnlyNotice';
import {
  FileText,
  Clock,
  TrendingUp,
  Calendar,
  CheckCircle,
  ArrowRight,
  HardHat,
  Wifi,
  MapPin,
  Star,
  ChevronDown,
  Layers,
  Loader2,
  AlertTriangle,
  X,
  Zap,
} from 'lucide-react';

// ─── Scroll-triggered fade-in ────────────────────────────────────────────────
function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'none';
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
      { rootMargin: '-50px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dirMap: Record<string, string> = {
    up: 'translateY(28px)',
    left: 'translateX(28px)',
    right: 'translateX(-28px)',
    none: 'translateY(0)',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate(0,0)' : dirMap[direction],
        transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Background orb ───────────────────────────────────────────────────────────
function Orb({
  color,
  size,
  top,
  left,
  blur = 120,
  opacity = 0.12,
}: {
  color: string;
  size: number;
  top?: string;
  left?: string;
  blur?: number;
  opacity?: number;
}) {
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        top,
        left,
        background: color,
        filter: `blur(${blur}px)`,
        opacity,
      }}
    />
  );
}

// ─── Skill bar ────────────────────────────────────────────────────────────────
function SkillBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="text-zinc-300 font-medium">{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Static operator profile card ────────────────────────────────────────────
function OperatorProfileCard() {
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-zinc-800/80 backdrop-blur-sm shadow-2xl overflow-hidden max-w-sm mx-auto">
      {/* Header stripe */}
      <div className="h-1.5 bg-gradient-to-r from-red-700 via-violet-600 to-indigo-600" />

      {/* Profile top */}
      <div className="px-5 pt-5 pb-4 border-b border-zinc-700/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shrink-0">
            M
          </div>
          <div>
            <div className="text-white font-bold leading-tight">Your Name</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <HardHat className="w-3.5 h-3.5 text-red-400" />
              <span className="text-zinc-400 text-xs">Operator · Patriot Concrete</span>
            </div>
          </div>
          <div className="ml-auto">
            <span className="text-xs px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-medium">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-zinc-700/50">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
          <div className="text-emerald-400 font-black text-lg leading-none">41.2</div>
          <div className="text-zinc-500 text-xs mt-1">hrs this week</div>
          <div className="text-zinc-600 text-xs mt-0.5">
            <span className="text-zinc-400">Reg: </span>40.0
            <span className="text-yellow-400 ml-2">OT: </span>
            <span className="text-yellow-400">1.2</span>
          </div>
        </div>
        <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 text-center">
          <div className="text-violet-400 font-black text-lg leading-none">23</div>
          <div className="text-zinc-500 text-xs mt-1">jobs this month</div>
          <div className="text-zinc-400 text-xs mt-0.5">completed</div>
        </div>
        <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-center">
          <div className="text-sky-400 font-black text-lg leading-none">28/30</div>
          <div className="text-zinc-500 text-xs mt-1">on time</div>
          <div className="text-zinc-400 text-xs mt-0.5">last 30 days</div>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-center">
          <div className="text-amber-400 font-black text-lg leading-none">7.5</div>
          <div className="text-zinc-500 text-xs mt-1">PTO days left</div>
          <div className="text-zinc-400 text-xs mt-0.5">this year</div>
        </div>
      </div>

      {/* Skill bars */}
      <div className="px-5 py-4 space-y-3">
        <div className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2">Your Skills</div>
        <SkillBar label="Wall Saw" value={8} max={10} />
        <SkillBar label="Core Drill" value={6} max={10} />
        <SkillBar label="Flat Saw" value={5} max={10} />
      </div>

      {/* Caption */}
      <div className="px-5 pb-4">
        <div className="rounded-xl bg-zinc-700/40 border border-zinc-600/30 px-3 py-2 text-xs text-zinc-500 text-center leading-relaxed">
          Your real numbers, updated every shift
        </div>
      </div>
    </div>
  );
}

// ─── How It Works step ────────────────────────────────────────────────────────
function Step({
  number,
  title,
  desc,
  icon: Icon,
  isLast = false,
}: {
  number: number;
  title: string;
  desc: string;
  icon: React.ElementType;
  isLast?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 relative">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-700/80 to-violet-700/80 border border-red-600/30 flex items-center justify-center shadow-lg shrink-0">
        <Icon className="w-6 h-6 text-white" />
      </div>
      {/* connector line (hidden on last step) */}
      {!isLast && (
        <div className="hidden md:block absolute left-full top-7 w-full h-px bg-gradient-to-r from-zinc-600 to-transparent -translate-y-0.5" />
      )}
      <div className="space-y-1">
        <div className="text-xs text-red-400 font-bold uppercase tracking-wider">Step {number}</div>
        <div className="text-white font-bold text-lg">{title}</div>
        <div className="text-zinc-400 text-sm leading-relaxed max-w-xs mx-auto">{desc}</div>
      </div>
    </div>
  );
}

// ─── Value prop card ──────────────────────────────────────────────────────────
function ValueCard({
  icon: Icon,
  title,
  desc,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <div className="rounded-2xl bg-zinc-800/60 border border-zinc-700/60 hover:border-violet-500/40 hover:bg-zinc-800/80 transition-all p-6 h-full space-y-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-700/40 to-violet-700/40 border border-red-600/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-red-300" />
        </div>
        <div>
          <h3 className="text-white font-bold text-base mb-2 leading-snug">{title}</h3>
          <p className="text-zinc-400 text-sm leading-relaxed">{desc}</p>
        </div>
      </div>
    </FadeIn>
  );
}

// ─── Pricing card ─────────────────────────────────────────────────────────────
function PricingCard({
  title,
  priceId,
  price,
  period,
  perMonth,
  badge,
  featured,
  features,
}: {
  title: string;
  priceId: string;
  price: string;
  period: string;
  perMonth: string;
  badge?: string;
  featured?: boolean;
  features: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleGetStarted = async () => {
    setLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          tenantId: '',
          email: '',
          companyCode: 'PATRIOT',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        setCheckoutError(json?.error || 'Unable to start checkout. Please try again.');
        return;
      }
      window.location.href = json.data.url;
    } catch {
      setCheckoutError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`relative rounded-2xl flex flex-col h-full transition-all ${
        featured
          ? 'bg-gradient-to-br from-red-950/70 to-zinc-900/90 border-2 border-red-600/50 shadow-2xl shadow-red-900/30'
          : 'bg-zinc-800/60 border border-zinc-700/60 hover:border-red-700/40'
      }`}
    >
      {/* Top gradient bar */}
      <div className={`h-1 rounded-t-2xl ${featured ? 'bg-gradient-to-r from-red-600 via-red-500 to-violet-500' : 'bg-gradient-to-r from-zinc-600 to-zinc-500'}`} />

      {/* Badge */}
      {badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-red-600 to-red-500 text-white text-xs font-bold shadow-lg shadow-red-900/40 whitespace-nowrap">
            <Zap className="w-3 h-3" />
            {badge}
          </span>
        </div>
      )}

      <div className="p-7 flex flex-col flex-1 gap-6">
        {/* Title & price */}
        <div className="space-y-3">
          <h3 className="text-zinc-300 font-semibold text-sm uppercase tracking-wider">{title}</h3>
          <div className="flex items-end gap-2">
            <span className={`text-4xl font-black leading-none ${featured ? 'text-white' : 'text-zinc-100'}`}>{price}</span>
            <span className="text-zinc-400 text-sm pb-1">/ {period}</span>
          </div>
          <p className={`text-sm font-medium ${featured ? 'text-red-400' : 'text-zinc-500'}`}>{perMonth}</p>
        </div>

        {/* Feature list */}
        <ul className="space-y-2.5 flex-1">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <CheckCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        {/* Error */}
        {checkoutError && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-500/15 border border-rose-500/30 px-3 py-2.5 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {checkoutError}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleGetStarted}
          disabled={loading}
          className={`min-h-[52px] w-full flex items-center justify-center gap-2 rounded-2xl font-bold text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            featured
              ? 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white shadow-xl shadow-red-900/40'
              : 'bg-zinc-700/80 hover:bg-zinc-600/80 text-white border border-zinc-600/60'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Setting up checkout…
            </>
          ) : (
            <>
              Get Started
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Pricing section ──────────────────────────────────────────────────────────
function PricingSection() {
  const SHARED_FEATURES = [
    'Unlimited jobs & job history',
    'Full operator mobile app',
    'Schedule board & dispatch',
    'Timecard & NFC clock-in',
    'Customer signatures & photos',
    'Invoicing & QuickBooks CSV export',
    'Inventory & equipment management',
    'All future platform updates',
  ];

  return (
    <section id="pricing" className="relative py-24 px-5 overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-700/20 to-transparent" />
      <Orb color="radial-gradient(circle, #b91c1c, transparent)" size={600} top="0%" left="20%" opacity={0.08} />
      <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="40%" left="70%" opacity={0.07} />

      <div className="max-w-4xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14 space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-700/15 border border-red-700/30 text-red-400 text-xs font-bold uppercase tracking-widest">
              <Zap className="w-3.5 h-3.5" />
              Pricing
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black">
              Simple, Transparent{' '}
              <span className="bg-gradient-to-r from-red-500 to-violet-400 bg-clip-text text-transparent">
                Pricing
              </span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              Full platform access. No per-seat fees. No surprises.
            </p>
          </div>
        </FadeIn>

        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <FadeIn delay={0}>
            <PricingCard
              title="6-Month Plan"
              priceId="price_1TbV2E0WWq11qMKimnEXVElP"
              price="$3,747"
              period="6 months"
              perMonth="~$625/month"
              features={SHARED_FEATURES}
            />
          </FadeIn>
          <FadeIn delay={0.1}>
            <PricingCard
              title="Annual Plan"
              priceId="price_1TbV2E0WWq11qMKidsCGCrl8"
              price="$6,997"
              period="year"
              perMonth="~$583/month"
              badge="Best Value — Save $497"
              featured
              features={SHARED_FEATURES}
            />
          </FadeIn>
        </div>

        <FadeIn delay={0.2}>
          <p className="text-center text-zinc-600 text-sm mt-8">
            Questions?{' '}
            <a href="mailto:pontifexindustries@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">
              pontifexindustries@gmail.com
            </a>
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function PatriotPageContent() {
  const searchParams = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);

  useEffect(() => {
    if (searchParams.get('upgrade') === 'true') setShowUpgradeBanner(true);
  }, [searchParams]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">

      {/* ── Upgrade banner ──────────────────────────────────────────────────── */}
      {showUpgradeBanner && (
        <div className="relative z-[60] flex items-center justify-between gap-3 px-5 py-3 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-sm font-medium">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            Your trial has ended. Choose a plan below to restore access.
          </div>
          <button
            onClick={() => setShowUpgradeBanner(false)}
            className="p-1 hover:bg-amber-500/20 rounded-lg transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Sticky nav ──────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
        style={{
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          backgroundColor: scrolled ? 'rgba(9,9,11,0.88)' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}
      >
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-700 to-red-900 border border-red-600/40 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-white font-black text-sm leading-none tracking-tight">PATRIOT</div>
              <div className="text-zinc-600 text-[10px] leading-none mt-0.5">Powered by Pontifex</div>
            </div>
          </div>

          <nav className="hidden sm:flex items-center gap-5 text-sm text-zinc-400">
            <button onClick={() => scrollTo('value-props')} className="hover:text-white transition-colors min-h-[44px] flex items-center">
              For You
            </button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-white transition-colors min-h-[44px] flex items-center">
              How It Works
            </button>
            <button onClick={() => scrollTo('your-dashboard')} className="hover:text-white transition-colors min-h-[44px] flex items-center">
              Dashboard
            </button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-white transition-colors min-h-[44px] flex items-center">
              Pricing
            </button>
          </nav>

          <a
            href="/company"
            className="min-h-[44px] px-4 flex items-center rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-bold transition-colors shadow-lg shadow-red-900/40"
          >
            Team Login
          </a>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ════════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-5 pt-20 pb-16 overflow-hidden">
        {/* Background */}
        <Orb color="radial-gradient(circle, #b91c1c, transparent)" size={600} top="-5%" left="55%" opacity={0.1} />
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="50%" left="-5%" opacity={0.09} />
        <Orb color="radial-gradient(circle, #991b1b, transparent)" size={400} top="75%" left="70%" opacity={0.07} />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(185,28,28,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(185,28,28,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-7">

          {/* Logo area */}
          <FadeIn delay={0}>
            <div className="space-y-2">
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-none">
                PATRIOT
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-500 text-xs font-medium">
                <Layers className="w-3 h-3 text-violet-500" />
                Powered by Pontifex Industries
              </div>
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={0.1}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-none tracking-tight">
              Your work.{' '}
              <span className="bg-gradient-to-r from-red-500 via-red-400 to-violet-400 bg-clip-text text-transparent">
                Your progress.
              </span>
              <br />
              Your platform.
            </h1>
          </FadeIn>

          {/* Subheadline */}
          <FadeIn delay={0.2}>
            <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto">
              Process your tickets faster. See your time. Track your growth. Patriot&apos;s crew uses this — and
              it&apos;s built to{' '}
              <span className="text-zinc-200 font-medium">make your day easier</span>, not just management&apos;s.
            </p>
          </FadeIn>

          {/* CTA block */}
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <a
                href="/company"
                className="group min-h-[52px] px-8 flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-bold text-lg transition-all shadow-xl shadow-red-900/40 w-full sm:w-auto justify-center"
              >
                Team Login
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <button
                onClick={() => scrollTo('value-props')}
                className="min-h-[52px] px-8 flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 font-semibold text-base transition-all w-full sm:w-auto justify-center"
              >
                See what&apos;s in it for you
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <p className="text-zinc-600 text-sm mt-4">
              First time? Ask your supervisor for access.
            </p>
          </FadeIn>

          {/* Three quick badges */}
          <FadeIn delay={0.4}>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {[
                { icon: Wifi, label: 'NFC Clock-In' },
                { icon: MapPin, label: 'GPS Verified' },
                { icon: Star, label: 'Skill Tracking' },
                { icon: Calendar, label: 'PTO On Your Phone' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 text-sm"
                >
                  <Icon className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-zinc-700 animate-bounce">
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — VALUE PROPS
      ════════════════════════════════════════════════════════════════════════ */}
      <section id="value-props" className="relative py-24 px-5 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="10%" left="60%" opacity={0.07} />

        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14 space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-700/15 border border-red-700/30 text-red-400 text-xs font-bold uppercase tracking-widest">
                <HardHat className="w-3.5 h-3.5" />
                Built for the people doing the work
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black">
                What this platform does{' '}
                <span className="bg-gradient-to-r from-red-500 to-violet-400 bg-clip-text text-transparent">
                  for you
                </span>
              </h2>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <ValueCard
              icon={FileText}
              title="Process your ticket from the job site"
              desc="No more paperwork at the end of the day. Log your work, take photos, get the customer signature — all from your phone, right when the job's done."
              delay={0}
            />
            <ValueCard
              icon={Clock}
              title="See your hours in real time"
              desc="Clock in with your NFC tag or GPS. Your timecard is always accurate and you can see it anytime. No more guessing if your hours were recorded right."
              delay={0.08}
            />
            <ValueCard
              icon={TrendingUp}
              title="Track your skills and growth"
              desc="The platform tracks your skill proficiency as you work different jobs. See where you're growing and what experience would move you up."
              delay={0.16}
            />
            <ValueCard
              icon={Calendar}
              title="Request time off in 30 seconds"
              desc="Submit a time-off request from your phone. See how many PTO days you have left. No more tracking down your supervisor or waiting to hear back."
              delay={0.24}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — HOW IT WORKS
      ════════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative py-24 px-5 overflow-hidden">
        {/* Red/violet gradient line at top */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-700/30 to-transparent" />

        <Orb color="radial-gradient(circle, #b91c1c, transparent)" size={500} top="20%" left="-5%" opacity={0.07} />

        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16 space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                3 Steps
              </div>
              <h2 className="text-3xl sm:text-4xl font-black">
                Simple. Every single day.
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Your whole day in the platform takes three steps. That&apos;s it.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-10 md:gap-6 relative">
            <FadeIn delay={0}>
              <Step
                number={1}
                icon={Wifi}
                title="Clock In"
                desc="Tap your NFC tag or open the app at the shop. Your shift starts, your time is logged — automatically."
              />
            </FadeIn>
            <FadeIn delay={0.12}>
              <Step
                number={2}
                icon={FileText}
                title="Work Your Jobs"
                desc="See your assigned jobs, get directions, log what was cut, take photos. Customer signs off right on your phone."
              />
            </FadeIn>
            <FadeIn delay={0.24} >
              <Step
                number={3}
                icon={CheckCircle}
                title="Clock Out & Done"
                desc="Clock out when you're back. Your timecard, your work log, your progress — all recorded automatically."
                isLast
              />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — YOUR PROGRESS DASHBOARD (static preview)
      ════════════════════════════════════════════════════════════════════════ */}
      <section id="your-dashboard" className="relative py-24 px-5 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-600/25 to-transparent" />
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={600} top="5%" left="55%" opacity={0.08} />

        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            {/* Left — copy */}
            <FadeIn direction="right">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-bold uppercase tracking-widest">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Your progress dashboard
                </div>
                <h2 className="text-3xl sm:text-4xl font-black leading-tight">
                  See your progress,{' '}
                  <span className="bg-gradient-to-r from-red-500 to-violet-400 bg-clip-text text-transparent">
                    not just your paycheck
                  </span>
                </h2>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  When you log in, you see YOUR numbers — your hours, your punctuality streak, your skill ratings, how
                  many jobs you&apos;ve knocked out this month. Not just what the boss sees. <span className="text-zinc-200">What you see.</span>
                </p>
                <ul className="space-y-3">
                  {[
                    'Your hours this week — regular and overtime',
                    'Your on-time record for the last 30 days',
                    'Your skill ratings by job type — wall saw, core drill, flat saw',
                    'Your PTO balance, always current',
                    'Your completed job count this month',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-zinc-300 text-sm">
                      <CheckCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            {/* Right — mock card */}
            <FadeIn direction="left" delay={0.12}>
              <OperatorProfileCard />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — FOUNDING PARTNER
      ════════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-20 px-5 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-700/20 to-transparent" />

        <div className="max-w-2xl mx-auto">
          <FadeIn>
            <div className="rounded-2xl border border-red-700/30 bg-gradient-to-br from-red-950/40 to-zinc-900/80 p-8 text-center space-y-4">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-700/20 border border-red-600/30 text-red-400 text-xs font-bold uppercase tracking-wider">
                <Star className="w-3.5 h-3.5" />
                Founding Partner
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white">
                Patriot helped build this.
              </h2>

              <p className="text-zinc-400 leading-relaxed">
                Patriot is a Pontifex Founding Partner — which means your team helps shape what we build next. When
                you have ideas for what would make your job easier, submit them through the platform.{' '}
                <span className="text-zinc-200 font-medium">We read every one.</span>
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 6 — PRICING
      ════════════════════════════════════════════════════════════════════════ */}
      <PricingSection />

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 7 — BOTTOM CTA
      ════════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-28 px-5 overflow-hidden">
        <Orb color="radial-gradient(circle, #b91c1c, transparent)" size={700} top="-20%" left="30%" opacity={0.1} />
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="60%" left="65%" opacity={0.08} />

        {/* Grid texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(185,28,28,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(185,28,28,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-xl mx-auto text-center space-y-8">
          <FadeIn>
            <div className="rounded-3xl border border-zinc-700/60 bg-zinc-800/60 backdrop-blur-sm p-10 space-y-6 shadow-2xl">
              <h2 className="text-3xl sm:text-4xl font-black">Ready to get started?</h2>
              <p className="text-zinc-400 leading-relaxed">
                Your login uses your work email and the password your admin set up for you. Enter your company code on
                the next screen — it&apos;s <span className="text-zinc-200 font-bold font-mono">PATRIOT</span>.
              </p>

              <a
                href="/company"
                className="group min-h-[52px] w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-bold text-lg transition-all shadow-xl shadow-red-900/40"
              >
                Team Login
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>

              <div className="pt-2 border-t border-zinc-700/50 space-y-1">
                <p className="text-zinc-500 text-sm">Having trouble?</p>
                <p className="text-zinc-500 text-sm">
                  Contact your supervisor or email{' '}
                  <a
                    href="mailto:pontifexindustries@gmail.com"
                    className="text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    pontifexindustries@gmail.com
                  </a>
                </p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-zinc-800/60 py-8 px-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-zinc-600 text-sm text-center sm:text-left">
            © 2026 Patriot · Powered by Pontifex Industries
          </p>
          <a
            href="https://www.pontifexindustries.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 hover:text-violet-400 text-sm transition-colors"
          >
            pontifexindustries.com
          </a>
        </div>
      </footer>
    </div>
  );
}

export default function PatriotPage() {
  // App Store 3.1.1: no in-app pricing/checkout in the native shell.
  if (isNativeApp()) return <NativeWebOnlyNotice />;
  return (
    <Suspense>
      <PatriotPageContent />
    </Suspense>
  );
}
