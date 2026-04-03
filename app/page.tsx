'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView, useAnimation, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Calendar,
  Users,
  FileText,
  Camera,
  PenLine,
  Download,
  MapPin,
  CreditCard,
  Bell,
  Wifi,
  Shield,
  CheckCircle,
  XCircle,
  ArrowRight,
  Phone,
  Mail,
  ChevronDown,
  Zap,
  Brain,
  Smartphone,
  Star,
  TrendingUp,
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
} from 'lucide-react';

// ─── Personalization ─────────────────────────────────────────────────────────
const COMPANY_NAME = "[Doug's Company]";
const DEVELOPER_NAME = 'Andres';
const DEVELOPER_EMAIL = 'andres.altamirano1280@gmail.com';
const DEVELOPER_PHONE = '';
// ─────────────────────────────────────────────────────────────────────────────

// Animation helpers
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
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const dirMap = {
    up: { y: 32 },
    down: { y: -32 },
    left: { x: 32 },
    right: { x: -32 },
    none: {},
  };
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...dirMap[direction] }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Animated background orb
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

// Stat badge
function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
      <span className="text-3xl font-black bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
        {value}
      </span>
      <span className="text-zinc-400 text-sm text-center leading-tight">{label}</span>
    </div>
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

// Section label
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest bg-violet-500/15 border border-violet-500/30 text-violet-400 mb-4">
      {children}
    </span>
  );
}

// Divider
function GradientDivider() {
  return (
    <div className="w-full h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent my-2" />
  );
}

