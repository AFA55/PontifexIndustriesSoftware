'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Clock, Star } from 'lucide-react';
import { BRAND } from './brand-config';

const statCards = [
  {
    icon: TrendingUp,
    value: '$30K+',
    label: 'Annual Savings',
    color: 'text-green-400',
    iconBg: 'from-green-500/20 to-emerald-500/20',
    borderGlow: 'hover:border-green-500/30',
  },
  {
    icon: Clock,
    value: '780hrs',
    label: 'Time Saved Per Year',
    color: 'text-blue-400',
    iconBg: 'from-blue-500/20 to-cyan-500/20',
    borderGlow: 'hover:border-blue-500/30',
  },
  {
    icon: Star,
    value: '100%',
    label: 'Digital Documentation',
    color: 'text-yellow-400',
    iconBg: 'from-yellow-500/20 to-amber-500/20',
    borderGlow: 'hover:border-yellow-500/30',
  },
];

const savingsBreakdown = [
  { label: 'Paperwork reduction', value: '$500' },
  { label: 'Scheduling efficiency', value: '$400' },
  { label: 'Faster invoicing', value: '$250' },
  { label: 'Reduced disputes', value: '$800' },
  { label: 'Better allocation', value: '$300' },
  { label: 'Improved cash flow', value: '$250' },
];

const totalMonthlySavings = '$2,500';

export default function ROISection() {
  return (
    <section
      id="roi"
      className="py-24 bg-gradient-to-b from-[#09090b] via-blue-950/20 to-[#09090b] relative overflow-hidden"
    >
      {/* Subtle background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-cyan-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Your ROI in{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Real Numbers
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto">
            See what your{' '}
            <span className="text-blue-200">{BRAND.industry}</span> business
            could save every month
          </p>
        </motion.div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                whileHover={{ y: -4 }}
                className={`bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 text-center transition-colors duration-300 ${stat.borderGlow}`}
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.iconBg} flex items-center justify-center mx-auto mb-4`}
                >
                  <Icon className={stat.color} size={28} />
                </div>
                <div
                  className={`text-4xl sm:text-5xl font-bold ${stat.color} mb-2`}
                >
                  {stat.value}
                </div>
                <div className="text-blue-200 text-sm font-medium uppercase tracking-wider">
                  {stat.label}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Savings Breakdown Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-2xl mx-auto"
        >
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {/* Table Header */}
            <div className="px-8 py-5 border-b border-white/10">
              <h3 className="text-xl font-semibold text-white">
                Monthly Savings Breakdown
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Average savings for a mid-size {BRAND.industry} business
              </p>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-white/10">
              {savingsBreakdown.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  className="flex items-center justify-between px-8 py-4 hover:bg-white/5 transition-colors"
                >
                  <span className="text-blue-200">{item.label}</span>
                  <span className="text-green-400 font-bold text-lg">
                    {item.value}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Total Row */}
            <div className="px-8 py-6 bg-white/5 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-lg">
                  Total Monthly Savings
                </span>
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.5 }}
                  className="text-green-400 font-bold text-3xl sm:text-4xl"
                >
                  {totalMonthlySavings}/mo
                </motion.span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
