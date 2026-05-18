'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Calendar,
  Users,
  FileText,
  Camera,
  PenLine,
  Download,
  MapPin,
  Bell,
  Wifi,
  Shield,
  CheckCircle,
  XCircle,
  ArrowRight,
  ChevronDown,
  Zap,
  Brain,
  Smartphone,
  Star,
  BarChart3,
  Wrench,
  HardHat,
  AlertTriangle,
  ClipboardList,
  Timer,
  DollarSign,
  Layers,
  Building,
  MessageSquare,
  Lock,
  Key,
  Mic,
  Truck,
  Vote,
  Award,
} from 'lucide-react';

// ─── Animation helpers ───────────────────────────────────────────────────────
function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
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

  const dirMap: Record<string, string> = {
    up: 'translateY(32px)',
    down: 'translateY(-32px)',
    left: 'translateX(32px)',
    right: 'translateX(-32px)',
    none: 'translateY(0)',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate(0,0)' : dirMap[direction],
        transition: `opacity 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// Background orb
function Orb({
  color,
  size,
  top,
  left,
  blur = 120,
  opacity = 0.15,
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

// Section label pill
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest bg-violet-500/15 border border-violet-500/30 text-violet-400 mb-4">
      {children}
    </span>
  );
}

// Gradient divider
function GradientDivider() {
  return (
    <div className="w-full h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent my-2" />
  );
}

// Feature pill
function FeaturePill({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300">
      <Icon className="w-4 h-4 text-violet-400 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

// ─── Schedule Board Mockup ────────────────────────────────────────────────────
const MOCK_OPERATORS = [
  { name: 'Mike R.', skill: 'Demolition', score: 96, color: 'bg-violet-500' },
  { name: 'Jake T.', skill: 'Excavation', score: 88, color: 'bg-indigo-500' },
  { name: 'Luis P.', skill: 'Foundation', score: 91, color: 'bg-purple-500' },
  { name: 'Chris M.', skill: 'Utility', score: 79, color: 'bg-blue-500' },
];
const MOCK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function ScheduleMockup() {
  const [activeCell, setActiveCell] = useState<string | null>(null);

  const cellData: Record<string, string> = {
    '0-0': 'Site A Demo',
    '0-1': 'Airport Ext.',
    '1-0': 'City Hall',
    '1-1': 'Mall Reno',
    '1-2': 'Bridge Deck',
    '2-0': 'Parking Struct.',
    '2-3': 'Hospital',
    '3-1': 'Office Tower',
    '3-3': 'Warehouse',
    '3-4': 'Civic Ctr.',
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-sm overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-xs text-zinc-500 font-medium">Schedule Board — Week View</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-zinc-500">Live</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left p-3 text-zinc-500 font-medium w-28">Operator</th>
              {MOCK_DAYS.map((d) => (
                <th key={d} className="text-center p-3 text-zinc-400 font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_OPERATORS.map((op, ri) => (
              <tr key={op.name} className="border-b border-white/5 last:border-0">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full ${op.color} flex items-center justify-center text-white font-bold text-xs shrink-0`}
                    >
                      {op.name[0]}
                    </div>
                    <div>
                      <div className="text-white font-medium leading-none">{op.name}</div>
                      <div className="text-zinc-500 mt-0.5">{op.skill}</div>
                    </div>
                  </div>
                </td>
                {MOCK_DAYS.map((_, ci) => {
                  const key = `${ri}-${ci}`;
                  const job = cellData[key];
                  return (
                    <td key={ci} className="p-1.5">
                      {job ? (
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          onHoverStart={() => setActiveCell(key)}
                          onHoverEnd={() => setActiveCell(null)}
                          className={`rounded-lg px-2 py-1.5 text-center cursor-pointer transition-colors ${
                            activeCell === key
                              ? 'bg-violet-500 text-white'
                              : 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                          }`}
                        >
                          {job}
                        </motion.div>
                      ) : (
                        <div className="rounded-lg px-2 py-1.5 border border-dashed border-white/5 text-center text-zinc-700">
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/40 border-t border-white/5">
        <span className="text-zinc-500 text-xs">4 operators · 10 jobs this week</span>
        <span className="text-violet-400 text-xs font-medium flex items-center gap-1">
          <Brain className="w-3 h-3" /> Skill-matched automatically
        </span>
      </div>
    </div>
  );
}

// ─── Timecard Mockup ──────────────────────────────────────────────────────────
function TimecardMockup() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = [8.5, 9.0, 8.0, 10.5, 8.25, 4.0];
  const maxH = Math.max(...hours);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-sm overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-white/5 bg-zinc-900/60 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Weekly Timecard Summary</span>
        <span className="text-xs px-2 py-1 rounded-md bg-green-500/15 text-green-400 border border-green-500/20">
          Auto-captured
        </span>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-end gap-2 h-24">
          {days.map((d, i) => (
            <div key={d} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-violet-600 to-indigo-500 transition-all duration-500"
                style={{ height: `${(hours[i] / maxH) * 80}px`, transitionDelay: `${i * 80}ms` }}
              />
              <span className="text-zinc-500 text-xs">{d}</span>
            </div>
          ))}
        </div>
        <GradientDivider />
        <div className="space-y-2">
          {[
            { label: 'Regular Hours', value: '40.0 hrs', color: 'text-white' },
            { label: 'Overtime', value: '8.25 hrs', color: 'text-yellow-400' },
            { label: 'Break Deductions', value: '2.5 hrs', color: 'text-zinc-400' },
            { label: 'Payroll Ready', value: 'Yes', color: 'text-green-400' },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{r.label}</span>
              <span className={`font-semibold ${r.color}`}>{r.value}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-3 py-2 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <span className="text-green-300 text-xs">Ready for payroll — review &amp; confirm in under 3 hours</span>
        </div>
      </div>
    </div>
  );
}

// ─── Operator App Mockup ──────────────────────────────────────────────────────
function OperatorMockup() {
  const steps = [
    { icon: MapPin, label: "Today's Job", value: 'Site A — Foundation Work', done: true },
    { icon: Clock, label: 'Clocked In', value: '7:02 AM via NFC', done: true },
    { icon: ClipboardList, label: 'Log Work', value: '3 items logged', done: true },
    { icon: Camera, label: 'Photos', value: '4 uploaded', done: false },
    { icon: CheckCircle, label: 'Complete Job', value: 'Tap when done', done: false },
  ];

  return (
    <div
      className="mx-auto rounded-3xl border-4 border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
      style={{ width: 220 }}
    >
      <div className="bg-black flex items-center justify-between px-4 py-1.5">
        <span className="text-white text-xs font-semibold">9:41</span>
        <div className="flex items-center gap-1">
          <Wifi className="w-3 h-3 text-white" />
          <div className="text-white text-xs">●●●</div>
        </div>
      </div>
      <div className="bg-violet-600 px-3 py-3">
        <div className="text-white text-xs font-medium opacity-75">Good morning,</div>
        <div className="text-white font-bold text-sm">Mike Ramirez</div>
        <div className="text-violet-200 text-xs mt-0.5 flex items-center gap-1">
          <HardHat className="w-3 h-3" /> Field Operator
        </div>
      </div>
      <div className="px-3 py-3 space-y-2">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 p-2 rounded-lg ${
              s.done ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/5 border border-white/5'
            }`}
          >
            <s.icon
              className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.done ? 'text-green-400' : 'text-zinc-500'}`}
            />
            <div>
              <div
                className={`text-xs font-medium leading-none ${s.done ? 'text-white' : 'text-zinc-400'}`}
              >
                {s.label}
              </div>
              <div className={`text-xs mt-0.5 ${s.done ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-4">
        <div className="bg-violet-600 rounded-xl py-2 text-center text-white text-xs font-semibold">
          Complete Job
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const featurePills = [
    { icon: Calendar, label: 'Schedule Board' },
    { icon: MapPin, label: 'GPS Clock-In' },
    { icon: Wifi, label: 'NFC Tap-In' },
    { icon: Mic, label: 'Voice Equipment Checkout' },
    { icon: FileText, label: 'Job Dispatch Tickets' },
    { icon: PenLine, label: 'Customer Signatures' },
    { icon: Download, label: 'PDF Invoice Generation' },
    { icon: Star, label: 'Skill Tracking' },
    { icon: Timer, label: 'Time-Off Management' },
    { icon: Users, label: 'Multi-Role Access' },
    { icon: Bell, label: 'Real-Time Notifications' },
    { icon: BarChart3, label: 'QuickBooks CSV Export' },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={false}
        animate={
          scrolled
            ? { backdropFilter: 'blur(16px)', backgroundColor: 'rgba(9,9,11,0.88)' }
            : {}
        }
        className="fixed top-0 inset-x-0 z-50 transition-all duration-300 border-b border-transparent"
        style={{ borderColor: scrolled ? 'rgba(255,255,255,0.06)' : 'transparent' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">Pontifex Industries</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-white transition-colors">
              How It Works
            </button>
            <button onClick={() => scrollTo('platform')} className="hover:text-white transition-colors">
              Platform
            </button>
            <a href="/pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
            <button onClick={() => scrollTo('community')} className="hover:text-white transition-colors">
              Community
            </button>
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <a
              href="/company-login"
              className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm font-semibold transition-all"
            >
              Log In
            </a>
            <a
              href="/request-demo"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-900/30"
            >
              Request Demo
            </a>
          </div>
        </div>
      </motion.header>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden">
        {/* Background orbs */}
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={700} top="-10%" left="60%" opacity={0.12} />
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={600} top="40%" left="-10%" opacity={0.1} />
        <Orb color="radial-gradient(circle, #9333ea, transparent)" size={500} top="70%" left="70%" opacity={0.08} />

        {/* Grid texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <FadeIn delay={0}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium">
              <HardHat className="w-3.5 h-3.5 text-violet-400" />
              Operations Software for Niche Construction
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={0.1}>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-none">
              Built by someone who{' '}
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                showed up to the job site.
              </span>
              <br className="hidden sm:block" />
              <span className="text-white"> Built for everyone who still does.</span>
            </h1>
          </FadeIn>

          {/* Subheadline */}
          <FadeIn delay={0.2}>
            <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mx-auto">
              Pontifex gives niche construction service companies the same operational systems that large firms have —
              without the{' '}
              <span className="text-white font-medium">enterprise price tag or the IT department.</span>
            </p>
          </FadeIn>

          {/* CTAs */}
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => scrollTo('platform')}
                className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-lg transition-all shadow-lg shadow-violet-900/40"
              >
                See How It Works
                <ChevronDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
              </button>
              <a
                href="/request-demo"
                className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-lg transition-all"
              >
                Request Demo
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </FadeIn>

          {/* Stat strip */}
          <FadeIn delay={0.4}>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {[
                'Built for field crews',
                '8 user roles out of the box',
                'GPS · NFC · Voice — all included',
              ].map((s) => (
                <div
                  key={s}
                  className="px-4 py-2 rounded-xl bg-zinc-800/60 border border-white/8 text-zinc-400 text-sm"
                >
                  {s}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-zinc-600 animate-bounce">
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── THE STORY ───────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={600} top="10%" left="70%" opacity={0.09} />
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={500} top="60%" left="-5%" opacity={0.08} />

        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <SectionLabel>The Origin Story</SectionLabel>
            </div>
          </FadeIn>

          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Founder photo */}
            <FadeIn direction="right">
              <div className="flex justify-center lg:justify-end">
                <div className="relative">
                  {/* Glow ring */}
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/30 to-indigo-500/20 blur-xl scale-105" />
                  <div className="relative rounded-3xl overflow-hidden border-2 border-violet-500/30 shadow-2xl shadow-violet-900/40"
                    style={{ transform: 'rotate(-1.5deg)', maxWidth: 380 }}>
                    {/* TODO: Replace with real founder photo */}
                    <img
                      src="/founder-photo.jpg"
                      alt="Alex — Founder of Pontifex Industries"
                      className="w-full object-cover"
                      style={{ aspectRatio: '4/5', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)' }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                    {/* Fallback placeholder shown if image is missing */}
                    <div
                      className="w-full items-center justify-center flex-col gap-4 bg-gradient-to-br from-violet-900/60 to-indigo-900/60"
                      style={{ display: 'none', aspectRatio: '4/5', minHeight: 320 }}
                    >
                      <div className="w-24 h-24 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                        <HardHat className="w-12 h-12 text-violet-400" />
                      </div>
                      <p className="text-zinc-400 text-sm text-center px-6">Founder photo coming soon</p>
                    </div>
                  </div>
                  {/* Caption badge */}
                  <div className="absolute -bottom-4 -right-4 px-4 py-2 rounded-xl bg-zinc-900 border border-violet-500/30 text-xs text-violet-300 font-medium shadow-xl">
                    From the job site up
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Right: Story copy */}
            <FadeIn direction="left" delay={0.1}>
              <div className="space-y-6">
                <h2 className="text-3xl md:text-4xl font-black leading-tight">
                  "I started at the bottom. I watched what separated the companies that scaled from the ones that{' '}
                  <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                    ground themselves down.
                  </span>"
                </h2>

                <div className="space-y-4 text-zinc-400 text-lg leading-relaxed">
                  <p>
                    "I spent years in the trades — showing up early, learning the work from the ground level, and
                    watching how different companies operated. The ones that grew weren't always the ones with the
                    best crews. They were the ones that had{' '}
                    <span className="text-zinc-200">systems.</span>"
                  </p>
                  <p>
                    "Small business owners in construction work harder than anyone I've met. But they're buried —
                    scheduling by memory, chasing timecards on Friday, rebuilding the same spreadsheet every week.
                    The difference between them and a company three times their size was never talent. It was{' '}
                    <span className="text-zinc-200">capital. Capital bought people. People built systems.</span>"
                  </p>
                  <p>
                    "AI changed that math. What used to take a software team and an operations department, you can
                    now build for a fraction of the cost — custom, specific to your trade, wired into how you
                    actually work. It's not about having a degree. It's about{' '}
                    <span className="text-zinc-200">how bad you want to learn.</span> Pontifex is what I built when
                    I stopped waiting for someone else to build it."
                  </p>
                </div>

                {/* Pull quote */}
                <div className="pt-4 border-l-2 border-violet-500/50 pl-5">
                  <p className="text-2xl font-black bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent leading-tight">
                    "Stop running your business. Start growing it."
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── BEFORE vs. AFTER ────────────────────────────────────────────────── */}
      <section className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="20%" left="45%" opacity={0.07} />

        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16 space-y-3">
              <SectionLabel>The Difference</SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black">Before. And After.</h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                What running a niche construction service company looks like without this platform — and what it
                looks like with it.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-0 rounded-3xl overflow-hidden border border-white/10">
            {/* BEFORE */}
            <FadeIn direction="right">
              <div className="bg-zinc-900/60 p-8 md:p-10 space-y-6 h-full border-r border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-red-400">Before</h3>
                </div>
                {[
                  {
                    icon: MessageSquare,
                    title: 'Scheduling by text message and memory',
                    desc: 'Who is available? Who is certified? You piece it together from phone calls, group chats, and gut feeling.',
                  },
                  {
                    icon: Clock,
                    title: 'Timecards collected Friday afternoon — if you can find them',
                    desc: 'Paper timesheets, missed entries, manual overtime calculations. Every week a scramble.',
                  },
                  {
                    icon: AlertTriangle,
                    title: 'Field crew calls for job updates constantly',
                    desc: "Operators don't know where to be or what changed. Back-and-forth phone calls all day.",
                  },
                  {
                    icon: FileText,
                    title: 'Admin buried in paperwork instead of billing',
                    desc: 'Dispatch tickets, permits, signatures, invoices — all done after the fact, by hand. Easy to miss.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.icon className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-200 mb-0.5">{item.title}</div>
                      <div className="text-zinc-500 text-sm leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            {/* AFTER */}
            <FadeIn direction="left">
              <div className="bg-violet-950/30 p-8 md:p-10 space-y-6 h-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-violet-400" />
                  </div>
                  <h3 className="text-xl font-bold text-violet-400">With Pontifex</h3>
                </div>
                {[
                  {
                    icon: Calendar,
                    title: 'Real-time schedule board — every operator, every job, every day',
                    desc: 'Drag-and-drop assignments, skill matching, availability at a glance. No guessing.',
                  },
                  {
                    icon: Wifi,
                    title: 'GPS and NFC clock-in — hours calculated automatically',
                    desc: 'Operators tap in at the site. Overtime calculated. Breaks deducted. Payroll ready Friday.',
                  },
                  {
                    icon: Smartphone,
                    title: 'Operators see their jobs, routes, and instructions in the app',
                    desc: 'Open the app: job address, what to bring, what to log. No calls needed.',
                  },
                  {
                    icon: Zap,
                    title: 'Tickets auto-generated, invoices one click, payroll export ready',
                    desc: 'Everything captured in the field, instantly visible in your dashboard. Nothing falls through the cracks.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.icon className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-200 mb-0.5">{item.title}</div>
                      <div className="text-zinc-400 text-sm leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── PLATFORM FEATURES ───────────────────────────────────────────────── */}
      <section id="platform" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #9333ea, transparent)" size={600} top="0%" left="60%" opacity={0.09} />
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={500} top="50%" left="-5%" opacity={0.08} />

        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16 space-y-3">
              <SectionLabel>
                <Zap className="w-3 h-3" /> What&apos;s Inside
              </SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black">
                One platform.{' '}
                <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  Every tool your operation needs.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Not a bundle of third-party integrations. Everything here is built and maintained as one cohesive
                system.
              </p>
            </div>
          </FadeIn>

          {/* Four pillar cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {[
              {
                icon: Calendar,
                title: 'Scheduling & Dispatch',
                desc: 'Stop scheduling by memory. Real-time board, skill matching, operator availability at a glance. Assign jobs in seconds, not hours.',
                mockupSlot: 'schedule',
              },
              {
                icon: Clock,
                title: 'Timecards & Payroll',
                desc: 'GPS, NFC, or voice clock-in. Automatic overtime. Configurable break deductions. Payroll-ready export every Friday.',
                mockupSlot: 'timecard',
              },
              {
                icon: Smartphone,
                title: 'Operator Field App',
                desc: 'Your crew knows exactly where to be and what to do. Job checklist, photos, customer signature — all from their phone.',
                mockupSlot: 'operator',
              },
              {
                icon: Wrench,
                title: 'Equipment & Fleet',
                desc: 'Know where every piece of equipment is at all times. Voice checkout. Maintenance tracking. Service reminders. Automatic.',
                mockupSlot: 'equipment',
              },
            ].map((card, i) => (
              <FadeIn key={card.title} delay={i * 0.08}>
                <div className="group rounded-2xl bg-white/[0.03] border border-white/10 p-8 space-y-4 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all h-full">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/20 group-hover:bg-violet-500/25 transition-colors flex items-center justify-center">
                    <card.icon className="w-6 h-6 text-violet-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{card.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{card.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Mockups */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
            <FadeIn direction="right">
              <ScheduleMockup />
            </FadeIn>
            <FadeIn direction="left" delay={0.1}>
              <div className="space-y-4">
                <SectionLabel>
                  <Brain className="w-3 h-3" /> Smart Scheduling
                </SectionLabel>
                <h3 className="text-3xl font-black leading-tight">
                  A schedule board that{' '}
                  <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                    learns your crew.
                  </span>
                </h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Every time you assign an operator to a job, the system learns. Skill levels, availability,
                  certifications — tracked automatically, surfaced when it matters.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Star, label: 'Skill matching' },
                    { icon: Shield, label: 'Cert & badge checks' },
                    { icon: Users, label: 'Crew capacity tracking' },
                    { icon: Calendar, label: 'Real-time updates' },
                  ].map((f) => (
                    <FeaturePill key={f.label} icon={f.icon} label={f.label} />
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
            <FadeIn direction="right" className="order-2 lg:order-1 flex justify-center">
              <OperatorMockup />
            </FadeIn>
            <FadeIn direction="left" delay={0.1} className="order-1 lg:order-2">
              <div className="space-y-4">
                <SectionLabel>
                  <HardHat className="w-3 h-3" /> Field App
                </SectionLabel>
                <h3 className="text-3xl font-black leading-tight">
                  Simple enough for crew members{' '}
                  <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                    who aren&apos;t staring at screens all day.
                  </span>
                </h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Open the app. See today's job. Tap to clock in. Log work. Upload photos. Capture signature. Mark
                  done. That's the entire workflow — no training manual required.
                </p>
                <div className="space-y-2">
                  {[
                    "Today's job details and directions — front and center",
                    'One-tap NFC clock-in at the job site',
                    'Simple work logging — what was done, where, how long',
                    'Photo upload directly from the job site',
                    'Customer signature capture before leaving',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 text-zinc-300">
                      <CheckCircle className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <FadeIn direction="right">
              <div className="space-y-4">
                <SectionLabel>
                  <Timer className="w-3 h-3" /> Timecards & Payroll
                </SectionLabel>
                <h3 className="text-3xl font-black leading-tight">
                  What used to take{' '}
                  <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                    days
                  </span>{' '}
                  now takes hours.
                </h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Every operator clocks in and out automatically — GPS, NFC tap, or app. Hours categorized,
                  overtime calculated, breaks deducted per your rules. Review and confirm in under 3 hours.
                </p>
                <div className="rounded-2xl bg-gradient-to-r from-violet-600/15 to-indigo-600/15 border border-violet-500/25 p-5">
                  <div className="text-zinc-300 text-sm mb-2 font-medium">Time saved per week, per company</div>
                  <div className="flex items-end gap-4">
                    <div>
                      <div className="text-5xl font-black text-white">~20</div>
                      <div className="text-violet-400 text-sm font-medium">hours saved</div>
                    </div>
                    <div className="text-zinc-600 text-2xl font-light pb-1">→</div>
                    <div className="text-zinc-400 text-sm leading-relaxed">
                      That&apos;s half a full-time employee&apos;s week, every week, for the rest of your business
                      life.
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
            <FadeIn direction="left" delay={0.1}>
              <TimecardMockup />
            </FadeIn>
          </div>

          {/* Feature pill grid */}
          <FadeIn delay={0.1}>
            <div className="mt-20 pt-16 border-t border-white/5">
              <p className="text-center text-zinc-500 text-sm mb-8 uppercase tracking-widest font-medium">
                Everything included
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {featurePills.map((f, i) => (
                  <FadeIn key={f.label} delay={i * 0.03}>
                    <FeaturePill icon={f.icon} label={f.label} />
                  </FadeIn>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOUNDING PARTNER PROGRAM ─────────────────────────────────────────── */}
      <section id="community" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={600} top="10%" left="30%" opacity={0.1} />
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={400} top="60%" left="70%" opacity={0.08} />

        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16 space-y-4">
              <SectionLabel>Community</SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black">
                We&apos;re not just selling software.{' '}
                <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  We&apos;re building something
                </span>{' '}
                with the companies that use it.
              </h2>
              <p className="text-zinc-400 text-xl leading-relaxed max-w-2xl mx-auto">
                The first companies to join Pontifex aren&apos;t customers — they&apos;re Founding Partners. That
                means direct access to the roadmap, your feedback shapes what we build next, and locked-in pricing
                that never changes as we grow.
              </p>
            </div>
          </FadeIn>

          {/* Three founding partner benefits */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              {
                icon: Lock,
                emoji: '🔒',
                title: 'Locked Pricing',
                desc: 'Founding Partner rate never increases. As we add features and raise prices for new clients, yours stays the same. Forever.',
              },
              {
                icon: Vote,
                emoji: '🗳️',
                title: 'Roadmap Vote',
                desc: "Each quarter, Founding Partners vote on what we build next. You're not filling out a feedback form — you're setting the direction.",
              },
              {
                icon: Award,
                emoji: '🏅',
                title: 'Operator Spotlight',
                desc: 'Top performers across the platform get recognized quarterly. Your best operators get visibility that helps them grow their career.',
              },
            ].map((card, i) => (
              <FadeIn key={card.title} delay={i * 0.1}>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-7 space-y-4 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all h-full text-center">
                  <div className="text-4xl mb-2">{card.emoji}</div>
                  <h3 className="text-xl font-bold text-white">{card.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{card.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.2}>
            <div className="text-center">
              <a
                href="/request-demo"
                className="group inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xl transition-all shadow-2xl shadow-violet-900/50"
              >
                Become a Founding Partner
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </a>
              <p className="text-zinc-600 text-sm mt-4">Limited spots available · No contract required</p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── SECURITY ─────────────────────────────────────────────────────────── */}
      <section id="security" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #0ea5e9, transparent)" size={700} top="-10%" left="-10%" opacity={0.08} />
        <Orb color="radial-gradient(circle, #6366f1, transparent)" size={500} top="60%" left="70%" opacity={0.07} />

        <div className="relative z-10 max-w-6xl mx-auto">
          <FadeIn>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/10 border border-sky-500/20 mb-6">
              <Shield className="w-4 h-4 text-sky-400" />
              <span className="text-sky-300 text-sm font-medium tracking-wide">Enterprise-Grade Security</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              Your Data Is{' '}
              <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
                Protected
              </span>
            </h2>
            <p className="text-zinc-400 text-xl leading-relaxed max-w-2xl">
              Your employees, your jobs, your financials — locked down with the same security standards used by
              enterprise software, applied to a system built specifically for field service companies.
            </p>
          </FadeIn>

          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Lock,
                title: 'Isolated Data Environment',
                desc: "Your data exists in a completely isolated tenant — no data is shared across companies. Your crew info, job history, and financials are yours alone.",
                color: 'sky',
              },
              {
                icon: Shield,
                title: 'Row-Level Security',
                desc: 'Every database query is secured at the row level. Even if a request bypassed authentication, it could only ever access data that belongs to your account.',
                color: 'indigo',
              },
              {
                icon: Key,
                title: 'Role-Based Access Control',
                desc: "Every user role has a precise set of permissions. Operators can't see financials. Admins can't override audit logs. Access is minimal by design.",
                color: 'violet',
              },
              {
                icon: Lock,
                title: 'Encrypted in Transit & At Rest',
                desc: 'All data is encrypted in transit via HTTPS/TLS and encrypted at rest in the database. Credentials are never stored in plaintext — ever.',
                color: 'cyan',
              },
              {
                icon: Shield,
                title: 'No Unauthorized API Access',
                desc: 'Every API route requires authentication. Server-side admin operations use a service role key that never touches the client browser.',
                color: 'blue',
              },
              {
                icon: CheckCircle,
                title: 'Audit Logging',
                desc: 'Key actions — job updates, status changes, approvals — are logged with timestamps and user IDs. If something changes, we know who did it and when.',
                color: 'emerald',
              },
            ].map((item, i) => {
              const Icon = item.icon;
              const colorMap: Record<string, string> = {
                sky: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
                indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
                violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
                cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
                blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
                emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
              };
              const cls = colorMap[item.color] || colorMap.sky;
              return (
                <FadeIn key={i} delay={i * 0.08}>
                  <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-6 space-y-4 hover:border-white/[0.12] transition-all h-full">
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${cls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-white font-bold text-lg">{item.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>

          <FadeIn delay={0.3}>
            <div className="mt-14 rounded-2xl bg-gradient-to-r from-sky-600/10 via-indigo-600/10 to-violet-600/10 border border-sky-500/20 p-8 flex flex-col sm:flex-row items-center gap-6 text-left">
              <div className="w-16 h-16 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center shrink-0">
                <Shield className="w-8 h-8 text-sky-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xl mb-2">Built To Be Auditable</h3>
                <p className="text-zinc-400 leading-relaxed">
                  The platform is built on Supabase — a SOC 2 Type II certified infrastructure provider — with
                  PostgreSQL row-level security, JWT-based authentication, and zero client-side secrets. Every
                  security control can be reviewed and verified. If your operations team or an auditor wants to
                  inspect the security model, we can walk through it together.
                </p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={700} top="-20%" left="30%" opacity={0.12} />
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={500} top="60%" left="60%" opacity={0.09} />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-8">
          <FadeIn>
            <h2 className="text-4xl md:text-5xl font-black">
              The systems that used to require{' '}
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                capital
              </span>{' '}
              are now within reach.
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="text-zinc-400 text-xl leading-relaxed">
              Built for niche construction service companies that are done doing everything manually.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="flex flex-col items-center gap-4">
              <a
                href="/request-demo"
                className="group flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xl transition-all shadow-2xl shadow-violet-900/50"
              >
                Request a Demo
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </a>
              <p className="text-zinc-600 text-sm max-w-md leading-relaxed">
                We work with niche construction service companies specifically. Not a generic tool. Not enterprise
                software repurposed for the trades.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo + name */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">Pontifex Industries</span>
          </div>

          {/* Nav links */}
          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500">
            <button
              onClick={() => scrollTo('how-it-works')}
              className="hover:text-zinc-300 transition-colors"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollTo('platform')}
              className="hover:text-zinc-300 transition-colors"
            >
              Platform
            </button>
            <a href="/pricing" className="hover:text-zinc-300 transition-colors">
              Pricing
            </a>
            <button
              onClick={() => scrollTo('community')}
              className="hover:text-zinc-300 transition-colors"
            >
              Community
            </button>
            <a href="/request-demo" className="hover:text-zinc-300 transition-colors">
              Request Demo
            </a>
          </nav>

          {/* Contact + copyright */}
          <div className="flex flex-col items-center md:items-end gap-1">
            <a
              href="mailto:pontifexindustries@gmail.com"
              className="text-zinc-500 hover:text-violet-400 text-xs transition-colors"
            >
              pontifexindustries@gmail.com
            </a>
            <p className="text-zinc-700 text-xs">© 2026 Pontifex Industries. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
