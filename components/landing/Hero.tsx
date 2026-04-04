'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Shield, Zap, Building2 } from 'lucide-react';
import { BRAND } from './brand-config';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-[#09090b] overflow-hidden pt-16">
      {/* Animated Blur Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 15, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-blue-500/15 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, -25, 20, 0],
            y: [0, 20, -25, 0],
            scale: [1, 0.95, 1.1, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -left-32 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, 15, -15, 0],
            y: [0, -15, 20, 0],
            scale: [1, 1.05, 0.98, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[120px]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 grid-pattern opacity-[0.03] pointer-events-none" />

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Text */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-2 bg-emerald-500/10 backdrop-blur-sm rounded-full border border-emerald-500/20 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-emerald-300 text-sm font-medium tracking-wide">
                Live & Fully Functional
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-[1.1] mb-6 tracking-tight"
            >
              The Complete{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
                Concrete Cutting
              </span>{' '}
              Platform
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-lg sm:text-xl text-zinc-400 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              Schedule jobs, dispatch crews, track work in real-time, capture signatures, generate invoices
              — all in one white-label platform built specifically for concrete cutting operations.
            </motion.p>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-10 justify-center lg:justify-start"
            >
              {[
                { icon: Building2, text: 'Multi-tenant white-label' },
                { icon: Shield, text: 'Enterprise security' },
                { icon: Zap, text: '15+ live modules' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-zinc-300 text-sm">
                  <item.icon className="text-blue-400 flex-shrink-0" size={16} />
                  <span>{item.text}</span>
                </div>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <a
                href={BRAND.ctaPrimaryHref}
                className="group relative px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-[1.03] flex items-center justify-center gap-2"
              >
                {BRAND.ctaPrimary}
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
              </a>

              <a
                href="/request-demo"
                className="group px-8 py-4 rounded-xl bg-white/10 backdrop-blur-md hover:bg-white/[0.15] text-white font-semibold border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.03] flex items-center justify-center gap-2"
              >
                Request a Demo
                <ChevronDown size={18} />
              </a>
            </motion.div>

            {/* Sub-CTA Text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65, duration: 0.6 }}
              className="text-zinc-500 text-sm mt-5 text-center lg:text-left"
            >
              First client: Patriot Concrete Cutting (code: PATRIOT)
            </motion.p>
          </div>

          {/* Right Column - Platform Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="relative hidden lg:block"
          >
            <div className="relative min-h-[480px]">
              {/* Top-Right Floating Card -- Module Count */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [-8, 12, -8] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-4 -right-4 w-72 bg-white/[0.06] backdrop-blur-2xl rounded-2xl border border-white/10 p-6 shadow-2xl shadow-black/20"
              >
                <div className="text-zinc-400 text-sm font-medium mb-2">Platform Modules</div>
                <div className="text-white text-4xl font-bold tracking-tight">15+</div>
                <div className="text-blue-400 text-sm mt-2 font-medium">Fully functional today</div>
                <div className="text-zinc-500 text-xs mt-1">Schedule, Dispatch, Track, Invoice & more</div>
              </motion.div>

              {/* Bottom-Left Floating Card -- Workflow */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [12, -8, 12] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -bottom-4 -left-4 w-72 bg-white/[0.06] backdrop-blur-2xl rounded-2xl border border-white/10 p-6 shadow-2xl shadow-black/20"
              >
                <div className="text-zinc-400 text-sm font-medium mb-3">Operator Workflow</div>
                <div className="space-y-2">
                  {['My Jobs', 'En Route (GPS)', 'Work Performed', 'Customer Signature', 'Job Complete'].map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        i < 4 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {i + 1}
                      </div>
                      <span className="text-zinc-300 text-xs">{step}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Central Card -- Platform Overview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.7 }}
                className="relative z-10 mx-6 bg-white/[0.06] backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-2xl shadow-black/20"
              >
                <div className="space-y-6">
                  {/* Brand Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
                      P
                    </div>
                    <div>
                      <div className="text-white font-bold">{BRAND.companyName}</div>
                      <div className="text-zinc-500 text-sm">White-Label SaaS</div>
                    </div>
                  </div>

                  {/* Feature Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Schedule Board', color: 'from-purple-500/20 to-indigo-500/20 border-purple-500/20' },
                      { label: 'Timecards', color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/20' },
                      { label: 'Billing', color: 'from-green-500/20 to-emerald-500/20 border-green-500/20' },
                      { label: 'CRM', color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/20' },
                    ].map((feat) => (
                      <div key={feat.label} className={`bg-gradient-to-br ${feat.color} border rounded-xl p-3 text-center`}>
                        <div className="text-white text-xs font-semibold">{feat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Status */}
                  <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-zinc-300 text-sm font-medium">Platform Readiness</span>
                      <span className="text-emerald-400 font-bold text-sm">Production</span>
                    </div>
                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '92%' }}
                        transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-blue-400 to-emerald-500 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-2"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-1 h-2 bg-white/50 rounded-full"
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
