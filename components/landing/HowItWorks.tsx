'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  UserPlus,
  Settings,
  Rocket,
  ArrowRight,
  Zap,
  Smartphone,
  ShieldCheck,
  HeadphonesIcon,
} from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Sign Up',
    description:
      'Request a demo or try instant access. No credit card required.',
    gradient: 'from-blue-500 to-cyan-500',
    iconBg: 'from-blue-500/20 to-cyan-500/20',
    iconColor: 'text-blue-400',
    glowColor: 'bg-blue-500/20',
  },
  {
    number: '02',
    icon: Settings,
    title: 'Configure',
    description:
      'Set up your business in 5 minutes. Add team, equipment, job types.',
    gradient: 'from-purple-500 to-pink-500',
    iconBg: 'from-purple-500/20 to-pink-500/20',
    iconColor: 'text-purple-400',
    glowColor: 'bg-purple-500/20',
  },
  {
    number: '03',
    icon: Rocket,
    title: 'Go Live',
    description:
      'Start tracking jobs and profitability immediately.',
    gradient: 'from-green-500 to-emerald-500',
    iconBg: 'from-green-500/20 to-emerald-500/20',
    iconColor: 'text-green-400',
    glowColor: 'bg-green-500/20',
  },
];

const bottomFeatures = [
  { icon: Zap, label: 'Lightning Fast Setup', gradient: 'from-yellow-400 to-orange-400' },
  { icon: Smartphone, label: 'Works on Any Device', gradient: 'from-blue-400 to-cyan-400' },
  { icon: ShieldCheck, label: 'Bank-Level Security', gradient: 'from-green-400 to-emerald-400' },
  { icon: HeadphonesIcon, label: 'Expert Support', gradient: 'from-purple-400 to-pink-400' },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-24 bg-[#0a0a0f] relative overflow-hidden"
    >
      {/* Background blur decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[100px]" />
        <div className="absolute top-2/3 left-1/2 w-[300px] h-[300px] bg-cyan-600/5 rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Get Started in{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Three Simple Steps
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto">
            From signup to tracking your first job in minutes, not days
          </p>
        </motion.div>

        {/* Steps Container */}
        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-green-500/30 -translate-y-1/2 z-0" />

          {/* Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative z-10">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ delay: index * 0.2, duration: 0.6 }}
                  className="relative"
                >
                  {/* Card */}
                  <motion.div
                    whileHover={{ scale: 1.03, y: -4 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="bg-zinc-900/50 border border-white/10 backdrop-blur-sm rounded-2xl p-8 relative group"
                  >
                    {/* Hover glow effect */}
                    <div
                      className={`absolute inset-0 ${step.glowColor} rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10`}
                    />

                    {/* Step Number Badge */}
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      whileInView={{ scale: 1, rotate: 0 }}
                      viewport={{ once: true }}
                      transition={{
                        delay: index * 0.2 + 0.3,
                        type: 'spring',
                        stiffness: 200,
                        damping: 15,
                      }}
                      className={`absolute -top-6 -right-6 w-16 h-16 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-black/30`}
                    >
                      {step.number}
                    </motion.div>

                    {/* Icon Container */}
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ duration: 0.5 }}
                      className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${step.iconBg} flex items-center justify-center mb-6 border border-white/5`}
                    >
                      <Icon
                        className={step.iconColor}
                        size={40}
                        strokeWidth={1.5}
                      />
                    </motion.div>

                    {/* Content */}
                    <h3 className="text-2xl font-bold text-white mb-3">
                      {step.title}
                    </h3>
                    <p className="text-zinc-400 leading-relaxed">
                      {step.description}
                    </p>
                  </motion.div>

                  {/* Desktop: Animated Arrow between cards */}
                  {index < steps.length - 1 && (
                    <div className="hidden md:flex absolute top-1/2 -right-6 -translate-y-1/2 translate-x-full z-20 items-center justify-center">
                      <motion.div
                        animate={{ x: [0, 8, 0] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      >
                        <ArrowRight className="text-zinc-600" size={24} />
                      </motion.div>
                    </div>
                  )}

                  {/* Mobile: Vertical dots between cards */}
                  {index < steps.length - 1 && (
                    <div className="md:hidden flex justify-center my-6">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full" />
                        <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
                        <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom Feature Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {bottomFeatures.map((feature, index) => {
            const FeatureIcon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                whileHover={{ scale: 1.02 }}
                className="flex items-center gap-3 p-4 bg-zinc-900/50 rounded-xl border border-white/10 backdrop-blur-sm"
              >
                <div
                  className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0`}
                >
                  <FeatureIcon className="text-white" size={20} />
                </div>
                <span className="text-zinc-300 font-medium text-sm">
                  {feature.label}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
