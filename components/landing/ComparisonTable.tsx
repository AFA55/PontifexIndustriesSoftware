'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Minus } from 'lucide-react';

type FeatureStatus = 'yes' | 'no' | 'partial';

interface ComparisonRow {
  feature: string;
  category: string;
  pontifex: FeatureStatus;
  dsm: FeatureStatus;
  cenpoint: FeatureStatus;
}

const comparisons: ComparisonRow[] = [
  // Scheduling & Dispatch
  { feature: 'Visual schedule board with drag & drop', category: 'Scheduling', pontifex: 'yes', dsm: 'yes', cenpoint: 'partial' },
  { feature: 'All-operators view (available + assigned)', category: 'Scheduling', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Multi-step job scheduling wizard', category: 'Scheduling', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Operator skill match warnings', category: 'Scheduling', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Time-off management on schedule', category: 'Scheduling', pontifex: 'yes', dsm: 'partial', cenpoint: 'no' },
  { feature: 'Real-time status colors (live updates)', category: 'Scheduling', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },

  // Field Operations
  { feature: 'GPS-tracked operator workflow', category: 'Field Ops', pontifex: 'yes', dsm: 'partial', cenpoint: 'yes' },
  { feature: 'Digital customer signatures on-site', category: 'Field Ops', pontifex: 'yes', dsm: 'partial', cenpoint: 'yes' },
  { feature: 'Photo capture during jobs', category: 'Field Ops', pontifex: 'yes', dsm: 'no', cenpoint: 'partial' },
  { feature: 'Work-performed logging per day', category: 'Field Ops', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Public signature portal (no login needed)', category: 'Field Ops', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },

  // Workforce
  { feature: 'NFC clock-in/clock-out', category: 'Workforce', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Weekly timecard grid with OT breakdown', category: 'Workforce', pontifex: 'yes', dsm: 'partial', cenpoint: 'partial' },
  { feature: 'Per-operator performance analytics', category: 'Workforce', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Skill & certification tracking', category: 'Workforce', pontifex: 'yes', dsm: 'no', cenpoint: 'partial' },

  // Equipment & Inventory
  { feature: 'Equipment checkout/return tracking', category: 'Equipment', pontifex: 'yes', dsm: 'no', cenpoint: 'partial' },
  { feature: 'Blade & bit inventory management', category: 'Equipment', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'NFC equipment pairing', category: 'Equipment', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Maintenance request system', category: 'Equipment', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },

  // Business Operations
  { feature: 'Invoice generation from completed jobs', category: 'Business', pontifex: 'yes', dsm: 'partial', cenpoint: 'yes' },
  { feature: 'QuickBooks CSV export', category: 'Business', pontifex: 'yes', dsm: 'yes', cenpoint: 'yes' },
  { feature: 'Customer CRM with job history', category: 'Business', pontifex: 'yes', dsm: 'partial', cenpoint: 'partial' },
  { feature: 'Facility compliance & badging', category: 'Business', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },

  // Platform Architecture
  { feature: 'Multi-tenant white-label (company codes)', category: 'Platform', pontifex: 'yes', dsm: 'yes', cenpoint: 'no' },
  { feature: 'Role-based access control (8 levels)', category: 'Platform', pontifex: 'yes', dsm: 'partial', cenpoint: 'partial' },
  { feature: 'Card-level permission granularity', category: 'Platform', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Approval workflow (reject/resubmit)', category: 'Platform', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Custom form builder', category: 'Platform', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
  { feature: 'Operations hub with audit trail', category: 'Platform', pontifex: 'yes', dsm: 'no', cenpoint: 'no' },
];

function StatusIcon({ status }: { status: FeatureStatus }) {
  switch (status) {
    case 'yes':
      return <CheckCircle className="text-emerald-400" size={18} />;
    case 'no':
      return <XCircle className="text-red-400/60" size={18} />;
    case 'partial':
      return <Minus className="text-amber-400/60" size={18} />;
  }
}

export default function ComparisonTable() {
  const categories = [...new Set(comparisons.map(c => c.category))];

  const pontifexCount = comparisons.filter(c => c.pontifex === 'yes').length;
  const dsmCount = comparisons.filter(c => c.dsm === 'yes').length;
  const cenpointCount = comparisons.filter(c => c.cenpoint === 'yes').length;

  return (
    <section id="comparison" className="py-24 bg-[#0a0a0f] relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            How We Compare to{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              DSM & CenPoint
            </span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Feature-by-feature comparison across {comparisons.length} capabilities
          </p>
        </motion.div>

        {/* Score Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-3 gap-4 mb-12"
        >
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 sm:p-6 text-center">
            <div className="text-2xl sm:text-4xl font-bold text-blue-400 mb-1">{pontifexCount}/{comparisons.length}</div>
            <div className="text-white font-semibold text-xs sm:text-base">Pontifex</div>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 sm:p-6 text-center">
            <div className="text-2xl sm:text-4xl font-bold text-zinc-400 mb-1">{dsmCount}/{comparisons.length}</div>
            <div className="text-zinc-300 font-semibold text-xs sm:text-base">DSM</div>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 sm:p-6 text-center">
            <div className="text-2xl sm:text-4xl font-bold text-zinc-400 mb-1">{cenpointCount}/{comparisons.length}</div>
            <div className="text-zinc-300 font-semibold text-xs sm:text-base">CenPoint</div>
          </div>
        </motion.div>

        {/* Desktop Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="hidden sm:block bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden"
        >
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_100px_100px_100px] lg:grid-cols-[1fr_120px_120px_120px] bg-white/[0.04] border-b border-white/10 px-6 py-4">
            <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Feature</div>
            <div className="text-center text-blue-400 text-xs font-bold uppercase tracking-wider">Pontifex</div>
            <div className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider">DSM</div>
            <div className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider">CenPoint</div>
          </div>

          {categories.map((category) => (
            <div key={category}>
              <div className="px-6 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">{category}</span>
              </div>
              {comparisons
                .filter(c => c.category === category)
                .map((row, i) => (
                  <div
                    key={row.feature}
                    className={`grid grid-cols-[1fr_100px_100px_100px] lg:grid-cols-[1fr_120px_120px_120px] px-6 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                      i % 2 === 0 ? '' : 'bg-white/[0.01]'
                    }`}
                  >
                    <div className="text-zinc-300 text-sm">{row.feature}</div>
                    <div className="flex justify-center"><StatusIcon status={row.pontifex} /></div>
                    <div className="flex justify-center"><StatusIcon status={row.dsm} /></div>
                    <div className="flex justify-center"><StatusIcon status={row.cenpoint} /></div>
                  </div>
                ))
              }
            </div>
          ))}
        </motion.div>

        {/* Mobile Cards */}
        <div className="sm:hidden space-y-3">
          {categories.map((category) => (
            <div key={category}>
              <div className="text-zinc-300 text-xs font-bold uppercase tracking-wider mb-2 mt-4">{category}</div>
              {comparisons
                .filter(c => c.category === category)
                .map((row) => (
                  <div key={row.feature} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-2">
                    <div className="text-zinc-200 text-sm font-medium mb-3">{row.feature}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="flex justify-center mb-1"><StatusIcon status={row.pontifex} /></div>
                        <div className="text-[10px] text-zinc-500">Pontifex</div>
                      </div>
                      <div>
                        <div className="flex justify-center mb-1"><StatusIcon status={row.dsm} /></div>
                        <div className="text-[10px] text-zinc-500">DSM</div>
                      </div>
                      <div>
                        <div className="flex justify-center mb-1"><StatusIcon status={row.cenpoint} /></div>
                        <div className="text-[10px] text-zinc-500">CenPoint</div>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-6 mt-8">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="text-emerald-400" size={16} />
            <span className="text-zinc-400">Full support</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Minus className="text-amber-400/60" size={16} />
            <span className="text-zinc-400">Partial / limited</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="text-red-400/60" size={16} />
            <span className="text-zinc-400">Not available</span>
          </div>
        </div>
      </div>
    </section>
  );
}
