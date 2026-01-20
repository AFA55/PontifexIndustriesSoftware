'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';

const comparisons = [
  {
    feature: 'Job Tracking',
    manual: 'Paper forms and spreadsheets scattered everywhere',
    platform: 'Real-time dashboard with complete visibility',
  },
  {
    feature: 'Time Tracking',
    manual: 'Paper timecards that get lost or forgotten',
    platform: 'GPS-verified check-in with automatic calculations',
  },
  {
    feature: 'Customer Signatures',
    manual: 'Wet signatures requiring job site returns',
    platform: 'Digital signatures captured instantly on-site',
  },
  {
    feature: 'Profitability Analysis',
    manual: 'Calculate days later (if at all)',
    platform: 'Live profit calculations while on-site',
  },
  {
    feature: 'OSHA Compliance',
    manual: 'File cabinets full of forms you can\'t find',
    platform: 'Searchable digital forms, always accessible',
  },
  {
    feature: 'Customer Updates',
    manual: 'Phone tag and missed connections',
    platform: 'Automated SMS/email notifications',
  },
  {
    feature: 'Documentation',
    manual: 'Lost paperwork and missing records',
    platform: 'Cloud storage with instant retrieval',
  },
];

export default function ComparisonTable() {
  return (
    <section className="py-24 bg-gray-900 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
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
            Stop Losing Money to{' '}
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              Paperwork Chaos
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto">
            See how Pontifex replaces your entire manual process
          </p>
        </motion.div>

        {/* Desktop Table */}
        <div className="hidden lg:block">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
          >
            {/* Table Header */}
            <div className="grid grid-cols-3 gap-4 p-6 bg-gradient-to-r from-red-600/20 to-blue-600/20 border-b border-white/10">
              <div className="text-white font-bold text-lg">Feature</div>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 rounded-full border border-red-400/30">
                  <X className="text-red-400" size={18} />
                  <span className="text-red-300 font-bold">Manual Process</span>
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full border border-green-400/30">
                  <Check className="text-green-400" size={18} />
                  <span className="text-green-300 font-bold">Pontifex Platform</span>
                </div>
              </div>
            </div>

            {/* Table Rows */}
            {comparisons.map((comparison, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className={`grid grid-cols-3 gap-4 p-6 ${
                  index !== comparisons.length - 1 ? 'border-b border-white/5' : ''
                } hover:bg-white/5 transition-colors`}
              >
                <div className="flex items-center">
                  <span className="text-white font-semibold">{comparison.feature}</span>
                </div>
                <div className="flex items-center justify-center text-center">
                  <div className="flex items-start gap-2 max-w-xs">
                    <X className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-gray-400 text-sm">{comparison.manual}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center text-center">
                  <div className="flex items-start gap-2 max-w-xs">
                    <Check className="text-green-400 flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-gray-200 text-sm font-medium">{comparison.platform}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-6">
          {comparisons.map((comparison, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 shadow-xl"
            >
              <h3 className="text-white font-bold text-lg mb-4">{comparison.feature}</h3>

              {/* Manual Process */}
              <div className="mb-4 p-4 bg-red-500/10 rounded-xl border border-red-400/20">
                <div className="flex items-center gap-2 mb-2">
                  <X className="text-red-400" size={18} />
                  <span className="text-red-300 font-semibold text-sm">Manual Process</span>
                </div>
                <p className="text-gray-400 text-sm">{comparison.manual}</p>
              </div>

              {/* Platform Solution */}
              <div className="p-4 bg-green-500/10 rounded-xl border border-green-400/20">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="text-green-400" size={18} />
                  <span className="text-green-300 font-semibold text-sm">Pontifex Platform</span>
                </div>
                <p className="text-gray-200 text-sm font-medium">{comparison.platform}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Impact Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center"
        >
          <div className="p-6 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="text-3xl font-bold text-blue-400 mb-2">15+ hrs</div>
            <div className="text-gray-400 text-sm">Saved per crew weekly</div>
          </div>
          <div className="p-6 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="text-3xl font-bold text-green-400 mb-2">$2.4k</div>
            <div className="text-gray-400 text-sm">Monthly admin cost savings</div>
          </div>
          <div className="p-6 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="text-3xl font-bold text-red-400 mb-2">100%</div>
            <div className="text-gray-400 text-sm">Digital data capture</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
