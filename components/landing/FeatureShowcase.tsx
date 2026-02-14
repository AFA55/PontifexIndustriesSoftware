'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardCheck,
  TrendingUp,
  Shield,
  CheckCircle,
  MapPin,
  FileText,
  Smartphone,
  BarChart3,
  AlertTriangle,
  Camera,
  PenTool,
  Cloud,
} from 'lucide-react';

const features = [
  {
    icon: ClipboardCheck,
    iconColor: 'text-blue-400',
    bgGradient: 'from-blue-500/10 to-cyan-500/10',
    borderColor: 'border-blue-500/20',
    title: 'From Dispatch to Signature in One Platform',
    description:
      'Complete digital workflow eliminates paperwork and ensures nothing falls through the cracks.',
    benefits: [
      { icon: MapPin, text: 'GPS time tracking with location verification' },
      { icon: PenTool, text: 'Digital customer signatures on-site' },
      { icon: Smartphone, text: 'Automated customer notifications (SMS/email)' },
      { icon: FileText, text: 'Professional PDF generation instantly' },
    ],
  },
  {
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    bgGradient: 'from-emerald-500/10 to-green-500/10',
    borderColor: 'border-emerald-500/20',
    title: 'Know Your Profit Before You Leave the Job',
    description:
      'Stop guessing if you made money. See real-time costs, revenue, and profit on every job.',
    benefits: [
      { icon: BarChart3, text: 'Automatic cost calculations' },
      { icon: TrendingUp, text: 'Real-time profit tracking' },
      { icon: BarChart3, text: 'Operator performance metrics' },
      { icon: BarChart3, text: 'Business intelligence dashboard' },
    ],
  },
  {
    icon: Shield,
    iconColor: 'text-amber-400',
    bgGradient: 'from-amber-500/10 to-orange-500/10',
    borderColor: 'border-amber-500/20',
    title: 'Stay OSHA Compliant Without the Paperwork',
    description:
      'Automated silica tracking, JHA forms, and safety documentation. Pass audits with confidence.',
    benefits: [
      { icon: AlertTriangle, text: 'Silica exposure tracking' },
      { icon: FileText, text: 'Job Hazard Analysis (JHA) forms' },
      { icon: ClipboardCheck, text: 'Equipment checklists' },
      { icon: CheckCircle, text: 'Automatic documentation' },
    ],
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

// ---------- Dark Themed Mockup Components ----------

function WorkflowMockup() {
  return (
    <div className="relative bg-zinc-900 rounded-2xl shadow-2xl shadow-blue-500/5 border border-zinc-800 overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-5 text-white">
        <div className="text-[11px] font-semibold tracking-wider mb-1 opacity-80">
          JOB #2847
        </div>
        <div className="text-xl font-bold mb-0.5">Smith Residence</div>
        <div className="text-sm opacity-80">123 Main St, Los Angeles, CA</div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-500 text-sm font-medium">Status</span>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
            In Progress
          </span>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-500/10 border border-blue-500/10 rounded-xl p-3.5">
            <div className="text-blue-400 text-[11px] font-semibold tracking-wider mb-1">
              TIME ON SITE
            </div>
            <div className="text-white text-xl font-bold">2.5 hrs</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/10 rounded-xl p-3.5">
            <div className="text-emerald-400 text-[11px] font-semibold tracking-wider mb-1">
              PROFIT
            </div>
            <div className="text-white text-xl font-bold">$2,340</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
            <Camera size={15} />
            Add Photos
          </button>
          <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
            <PenTool size={15} />
            Customer Signature
          </button>
        </div>

        {/* GPS Footer */}
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-500 text-xs">GPS Verified &middot; Live Tracking</span>
        </div>
      </div>
    </div>
  );
}

function ProfitabilityMockup() {
  const costs = [
    { label: 'Labor', amount: '$850', bg: 'bg-blue-500/10', text: 'text-blue-400', emoji: null, icon: 'L' },
    { label: 'Equipment', amount: '$450', bg: 'bg-amber-500/10', text: 'text-amber-400', emoji: null, icon: 'E' },
    { label: 'Materials', amount: '$1,920', bg: 'bg-violet-500/10', text: 'text-violet-400', emoji: null, icon: 'M' },
  ];

  return (
    <div className="relative bg-zinc-900 rounded-2xl shadow-2xl shadow-emerald-500/5 border border-zinc-800 overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-5 text-white">
        <div className="text-[11px] font-semibold tracking-wider mb-1 opacity-80">
          LIVE PROFIT ANALYSIS
        </div>
        <div className="text-3xl font-bold mb-0.5">$2,340</div>
        <div className="text-sm opacity-80">42% Profit Margin</div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Cost Breakdown */}
        <div>
          <div className="text-zinc-500 text-[11px] font-semibold tracking-wider mb-3">
            COST BREAKDOWN
          </div>
          <div className="space-y-2.5">
            {costs.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center`}
                  >
                    <span className={`${item.text} text-xs font-bold`}>{item.icon}</span>
                  </div>
                  <span className="text-zinc-300 text-sm font-medium">{item.label}</span>
                </div>
                <span className="text-white font-bold text-sm">{item.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue / Profit */}
        <div className="pt-4 border-t border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 text-sm font-semibold">REVENUE</span>
            <span className="text-white text-lg font-bold">$5,560</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-emerald-400 text-sm font-semibold">NET PROFIT</span>
            <span className="text-emerald-400 text-xl font-bold">$2,340</span>
          </div>
        </div>

        {/* Real-time Badge */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-400 text-xs font-semibold">
            Updated in real-time
          </span>
        </div>
      </div>
    </div>
  );
}

function ComplianceMockup() {
  const checks = [
    { label: 'JHA Form Completed', checked: true },
    { label: 'Silica Exposure Logged', checked: true },
    { label: 'Equipment Inspected', checked: true },
    { label: 'PPE Verified', checked: true },
  ];

  return (
    <div className="relative bg-zinc-900 rounded-2xl shadow-2xl shadow-amber-500/5 border border-zinc-800 overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-5 text-white">
        <div className="text-[11px] font-semibold tracking-wider mb-1 opacity-80">
          SAFETY COMPLIANCE
        </div>
        <div className="text-xl font-bold mb-0.5">Job Hazard Analysis</div>
        <div className="text-sm opacity-80">Digital Safety Forms</div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Checklist */}
        <div className="space-y-2.5">
          {checks.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-zinc-800 border border-zinc-700/50 rounded-xl"
            >
              <span className="text-zinc-300 text-sm font-medium">{item.label}</span>
              <div
                className={`w-6 h-6 rounded-full ${
                  item.checked ? 'bg-emerald-500' : 'bg-zinc-700'
                } flex items-center justify-center`}
              >
                {item.checked && <CheckCircle className="text-white" size={15} />}
              </div>
            </div>
          ))}
        </div>

        {/* Compliance Status */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle className="text-emerald-400" size={22} />
            </div>
            <div>
              <div className="text-white font-bold text-base">100% Compliant</div>
              <div className="text-emerald-400 text-sm">Ready for OSHA audit</div>
            </div>
          </div>
        </div>

        {/* Digital Storage Footer */}
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
          <Cloud className="text-zinc-500" size={14} />
          <span className="text-zinc-500 text-xs">
            Stored digitally &middot; Searchable &middot; Always accessible
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function FeatureShowcase() {
  return (
    <section
      id="features"
      className="py-24 bg-[#09090b] relative overflow-hidden"
    >
      {/* Background Blur Decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ---- Section Header ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Everything You Need to{' '}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              Run Your Business
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto">
            Three powerful features that transform how you manage concrete
            cutting operations
          </p>
        </motion.div>

        {/* ---- Feature Rows ---- */}
        <div className="space-y-28">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isEven = index % 2 === 0;

            const badgeGradient =
              index === 0
                ? 'from-blue-500 to-cyan-500'
                : index === 1
                ? 'from-emerald-500 to-green-500'
                : 'from-amber-500 to-orange-500';

            return (
              <motion.div
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-80px' }}
                variants={containerVariants}
                className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center ${
                  !isEven ? 'lg:grid-flow-dense' : ''
                }`}
              >
                {/* Text Column */}
                <motion.div
                  variants={itemVariants}
                  className={`${!isEven ? 'lg:col-start-2' : ''}`}
                >
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.bgGradient} border ${feature.borderColor} mb-6`}
                  >
                    <Icon className={feature.iconColor} size={28} />
                  </motion.div>

                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                    {feature.title}
                  </h3>

                  <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Benefits List */}
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="space-y-4"
                  >
                    {feature.benefits.map((benefit, benefitIndex) => {
                      const BenefitIcon = benefit.icon;
                      return (
                        <motion.div
                          key={benefitIndex}
                          variants={itemVariants}
                          className="flex items-start gap-3"
                        >
                          <div
                            className={`flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br ${feature.bgGradient} border ${feature.borderColor} flex items-center justify-center mt-0.5`}
                          >
                            <BenefitIcon className={feature.iconColor} size={13} />
                          </div>
                          <span className="text-zinc-300 font-medium">
                            {benefit.text}
                          </span>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </motion.div>

                {/* Mockup Column */}
                <motion.div
                  variants={itemVariants}
                  className={`${
                    !isEven ? 'lg:col-start-1 lg:row-start-1' : ''
                  }`}
                >
                  <div className="relative">
                    {index === 0 && <WorkflowMockup />}
                    {index === 1 && <ProfitabilityMockup />}
                    {index === 2 && <ComplianceMockup />}

                    {/* Floating Badge */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.6, duration: 0.45 }}
                      className={`absolute -top-3 -right-3 px-4 py-1.5 bg-gradient-to-r ${badgeGradient} text-white text-xs font-bold rounded-full shadow-lg shadow-black/30`}
                    >
                      Production Ready
                    </motion.div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* ---- Bottom Value Props ---- */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-8"
        >
          {[
            { number: 'Zero', label: 'Paperwork Needed' },
            { number: 'Real-Time', label: 'Data Collection' },
            { number: '5 min', label: 'Setup Time' },
          ].map((stat, index) => (
            <motion.div key={index} variants={itemVariants} className="text-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent mb-2">
                {stat.number}
              </div>
              <div className="text-zinc-500 font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
