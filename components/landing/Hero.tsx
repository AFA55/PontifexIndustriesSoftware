'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Play, CheckCircle } from 'lucide-react';

export default function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden pt-16">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Copy */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 backdrop-blur-sm rounded-full border border-blue-400/30 mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-blue-100 text-sm font-semibold">
                Live at World of Concrete 2026
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6"
            >
              Run Your Concrete Cutting Business{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-red-400 bg-clip-text text-transparent">
                Like a Fortune 500 Company
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed"
            >
              From dispatch to signature—track jobs, profitability, and OSHA compliance in real-time.
              Know what you made before you leave the job site.
            </motion.p>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex flex-wrap items-center gap-4 mb-10 justify-center lg:justify-start"
            >
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle className="text-green-400" size={18} />
                <span>Setup in 5 minutes</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle className="text-green-400" size={18} />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle className="text-green-400" size={18} />
                <span>Mobile ready</span>
              </div>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              {/* Primary CTA - Request Demo */}
              <Link
                href="/request-access"
                className="group px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white font-bold shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-2"
              >
                Request Live Demo
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </Link>

              {/* Secondary CTA - Try Demo */}
              <Link
                href="/login"
                className="group px-8 py-4 rounded-xl bg-white/10 backdrop-blur-md hover:bg-white/20 text-white font-bold border-2 border-white/40 hover:border-white/60 transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <Play size={20} />
                Try Demo Now
              </Link>
            </motion.div>

            {/* Sub-CTA Text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="text-gray-400 text-sm mt-4 text-center lg:text-left"
            >
              Join contractors already tracking 500+ jobs monthly
            </motion.p>
          </div>

          {/* Right Column - Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="relative hidden lg:block"
          >
            {/* Dashboard Preview Mockup */}
            <div className="relative">
              {/* Floating Cards Animation */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [-10, 10, -10] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-10 -right-10 w-64 h-40 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 shadow-2xl"
              >
                <div className="text-white/80 text-sm font-semibold mb-2">Today's Revenue</div>
                <div className="text-white text-3xl font-bold">$12,450</div>
                <div className="text-green-400 text-sm mt-2">+18% from yesterday</div>
              </motion.div>

              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [10, -10, 10] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-10 -left-10 w-64 h-40 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 shadow-2xl"
              >
                <div className="text-white/80 text-sm font-semibold mb-2">Active Jobs</div>
                <div className="text-white text-3xl font-bold">7</div>
                <div className="text-blue-400 text-sm mt-2">3 crews working</div>
              </motion.div>

              {/* Central Element */}
              <div className="relative z-10 bg-white/10 backdrop-blur-2xl rounded-3xl border-2 border-white/30 p-8 shadow-2xl">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                      PI
                    </div>
                    <div>
                      <div className="text-white font-bold">Pontifex Industries</div>
                      <div className="text-gray-400 text-sm">Concrete Management</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300 text-sm">Job Completion</span>
                        <span className="text-green-400 font-bold">94%</span>
                      </div>
                      <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full" style={{ width: '94%' }}></div>
                      </div>
                    </div>

                    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300 text-sm">OSHA Compliance</span>
                        <span className="text-blue-400 font-bold">100%</span>
                      </div>
                      <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-1 h-2 bg-white/60 rounded-full"
          ></motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
