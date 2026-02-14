'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle } from 'lucide-react';
import { BRAND } from './brand-config';

const oldWayItems = [
  'Lost signatures and incomplete paperwork',
  'Guessing profitability days after the job',
  'Coordinating crews by phone and text',
  'Scrambling for OSHA documentation during audits',
  'No visibility into field operations',
];

const pontifexWayItems = [
  'Digital signatures captured on-site instantly',
  'Real-time profit tracking before leaving the job',
  'Automated scheduling and dispatch notifications',
  'OSHA documentation generated automatically',
  'Live GPS tracking and crew visibility',
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4 },
  },
};

export default function ProblemSolution() {
  return (
    <section className="relative py-24 bg-[#09090b] overflow-hidden">
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 grid-pattern opacity-[0.03] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Sound Familiar?
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            There&apos;s a better way to run your business
          </p>
        </motion.div>

        {/* Two-Column Comparison */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Card -- The Old Way */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-red-500/5 border border-red-500/20 rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="text-red-400" size={22} />
              </div>
              <h3 className="text-xl font-bold text-white">The Old Way</h3>
            </div>

            <motion.ul
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="space-y-5"
            >
              {oldWayItems.map((item, index) => (
                <motion.li
                  key={index}
                  variants={itemVariants}
                  className="flex items-start gap-3"
                >
                  <XCircle className="text-red-400/80 flex-shrink-0 mt-0.5" size={18} />
                  <span className="text-zinc-400 leading-relaxed">{item}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          {/* Right Card -- The Pontifex Way */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="text-emerald-400" size={22} />
              </div>
              <h3 className="text-xl font-bold text-white">The {BRAND.shortName} Way</h3>
            </div>

            <motion.ul
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="space-y-5"
            >
              {pontifexWayItems.map((item, index) => (
                <motion.li
                  key={index}
                  variants={itemVariants}
                  className="flex items-start gap-3"
                >
                  <CheckCircle className="text-emerald-400/80 flex-shrink-0 mt-0.5" size={18} />
                  <span className="text-zinc-300 leading-relaxed">{item}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
