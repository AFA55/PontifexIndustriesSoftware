'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, DollarSign, Database, TrendingUp } from 'lucide-react';

const stats = [
  {
    icon: Clock,
    value: '15+ hrs',
    label: 'Saved Weekly',
    sublabel: 'Per crew on paperwork',
    gradient: 'from-blue-400 to-cyan-400',
    bgTint: 'bg-blue-500/10',
    borderTint: 'border-blue-500/20',
    glowColor: 'group-hover:shadow-blue-500/20',
  },
  {
    icon: DollarSign,
    value: '$2,400',
    label: 'Monthly Savings',
    sublabel: 'Eliminated admin costs',
    gradient: 'from-green-400 to-emerald-400',
    bgTint: 'bg-green-500/10',
    borderTint: 'border-green-500/20',
    glowColor: 'group-hover:shadow-green-500/20',
  },
  {
    icon: Database,
    value: '100%',
    label: 'Digital History',
    sublabel: 'Every job builds company value',
    gradient: 'from-purple-400 to-pink-400',
    bgTint: 'bg-purple-500/10',
    borderTint: 'border-purple-500/20',
    glowColor: 'group-hover:shadow-purple-500/20',
  },
  {
    icon: TrendingUp,
    value: 'Real-Time',
    label: 'Profitability',
    sublabel: 'No waiting, no guessing',
    gradient: 'from-violet-400 to-purple-400',
    bgTint: 'bg-violet-500/10',
    borderTint: 'border-violet-500/20',
    glowColor: 'group-hover:shadow-violet-500/20',
  },
];

export default function StatsBar() {
  return (
    <section className="py-24 bg-[#0a0a0f] border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Stop Wasting Time.{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Start Building Value.
            </span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Every minute you save and every data point you collect increases your company&apos;s worth
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                className={`relative group ${stat.bgTint} backdrop-blur-xl rounded-2xl border ${stat.borderTint} p-6 shadow-xl hover:shadow-2xl ${stat.glowColor} transition-all duration-300`}
              >
                {/* Hover Glow Overlay */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${stat.gradient} opacity-0 group-hover:opacity-[0.08] transition-opacity duration-300`}
                />

                <div className="relative">
                  {/* Icon in Gradient Circle */}
                  <div
                    className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${stat.gradient} mb-5 shadow-lg`}
                  >
                    <Icon className="text-white" size={26} />
                  </div>

                  {/* Value */}
                  <div
                    className={`text-4xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-2 tracking-tight`}
                  >
                    {stat.value}
                  </div>

                  {/* Label */}
                  <div className="text-white font-semibold text-lg mb-1">
                    {stat.label}
                  </div>

                  {/* Sublabel */}
                  <div className="text-zinc-400 text-sm">
                    {stat.sublabel}
                  </div>
                </div>

                {/* Animated Border Glow */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${stat.gradient} opacity-0 group-hover:opacity-15 blur-sm transition-opacity duration-300 -z-10`}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-14 text-center"
        >
          <p className="text-zinc-300 text-lg leading-relaxed max-w-3xl mx-auto">
            <span className="font-bold text-white">Your data is your competitive advantage.</span>{' '}
            Companies with digital systems sell for 2-3x more than paper-based competitors.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
