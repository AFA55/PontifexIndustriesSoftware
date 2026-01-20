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
} from 'lucide-react';

const features = [
  {
    icon: ClipboardCheck,
    iconColor: 'text-blue-500',
    bgGradient: 'from-blue-500/10 to-cyan-500/10',
    borderColor: 'border-blue-500/20',
    title: 'From Dispatch to Signature in One Platform',
    description: 'Complete digital workflow eliminates paperwork and ensures nothing falls through the cracks.',
    benefits: [
      { icon: MapPin, text: 'GPS time tracking with location verification' },
      { icon: FileText, text: 'Digital customer signatures on-site' },
      { icon: Smartphone, text: 'Automated customer notifications (SMS/email)' },
      { icon: CheckCircle, text: 'Professional PDF generation instantly' },
    ],
  },
  {
    icon: TrendingUp,
    iconColor: 'text-green-500',
    bgGradient: 'from-green-500/10 to-emerald-500/10',
    borderColor: 'border-green-500/20',
    title: 'Know Your Profit Before You Leave the Job',
    description: 'Stop guessing if you made money. See real-time costs, revenue, and profit on every job.',
    benefits: [
      { icon: BarChart3, text: 'Automatic cost calculations' },
      { icon: TrendingUp, text: 'Real-time profit tracking' },
      { icon: BarChart3, text: 'Operator performance metrics' },
      { icon: BarChart3, text: 'Business intelligence dashboard' },
    ],
  },
  {
    icon: Shield,
    iconColor: 'text-red-500',
    bgGradient: 'from-red-500/10 to-orange-500/10',
    borderColor: 'border-red-500/20',
    title: 'Stay OSHA Compliant Without the Paperwork',
    description: 'Automated silica tracking, JHA forms, and safety documentation. Pass audits with confidence.',
    benefits: [
      { icon: AlertTriangle, text: 'Silica exposure tracking' },
      { icon: FileText, text: 'Job Hazard Analysis (JHA) forms' },
      { icon: ClipboardCheck, text: 'Equipment checklists' },
      { icon: CheckCircle, text: 'Automatic documentation' },
    ],
  },
];

// Mockup Components
function WorkflowMockup() {
  return (
    <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
      {/* Mobile App Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white">
        <div className="text-xs font-semibold mb-1 opacity-80">JOB #2847</div>
        <div className="text-2xl font-bold mb-1">Smith Residence</div>
        <div className="text-sm opacity-90">123 Main St, Los Angeles, CA</div>
      </div>

      {/* Job Status */}
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-gray-600 text-sm font-medium">Status</div>
          <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
            ✓ In Progress
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="text-blue-600 text-xs font-semibold mb-1">TIME ON SITE</div>
            <div className="text-gray-900 text-2xl font-bold">2.5 hrs</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <div className="text-green-600 text-xs font-semibold mb-1">PROFIT</div>
            <div className="text-gray-900 text-2xl font-bold">$2,340</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm shadow-lg hover:bg-blue-700 transition-colors">
            📸 Add Photos
          </button>
          <button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-xl font-semibold text-sm shadow-lg hover:from-green-600 hover:to-emerald-700 transition-colors">
            ✍️ Customer Signature
          </button>
        </div>

        {/* GPS Footer */}
        <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-gray-500 text-xs">GPS Verified • Live Tracking</span>
        </div>
      </div>
    </div>
  );
}

