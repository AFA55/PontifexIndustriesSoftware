'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';

interface CTASectionProps {
  variant?: 'default' | 'dark' | 'light';
  title?: string;
  subtitle?: string;
  showBadge?: boolean;
}

export default function CTASection({
  variant = 'default',
  title = "Ready to Transform Your Business?",
  subtitle = "Join contractors who are already tracking profitability in real-time",
  showBadge = false,
}: CTASectionProps) {
  const bgClasses = {
    default: 'bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900',
    dark: 'bg-gray-900',
    light: 'bg-gradient-to-br from-slate-50 via-white to-blue-50',
  };

  const textClasses = {
    default: 'text-white',
    dark: 'text-white',
    light: 'text-gray-900',
  };

  const subtitleClasses = {
    default: 'text-gray-300',
    dark: 'text-gray-400',
    light: 'text-gray-600',
  };

  return (
    <section className={`relative py-20 overflow-hidden ${bgClasses[variant]}`}>
      {/* Background Decorations for dark variants */}
      {(variant === 'default' || variant === 'dark') && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl"></div>
        </div>
      )}

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        {showBadge && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 backdrop-blur-sm rounded-full border border-blue-400/30 mb-6"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className={`${variant === 'light' ? 'text-blue-700' : 'text-blue-100'} text-sm font-semibold`}>
              Limited World of Concrete Offer
            </span>
          </motion.div>
        )}

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className={`text-3xl sm:text-4xl lg:text-5xl font-bold ${textClasses[variant]} mb-6`}
        >
          {title}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className={`text-lg sm:text-xl ${subtitleClasses[variant]} mb-10 max-w-2xl mx-auto`}
        >
          {subtitle}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
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
            className={`group px-8 py-4 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-2 ${
              variant === 'light'
                ? 'bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 shadow-lg hover:shadow-xl'
                : 'bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border-2 border-white/40 hover:border-white/60'
            }`}
          >
            <Play size={20} />
            Try Demo Now
          </Link>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className={`mt-8 text-sm ${subtitleClasses[variant]}`}
        >
          <p>No credit card required • Setup in 5 minutes • Cancel anytime</p>
        </motion.div>
      </div>
    </section>
  );
}
