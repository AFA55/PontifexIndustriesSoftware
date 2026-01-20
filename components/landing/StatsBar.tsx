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
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  {
    icon: DollarSign,
    value: '$2,400',
    label: 'Monthly Savings',
    sublabel: 'Eliminated admin costs',
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  {
    icon: Database,
    value: '100%',
    label: 'Digital History',
    sublabel: 'Every job builds company value',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
  },
  {
    icon: TrendingUp,
    value: 'Real-Time',
    label: 'Profitability',
    sublabel: 'No waiting, no guessing',
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
  },
];

export default function StatsBar() {
  return (
    <section className="py-20 bg-gradient-to-b from-slate-900 to-slate-800 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Stop Wasting Time.{' '}
            <span className="bg-gradient-to-r from-blue-400 to-red-400 bg-clip-text text-transparent">
              Start Building Value.
            </span>
          </h2>
          <p className="text-gray-400 text-lg">
            Every minute you save and every data point you collect increases your company's worth
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
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                className={`relative group ${stat.bgColor} backdrop-blur-xl rounded-2xl border ${stat.borderColor} p-6 shadow-xl hover:shadow-2xl transition-all duration-300`}
              >
                {/* Glow Effect on Hover */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>

                {/* Icon */}
                <div className="relative">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-r ${stat.color} mb-4 shadow-lg`}>
                    <Icon className="text-white" size={28} />
                  </div>

                  {/* Value */}
                  <div className={`text-4xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent mb-2`}>
                    {stat.value}
                  </div>

                  {/* Label */}
                  <div className="text-white font-semibold text-lg mb-1">
                    {stat.label}
                  </div>

                  {/* Sublabel */}
                  <div className="text-gray-400 text-sm">
                    {stat.sublabel}
                  </div>
                </div>

                {/* Animated Border Effect */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${stat.color} opacity-0 group-hover:opacity-20 blur transition-opacity duration-300 -z-10`}></div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-12 text-center"
        >
          <p className="text-gray-300 text-lg">
            <span className="font-bold text-white">Your data is your competitive advantage.</span>{' '}
            Companies with digital systems sell for 2-3x more than paper-based competitors.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