function ProfitabilityMockup() {
  return (
    <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
      {/* Dashboard Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white">
        <div className="text-xs font-semibold mb-1 opacity-80">LIVE PROFIT ANALYSIS</div>
        <div className="text-3xl font-bold mb-1">$2,340</div>
        <div className="text-sm opacity-90">42% Profit Margin</div>
      </div>

      {/* Cost Breakdown */}
      <div className="p-6 space-y-4">
        <div>
          <div className="text-gray-600 text-xs font-semibold mb-3">COST BREAKDOWN</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 text-xs">👷</span>
                </div>
                <span className="text-gray-700 text-sm font-medium">Labor</span>
              </div>
              <span className="text-gray-900 font-bold">$850</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <span className="text-orange-600 text-xs">⚙️</span>
                </div>
                <span className="text-gray-700 text-sm font-medium">Equipment</span>
              </div>
              <span className="text-gray-900 font-bold">$450</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <span className="text-purple-600 text-xs">🧱</span>
                </div>
                <span className="text-gray-700 text-sm font-medium">Materials</span>
              </div>
              <span className="text-gray-900 font-bold">$1,920</span>
            </div>
          </div>
        </div>

        {/* Revenue */}
        <div className="pt-4 border-t-2 border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-semibold">REVENUE</span>
            <span className="text-gray-900 text-xl font-bold">$5,560</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-green-600 text-sm font-semibold">NET PROFIT</span>
            <span className="text-green-600 text-2xl font-bold">$2,340</span>
          </div>
        </div>

        {/* Real-time Badge */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-green-700 text-xs font-semibold">Updated in real-time</span>
        </div>
      </div>
    </div>
  );
}

function ComplianceMockup() {
  return (
    <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
      {/* Safety Header */}
      <div className="bg-gradient-to-r from-red-600 to-orange-600 p-6 text-white">
        <div className="text-xs font-semibold mb-1 opacity-80">SAFETY COMPLIANCE</div>
        <div className="text-2xl font-bold mb-1">Job Hazard Analysis</div>
        <div className="text-sm opacity-90">Digital Safety Forms</div>
      </div>

      {/* Compliance Checklist */}
      <div className="p-6 space-y-4">
        <div className="space-y-3">
          {[
            { label: 'JHA Form Completed', checked: true },
            { label: 'Silica Exposure Logged', checked: true },
            { label: 'Equipment Inspected', checked: true },
            { label: 'PPE Verified', checked: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-gray-700 text-sm font-medium">{item.label}</span>
              <div className={`w-6 h-6 rounded-full ${
                item.checked ? 'bg-green-500' : 'bg-gray-300'
              } flex items-center justify-center`}>
                {item.checked && <CheckCircle className="text-white" size={16} />}
              </div>
            </div>
          ))}
        </div>

        {/* Compliance Status */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="text-white" size={24} />
            </div>
            <div>
              <div className="text-green-900 font-bold text-lg">100% Compliant</div>
              <div className="text-green-700 text-sm">Ready for OSHA audit</div>
            </div>
          </div>
        </div>

        {/* Digital Storage Info */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <span>☁️</span>
            <span>Stored digitally • Searchable • Always accessible</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeatureShowcase() {
  return (
    <section id="features" className="py-24 bg-gradient-to-br from-slate-50 via-white to-blue-50 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl"></div>
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
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Everything You Need to{' '}
            <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-red-600 bg-clip-text text-transparent">
              Run Your Business
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Three powerful features that transform how you manage concrete cutting operations
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="space-y-24">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isEven = index % 2 === 0;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.7, delay: index * 0.2 }}
                className={`grid lg:grid-cols-2 gap-12 items-center ${!isEven ? 'lg:grid-flow-dense' : ''}`}
              >
                {/* Content Column */}
                <div className={`${!isEven ? 'lg:col-start-2' : ''}`}>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.bgGradient} border-2 ${feature.borderColor} mb-6`}
                  >
                    <Icon className={feature.iconColor} size={32} />
                  </motion.div>

                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                    {feature.title}
                  </h3>

                  <p className="text-lg text-gray-600 mb-8">
                    {feature.description}
                  </p>

                  {/* Benefits List */}
                  <div className="space-y-4">
                    {feature.benefits.map((benefit, benefitIndex) => {
                      const BenefitIcon = benefit.icon;
                      return (
                        <motion.div
                          key={benefitIndex}
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: benefitIndex * 0.1 + 0.3 }}
                          className="flex items-start gap-3"
                        >
                          <div className={`flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br ${feature.bgGradient} border ${feature.borderColor} flex items-center justify-center mt-0.5`}>
                            <BenefitIcon className={feature.iconColor} size={14} />
                          </div>
                          <span className="text-gray-700 font-medium">{benefit.text}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Visual Column */}
                <div className={`${!isEven ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="relative"
                  >
                    {/* Platform Mockup */}
                    {index === 0 && <WorkflowMockup />}
                    {index === 1 && <ProfitabilityMockup />}
                    {index === 2 && <ComplianceMockup />}

                    {/* Floating Badge */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5, duration: 0.5 }}
                      className={`absolute -top-4 -right-4 px-4 py-2 bg-gradient-to-r ${
                        index === 0
                          ? 'from-blue-500 to-cyan-500'
                          : index === 1
                          ? 'from-green-500 to-emerald-500'
                          : 'from-red-500 to-orange-500'
                      } text-white text-sm font-bold rounded-full shadow-lg`}
                    >
                      ✓ Production Ready
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Value Props */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8"
        >
          {[
            { number: 'Zero', label: 'Paperwork Needed' },
            { number: 'Real-Time', label: 'Data Collection' },
            { number: '5 min', label: 'Setup Time' },
          ].map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-red-600 bg-clip-text text-transparent mb-2">
                {stat.number}
              </div>
              <div className="text-gray-600 font-medium">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
