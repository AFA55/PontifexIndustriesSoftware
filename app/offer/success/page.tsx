'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  Calendar,
  MessageSquare,
  Smartphone,
  Users,
  ArrowRight,
  Shield,
  Zap,
} from 'lucide-react';

const nextSteps = [
  {
    icon: MessageSquare,
    title: 'Andres reaches out within 24 hours',
    description: 'You\'ll get a direct text or call from Andres to schedule your onboarding session. Save his number — he\'s your personal developer for everything.',
  },
  {
    icon: Calendar,
    title: 'Schedule your 1-hour setup call',
    description: 'We\'ll configure your company, add your operators, and walk through every feature. Most setups are live same day.',
  },
  {
    icon: Users,
    title: 'Operators get access',
    description: 'Your team gets a simple mobile link — no app to install. Clock in, log work, clock out. 30-minute walkthrough included.',
  },
  {
    icon: Smartphone,
    title: 'Go live on your first job',
    description: 'Real jobs, real operators, real data from day one. You\'ll see the schedule board, dispatch, payroll — everything running live.',
  },
  {
    icon: Zap,
    title: 'Unlimited change requests',
    description: 'Anything that doesn\'t fit your workflow — text Andres. Changes are typically live within 24–48 hours.',
  },
];

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center">
        {/* Success badge */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-violet-500/20 border border-violet-500/40 mb-8"
        >
          <CheckCircle className="w-12 h-12 text-violet-400" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl md:text-5xl font-black text-white mb-4"
        >
          Payment confirmed. Let&apos;s build something great.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl text-zinc-400 mb-12 leading-relaxed"
        >
          Your 30-day trial is officially started. Andres will reach out within 24 hours to get Patriot Concrete Cutting fully set up and live.
        </motion.p>

        {/* Guarantee reminder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="inline-flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl px-6 py-4 mb-16"
        >
          <Shield className="w-5 h-5 text-violet-400 flex-shrink-0" />
          <span className="text-violet-300 font-semibold">
            100% money-back guarantee — if it doesn&apos;t work after 30 days, every dollar comes back.
          </span>
        </motion.div>

        {/* Next steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-left"
        >
          <h2 className="text-2xl font-bold text-white mb-8 text-center">What happens next</h2>

          <div className="space-y-4">
            {nextSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex gap-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
                        Step {index + 1}
                      </span>
                    </div>
                    <p className="font-semibold text-white mb-1">{step.title}</p>
                    <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Contact info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="mt-12 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center"
        >
          <p className="text-zinc-400 mb-4">
            Questions before Andres reaches out? Email directly:
          </p>
          <a
            href="mailto:andres.altamirano1280@gmail.com"
            className="text-violet-400 font-semibold text-lg hover:text-violet-300 transition-colors inline-flex items-center gap-2"
          >
            andres.altamirano1280@gmail.com
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>

        {sessionId && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="mt-6 text-xs text-zinc-600"
          >
            Confirmation ID: {sessionId}
          </motion.p>
        )}
      </div>
    </div>
  );
}

export default function OfferSuccessPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white">Pontifex Industries</span>
        </div>
      </div>

      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