// ─── Schedule Board Mockup ────────────────────────────────────────────────────
const MOCK_OPERATORS = [
  { name: 'Mike R.', skill: 'Wall Saw', score: 96, jobs: 2, color: 'bg-violet-500' },
  { name: 'Jake T.', skill: 'Core Drill', score: 88, jobs: 3, color: 'bg-indigo-500' },
  { name: 'Luis P.', skill: 'Wire Saw', score: 91, jobs: 1, color: 'bg-purple-500' },
  { name: 'Chris M.', skill: 'Flat Saw', score: 79, jobs: 2, color: 'bg-blue-500' },
];
const MOCK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function ScheduleMockup() {
  const [activeCell, setActiveCell] = useState<string | null>(null);

  const cellData: Record<string, string> = {
    '0-0': 'Downtown Hotel',
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-xs text-zinc-500 font-medium">Schedule Board — Week of Apr 7</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-zinc-500">Live</span>
        </div>
      </div>
      {/* Grid */}
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
      {/* Footer stat */}
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
        {/* Bar chart */}
        <div className="flex items-end gap-2 h-24">
          {days.map((d, i) => (
            <div key={d} className="flex-1 flex flex-col items-center gap-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(hours[i] / maxH) * 80}px` }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: 'easeOut' }}
                className="w-full rounded-t-md bg-gradient-to-t from-violet-600 to-indigo-500"
              />
              <span className="text-zinc-500 text-xs">{d}</span>
            </div>
          ))}
        </div>
        <GradientDivider />
        {/* Summary rows */}
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
    { icon: MapPin, label: 'Today\'s Job', value: 'Downtown Hotel — Core Drill', done: true },
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
      {/* Phone status bar */}
      <div className="bg-black flex items-center justify-between px-4 py-1.5">
        <span className="text-white text-xs font-semibold">9:41</span>
        <div className="flex items-center gap-1">
          <Wifi className="w-3 h-3 text-white" />
          <div className="text-white text-xs">●●●</div>
        </div>
      </div>
      {/* App header */}
      <div className="bg-violet-600 px-3 py-3">
        <div className="text-white text-xs font-medium opacity-75">Good morning,</div>
        <div className="text-white font-bold text-sm">Mike Ramirez</div>
        <div className="text-violet-200 text-xs mt-0.5 flex items-center gap-1">
          <HardHat className="w-3 h-3" /> Operator
        </div>
      </div>
      {/* Steps */}
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
              <div className={`text-xs font-medium leading-none ${s.done ? 'text-white' : 'text-zinc-400'}`}>
                {s.label}
              </div>
              <div className={`text-xs mt-0.5 ${s.done ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Bottom CTA */}
      <div className="px-3 pb-4">
        <div className="bg-violet-600 rounded-xl py-2 text-center text-white text-xs font-semibold">
          Complete Job
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DougSalesPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const builtFeatures = [
    { icon: Calendar, label: 'Schedule Board' },
    { icon: Clock, label: 'Timecard System' },
    { icon: FileText, label: 'Dispatch Tickets' },
    { icon: Camera, label: 'Photo Capture' },
    { icon: PenLine, label: 'Customer Signatures' },
    { icon: Download, label: 'PDF Invoicing' },
    { icon: BarChart3, label: 'QuickBooks Export' },
    { icon: Users, label: 'Operator Profiles' },
    { icon: MapPin, label: 'GPS Tracking' },
    { icon: Building, label: 'Facility Badging' },
    { icon: Wifi, label: 'NFC Clock-In' },
    { icon: Bell, label: 'Notifications' },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={false}
        animate={scrolled ? { backdropFilter: 'blur(16px)', backgroundColor: 'rgba(9,9,11,0.85)' } : {}}
        className="fixed top-0 inset-x-0 z-50 transition-all duration-300 border-b border-transparent"
        style={{ borderColor: scrolled ? 'rgba(255,255,255,0.06)' : 'transparent' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">Pontifex Platform</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
            <button onClick={() => scrollTo('comparison')} className="hover:text-white transition-colors">
              Overview
            </button>
            <button onClick={() => scrollTo('scheduling')} className="hover:text-white transition-colors">
              Scheduling
            </button>
            <button onClick={() => scrollTo('payroll')} className="hover:text-white transition-colors">
              Payroll
            </button>
            <button onClick={() => scrollTo('built')} className="hover:text-white transition-colors">
              Features
            </button>
          </nav>
          <button
            onClick={() => scrollTo('contact')}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            Let's Talk
          </button>
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
              <Star className="w-3.5 h-3.5 text-violet-400" />
              Built Exclusively For You
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none">
              Built for{' '}
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                {COMPANY_NAME}.
              </span>
            </h1>
          </FadeIn>

          {/* Subheading */}
          <FadeIn delay={0.2}>
            <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-2xl mx-auto">
              A fully custom operations platform designed around{' '}
              <span className="text-white font-medium">how your business actually runs</span> — not a
              template, not a SaaS product anyone can sign up for. This is yours.
            </p>
          </FadeIn>

          {/* Personal note */}
          <FadeIn delay={0.3}>
            <div className="inline-block px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/10 text-left max-w-xl mx-auto">
              <p className="text-zinc-300 text-base leading-relaxed italic">
                "Doug — I've spent over a year building this specifically with concrete cutting operations in mind.
                Every feature, every screen, every workflow was designed around what field crews actually deal with.
                I'd love to show you what it can do for your team."
              </p>
              <p className="text-violet-400 text-sm mt-3 font-semibold not-italic">— {DEVELOPER_NAME}</p>
            </div>
          </FadeIn>

          {/* CTAs */}
          <FadeIn delay={0.4}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => scrollTo('contact')}
                className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-lg transition-all shadow-lg shadow-violet-900/40"
              >
                Let's Talk
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => scrollTo('comparison')}
                className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-lg transition-all"
              >
                See How It Works
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </FadeIn>

          {/* Stats row */}
          <FadeIn delay={0.5}>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <StatBadge value="1 Year" label="In active development" />
              <StatBadge value="12+" label="Features already live" />
              <StatBadge value="~67%" label="Payroll time reduction" />
              <StatBadge value="∞" label="Customization" />
            </div>
          </FadeIn>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-zinc-600"
        >
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </section>

      {/* ── BEFORE vs. AFTER ────────────────────────────────────────────────── */}
      <section id="comparison" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="20%" left="45%" opacity={0.07} />

        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16 space-y-3">
              <SectionLabel>The Difference</SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black">Before. And After.</h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                What running a concrete cutting company looks like without this platform — and what it looks like
                with it.
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
                    icon: Clock,
                    title: 'Manual timecard entry',
                    desc: 'Someone spends 1/3 of their workweek collecting, inputting, and correcting timecard data. Every hour tracked by hand.',
                  },
                  {
                    icon: Calendar,
                    title: 'Scheduling by guesswork',
                    desc: "Who's available? Who's certified? Who's best for this job? You piece it together from memory and spreadsheets.",
                  },
                  {
                    icon: Phone,
                    title: 'Operators calling for updates',
                    desc: "Field crews don't know where to go, what changed, or what paperwork they need. Constant back-and-forth.",
                  },
                  {
                    icon: AlertTriangle,
                    title: 'Admin buried in paperwork',
                    desc: 'Dispatch tickets, permits, signatures, invoices — all done manually after the fact. Easy to miss, hard to track.',
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
                  <h3 className="text-xl font-bold text-violet-400">After</h3>
                </div>
                {[
                  {
                    icon: Timer,
                    title: '2-3 hours per week to confirm payroll',
                    desc: "Time is captured automatically. You review a clean summary, confirm it, and you're done. Every week.",
                  },
                  {
                    icon: Brain,
                    title: 'Smart scheduling that learns your crew',
                    desc: "The system knows who's best for each job type, tracks certifications, and gets smarter the more you use it.",
                  },
                  {
                    icon: Smartphone,
                    title: 'Operators always know what to do',
                    desc: 'Open the app: today\'s job, directions, what to log. Clock in, do the work, mark it done. No calls needed.',
                  },
                  {
                    icon: Zap,
                    title: 'Admin has real-time visibility',
                    desc: 'Dispatch tickets, signatures, photos, and invoices — all captured in the field, instantly visible in your dashboard.',
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

      {/* ── PAYROLL & TIME ──────────────────────────────────────────────────── */}
      <section id="payroll" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={600} top="10%" left="-5%" opacity={0.08} />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <FadeIn direction="right">
            <div className="space-y-6">
              <SectionLabel>
                <Timer className="w-3 h-3" /> Payroll &amp; Time
              </SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black leading-tight">
                What used to take{' '}
                <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  days
                </span>{' '}
                now takes hours.
              </h2>
              <p className="text-zinc-400 text-lg leading-relaxed">
                Manually tracking timecard data for a crew used to consume a third of an admin's week — collecting
                paper time sheets, entering them, catching errors, calculating overtime. Every week, like clockwork.
              </p>
              <p className="text-zinc-300 text-lg leading-relaxed">
                With this platform, every operator clocks in and out automatically — via NFC tap, GPS check-in, or
                app. Hours are categorized, overtime calculated, breaks deducted per your rules. At the end of the
                week, you sit down for{' '}
                <span className="text-white font-semibold">2–3 hours to review and confirm</span>. That's it.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-2">
                {[
                  { icon: Wifi, label: 'NFC tap clock-in' },
                  { icon: MapPin, label: 'GPS-verified location' },
                  { icon: TrendingUp, label: 'Overtime auto-calculated' },
                  { icon: DollarSign, label: 'Payroll-ready export' },
                ].map((f) => (
                  <FeaturePill key={f.label} icon={f.icon} label={f.label} />
                ))}
              </div>

              {/* Time saved callout */}
              <div className="rounded-2xl bg-gradient-to-r from-violet-600/15 to-indigo-600/15 border border-violet-500/25 p-5">
                <div className="text-zinc-300 text-sm mb-2 font-medium">Time saved per week, per company</div>
                <div className="flex items-end gap-4">
                  <div>
                    <div className="text-5xl font-black text-white">~20</div>
                    <div className="text-violet-400 text-sm font-medium">hours saved</div>
                  </div>
                  <div className="text-zinc-600 text-2xl font-light pb-1">→</div>
                  <div className="text-zinc-400 text-sm leading-relaxed">
                    That's half a full-time employee's week, every week, for the rest of your business life.
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          <FadeIn direction="left" delay={0.15}>
            <TimecardMockup />
          </FadeIn>
        </div>
      </section>

      {/* ── SMART SCHEDULING ────────────────────────────────────────────────── */}
      <section id="scheduling" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #9333ea, transparent)" size={650} top="0%" left="60%" opacity={0.09} />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <FadeIn direction="right" delay={0.1} className="order-2 lg:order-1">
            <ScheduleMockup />
          </FadeIn>

          <FadeIn direction="left" className="order-1 lg:order-2">
            <div className="space-y-6">
              <SectionLabel>
                <Brain className="w-3 h-3" /> Smart Scheduling
              </SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black leading-tight">
                A schedule board that{' '}
                <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  learns.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg leading-relaxed">
                Every time you assign an operator to a job, the system learns. Who's your best wall saw guy? Who
                handles core drilling on hospital sites? Which crew can handle three jobs in a day vs. two? It builds
                that intelligence automatically.
              </p>
              <p className="text-zinc-300 text-lg leading-relaxed">
                Over time, it starts ranking operators by performance and skill match, warning you when someone isn't
                certified for a facility, and optimizing crew capacity so you're never over- or under-booked.{' '}
                <span className="text-white font-semibold">The more you use it, the smarter it gets.</span>
              </p>
              <div className="grid grid-cols-2 gap-4 pt-2">
                {[
                  { icon: Star, label: 'Operator skill ranking' },
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
      </section>

      {/* ── FIELD TEAM ──────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={500} top="20%" left="40%" opacity={0.07} />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <FadeIn direction="right">
            <div className="space-y-6">
              <SectionLabel>
                <HardHat className="w-3 h-3" /> Built for Field Teams
              </SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black leading-tight">
                Simple enough for guys{' '}
                <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  who aren't staring at screens all day.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg leading-relaxed">
                Your operators and apprentices aren't office workers. They shouldn't need a training manual to use
                their job software. The operator interface was designed with exactly that in mind.
              </p>
              <p className="text-zinc-300 text-lg leading-relaxed">
                They open the app. They see today's job and where to go. They tap to clock in. They log what they
                did. They tap to complete. That's the whole flow. No confusion, no support calls, no excuses.
              </p>
              <div className="space-y-3">
                {[
                  'Today\'s job details and directions — front and center',
                  'One-tap NFC clock-in at the job site',
                  'Simple work logging — what was cut, where, how long',
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

          <FadeIn direction="left" delay={0.15}>
            <div className="flex justify-center">
              <OperatorMockup />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── YOUR PLATFORM, YOUR RULES ────────────────────────────────────────── */}
      <section className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={700} top="0%" left="30%" opacity={0.08} />

        <div className="max-w-4xl mx-auto text-center space-y-10">
          <FadeIn>
            <SectionLabel>
              <Wrench className="w-3 h-3" /> Your Platform, Your Rules
            </SectionLabel>
            <h2 className="text-4xl md:text-5xl font-black mt-3">
              You own this.{' '}
              <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                I built it for you.
              </span>
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="text-zinc-400 text-xl leading-relaxed max-w-2xl mx-auto">
              This isn't a feature request to a product team. There's no support ticket queue. If something doesn't
              work the way you want it — we change it. I'm the developer. You call me directly.
            </p>
          </FadeIn>

          {/* Three pillars */}
          <div className="grid md:grid-cols-3 gap-6 pt-4">
            {[
              {
                icon: Star,
                title: '1 Year Built',
                desc: 'Over a year of development, building every feature from the ground up for concrete cutting operations. Not adapted — built.',
                stat: '1+ Year',
              },
              {
                icon: MessageSquare,
                title: 'Direct Line',
                desc: 'You talk to the developer. Not a support team, not a chatbot. One person who knows the platform inside and out.',
                stat: 'Direct Access',
              },
              {
                icon: Wrench,
                title: 'Unlimited Changes',
                desc: "If a workflow doesn't match how your crew works — we rebuild it. This platform evolves with your business, forever.",
                stat: 'Unlimited',
              },
            ].map((p) => (
              <FadeIn key={p.title} delay={0.1}>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 space-y-4 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mx-auto">
                    <p.icon className="w-6 h-6 text-violet-400" />
                  </div>
                  <div className="text-2xl font-black text-white">{p.stat}</div>
                  <h3 className="font-bold text-white">{p.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">{p.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Personal quote block */}
          <FadeIn delay={0.2}>
            <div className="rounded-2xl bg-gradient-to-br from-violet-600/10 to-indigo-600/10 border border-violet-500/20 p-8 text-left max-w-2xl mx-auto">
              <div className="text-zinc-300 text-lg leading-relaxed italic">
                "I didn't build this to sell it to a thousand companies. I built it because I know the industry and I
                know what's missing. Doug, if you use this platform, I'll be your developer. We grow it together."
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center font-bold text-white">
                  {DEVELOPER_NAME[0]}
                </div>
                <div>
                  <div className="text-white font-semibold">{DEVELOPER_NAME}</div>
                  <div className="text-zinc-500 text-sm">Developer &amp; Platform Architect</div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── WHAT'S ALREADY BUILT ─────────────────────────────────────────────── */}
      <section id="built" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #9333ea, transparent)" size={500} top="30%" left="80%" opacity={0.08} />

        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16 space-y-3">
              <SectionLabel>
                <CheckCircle className="w-3 h-3" /> Already Built
              </SectionLabel>
              <h2 className="text-4xl md:text-5xl font-black">
                Everything you need is{' '}
                <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  ready on day one.
                </span>
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                No waiting for features to be built. No beta software. This is a production-ready platform, live and
                tested.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {builtFeatures.map((f, i) => (
              <FadeIn key={f.label} delay={i * 0.04}>
                <div className="group rounded-2xl bg-white/[0.03] border border-white/8 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all p-5 flex flex-col items-center gap-3 cursor-default">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/15 group-hover:bg-violet-500/20 transition-colors flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-violet-400" />
                  </div>
                  <span className="text-sm font-medium text-zinc-300 text-center">{f.label}</span>
                  <div className="w-2 h-2 rounded-full bg-green-400 opacity-70" />
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT / CTA ────────────────────────────────────────────────────── */}
      <section id="contact" className="relative py-28 px-6 overflow-hidden">
        <Orb color="radial-gradient(circle, #7c3aed, transparent)" size={700} top="-20%" left="30%" opacity={0.12} />
        <Orb color="radial-gradient(circle, #4f46e5, transparent)" size={500} top="60%" left="60%" opacity={0.09} />

        {/* Grid texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-10">
          <FadeIn>
            <SectionLabel>
              <Phone className="w-3 h-3" /> Let's Talk
            </SectionLabel>
            <h2 className="text-4xl md:text-5xl font-black mt-3">
              Ready to see it{' '}
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                in action?
              </span>
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="text-zinc-400 text-xl leading-relaxed">
              Doug — I'd love to walk you through a live demo. No pitch deck, no sales slides. Just a real look at
              the platform and how it fits your operation. Low-pressure, 30 minutes, your call.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="grid sm:grid-cols-2 gap-6">
              {/* Request demo */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 space-y-4 hover:border-violet-500/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mx-auto">
                  <Calendar className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="font-bold text-white text-lg">Request a Demo</h3>
                <p className="text-zinc-500 text-sm">
                  Fill out a quick form and we'll set up a time that works for you.
                </p>
                <a
                  href="/request-demo"
                  className="block w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm text-center transition-all"
                >
                  Request Demo →
                </a>
              </div>

              {/* Direct contact */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 space-y-4 hover:border-violet-500/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mx-auto">
                  <Mail className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="font-bold text-white text-lg">Reach Out Directly</h3>
                <p className="text-zinc-500 text-sm">
                  Email or call {DEVELOPER_NAME} directly. No assistant, no intake form.
                </p>
                <a
                  href={`mailto:${DEVELOPER_EMAIL}`}
                  className="block w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-semibold text-sm text-center transition-all truncate"
                >
                  {DEVELOPER_EMAIL}
                </a>
                {DEVELOPER_PHONE && (
                  <a
                    href={`tel:${DEVELOPER_PHONE}`}
                    className="block w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-semibold text-sm text-center transition-all"
                  >
                    {DEVELOPER_PHONE}
                  </a>
                )}
              </div>
            </div>
          </FadeIn>

          {/* Final personal note */}
          <FadeIn delay={0.3}>
            <p className="text-zinc-600 text-sm leading-relaxed">
              No contract pressure. No per-seat pricing lecture. Just a real conversation about whether this makes
              sense for {COMPANY_NAME}. Either way, I hope the demo is worth your 30 minutes.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-zinc-500 text-sm">Pontifex Platform</span>
          </div>
          <p className="text-zinc-700 text-xs text-center">
            Built specifically for {COMPANY_NAME} by {DEVELOPER_NAME}. Not a template. Not a SaaS product. Yours.
          </p>
          <a href={`mailto:${DEVELOPER_EMAIL}`} className="text-zinc-600 hover:text-violet-400 text-xs transition-colors">
            {DEVELOPER_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}
