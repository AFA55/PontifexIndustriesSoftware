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
                    {/* Card Mockup */}
                    <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-200 p-8 transform hover:scale-[1.02] transition-transform duration-300">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.bgGradient} flex items-center justify-center`}>
                          <Icon className={feature.iconColor} size={24} />
                        </div>
                        <div>
                          <div className="text-gray-900 font-bold text-lg">Feature Preview</div>
                          <div className="text-gray-500 text-sm">Live Dashboard</div>
                        </div>
                      </div>

                      {/* Content Bars (simulating data) */}
                      <div className="space-y-4">
                        {[85, 92, 78, 95].map((percent, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Metric {i + 1}</span>
                              <span className="text-gray-900 font-bold">{percent}%</span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${percent}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, delay: i * 0.1 + 0.5 }}
                                className={`h-full bg-gradient-to-r ${feature.bgGradient} rounded-full`}
                                style={{
                                  background: `linear-gradient(to right, ${
                                    index === 0 ? '#3b82f6' : index === 1 ? '#10b981' : '#ef4444'
                                  }, ${
                                    index === 0 ? '#06b6d4' : index === 1 ? '#059669' : '#f97316'
                                  })`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Status Badge */}
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-green-500' : 'bg-red-500'
                          } animate-pulse`}></div>
                          <span className="text-gray-600 text-sm font-medium">Live and active</span>
                        </div>
                      </div>
                    </div>

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

        {/* Bottom Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8"
        >
          {[
            { number: '500+', label: 'Jobs Tracked Monthly' },
            { number: '99.9%', label: 'Uptime Guarantee' },
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
