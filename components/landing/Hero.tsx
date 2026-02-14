'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, ChevronDown } from 'lucide-react';
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
              className="inline-flex items-center gap-2.5 px-4 py-2 bg-blue-500/10 backdrop-blur-sm rounded-full border border-blue-500/20 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-blue-300 text-sm font-medium tracking-wide">
                Custom Software & Automation for Construction
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-[1.1] mb-6 tracking-tight"
            >
              Software That Works{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
                The Way You Do
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-lg sm:text-xl text-zinc-400 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              We build personalized software and automation solutions for construction companies.
              Track jobs, know your profit in real-time, and eliminate paperwork — customized to fit exactly how your business operates.
            </motion.p>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-10 justify-center lg:justify-start"
            >
              {[
                'Fully customizable',
                'Built for the field',
                'Any trade, any workflow',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-zinc-300 text-sm">
                  <CheckCircle className="text-green-400 flex-shrink-0" size={16} />
                  <span>{item}</span>
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
                href={BRAND.ctaSecondaryHref}
                className="group px-8 py-4 rounded-xl bg-white/10 backdrop-blur-md hover:bg-white/[0.15] text-white font-semibold border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.03] flex items-center justify-center gap-2"
              >
                <ChevronDown size={18} />
                {BRAND.ctaSecondary}
              </a>
            </motion.div>

            {/* Sub-CTA Text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65, duration: 0.6 }}
              className="text-zinc-500 text-sm mt-5 text-center lg:text-left"
            >
              Personalized software &amp; automation for construction companies
            </motion.p>
          </div>

          {/* Right Column - Floating Cards Visual (hidden on mobile) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="relative hidden lg:block"
          >
            <div className="relative min-h-[480px]">
              {/* Top-Right Floating Card -- Time Saved */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [-8, 12, -8] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-4 -right-4 w-72 bg-white/[0.06] backdrop-blur-2xl rounded-2xl border border-white/10 p-6 shadow-2xl shadow-black/20"
              >
                <div className="text-zinc-400 text-sm font-medium mb-2">Time Saved This Week</div>
                <div className="text-white text-4xl font-bold tracking-tight">18.5 hrs</div>
                <div className="text-green-400 text-sm mt-2 font-medium">No paperwork, no guessing</div>
                <div className="text-zinc-500 text-xs mt-1">= $925 in labor costs saved</div>
              </motion.div>

              {/* Bottom-Left Floating Card -- Real-Time Profit */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [12, -8, 12] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -bottom-4 -left-4 w-72 bg-white/[0.06] backdrop-blur-2xl rounded-2xl border border-white/10 p-6 shadow-2xl shadow-black/20"
              >
                <div className="text-zinc-400 text-sm font-medium mb-2">Real-Time Job Profit</div>
                <div className="text-white text-4xl font-bold tracking-tight">$2,340</div>
                <div className="text-blue-400 text-sm mt-2 font-medium">Known before leaving site</div>
                <div className="text-zinc-500 text-xs mt-1">42% profit margin - Job #2847</div>
              </motion.div>

              {/* Central Card -- Branding + Progress */}
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
                      {BRAND.logoInitials}
                    </div>
                    <div>
                      <div className="text-white font-bold">{BRAND.companyName}</div>
                      <div className="text-zinc-500 text-sm">Construction Software</div>
                    </div>
                  </div>

                  {/* Progress Bars */}
                  <div className="space-y-4">
                    <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-zinc-300 text-sm font-medium">Digital Data Collection</span>
                        <span className="text-green-400 font-bold text-sm">100%</span>
                      </div>
                      <div className="text-xs text-zinc-500 mb-2">Every job creates company value</div>
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
                          className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                        />
                      </div>
                    </div>

                    <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-zinc-300 text-sm font-medium">OSHA Compliance</span>
                        <span className="text-blue-400 font-bold text-sm">100%</span>
                      </div>
                      <div className="text-xs text-zinc-500 mb-2">Zero paperwork, full compliance</div>
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ delay: 1.0, duration: 1.2, ease: 'easeOut' }}
                          className="h-full bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full"
                        />
                      </div>
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
