'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  Shield,
  Layers,
  Building2,
  ArrowRight,
  Lock,
  Server,
  Globe,
} from 'lucide-react';

const techStack = [
  { label: 'Next.js 15', desc: 'App Router + React 19', color: 'text-white' },
  { label: 'TypeScript', desc: 'Full type safety', color: 'text-blue-400' },
  { label: 'Supabase', desc: 'PostgreSQL + Auth + Realtime', color: 'text-emerald-400' },
  { label: 'Tailwind CSS', desc: 'Dark theme design system', color: 'text-cyan-400' },
];

const securityFeatures = [
  { icon: Lock, label: 'Tenant data isolation on every API route (85+)' },
  { icon: Shield, label: '8-level RBAC with card-level permissions' },
  { icon: Database, label: 'Row-Level Security at the database layer' },
  { icon: Server, label: 'JWT metadata auth with tenant context' },
];

export default function HowItWorks() {
  return (
    <section
      id="architecture"
      className="py-24 bg-[#0a0a0f] relative overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[100px]" />
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
            Platform{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Architecture
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto">
            Enterprise-grade multi-tenant SaaS built for security and scale
          </p>
        </motion.div>

        {/* Multi-Tenant Flow Diagram */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <h3 className="text-xl font-bold text-white mb-8 text-center">Multi-Tenant Login Flow</h3>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            {[
              { icon: Globe, label: '/company', desc: 'Enter company code', color: 'from-blue-500 to-cyan-500' },
              { icon: Building2, label: 'Lookup Tenant', desc: 'Fetch branding & config', color: 'from-purple-500 to-pink-500' },
              { icon: Lock, label: '/login', desc: 'Branded login page', color: 'from-violet-500 to-indigo-500' },
              { icon: Layers, label: 'Dashboard', desc: 'Tenant-scoped data', color: 'from-emerald-500 to-teal-500' },
            ].map((step, i) => (
              <React.Fragment key={step.label}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="bg-zinc-900/80 border border-white/10 rounded-xl p-5 text-center min-w-[160px] backdrop-blur-sm"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mb-3`}>
                    <step.icon className="text-white" size={24} />
                  </div>
                  <div className="text-white font-bold text-sm mb-1">{step.label}</div>
                  <div className="text-zinc-500 text-xs">{step.desc}</div>
                </motion.div>
                {i < 3 && (
                  <ArrowRight className="text-zinc-600 hidden md:block flex-shrink-0" size={20} />
                )}
              </React.Fragment>
            ))}
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Tech Stack */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-xl font-bold text-white mb-6">Tech Stack</h3>
            <div className="space-y-4">
              {techStack.map((tech) => (
                <div key={tech.label} className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                  <div className={`${tech.color} font-bold text-lg min-w-[120px]`}>{tech.label}</div>
                  <div className="text-zinc-400 text-sm">{tech.desc}</div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              {[
                { value: '85+', label: 'API Routes' },
                { value: '71', label: 'DB Tables' },
                { value: '58+', label: 'Migrations' },
              ].map((stat) => (
                <div key={stat.label} className="text-center bg-zinc-900/30 border border-white/[0.06] rounded-xl p-4">
                  <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">{stat.value}</div>
                  <div className="text-zinc-500 text-xs mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Security */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-xl font-bold text-white mb-6">Security & Isolation</h3>
            <div className="space-y-4">
              {securityFeatures.map((feat) => (
                <div key={feat.label} className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <feat.icon className="text-emerald-400" size={20} />
                  </div>
                  <div className="text-zinc-300 text-sm leading-relaxed">{feat.label}</div>
                </div>
              ))}
            </div>

            {/* Data Isolation Diagram */}
            <div className="mt-8 bg-zinc-900/50 border border-white/10 rounded-xl p-6">
              <h4 className="text-white font-semibold text-sm mb-4">Tenant Data Isolation</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <div className="flex-1 h-8 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center px-3">
                    <span className="text-blue-300 text-xs font-mono">Patriot Concrete (PATRIOT)</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <div className="flex-1 h-8 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center px-3">
                    <span className="text-purple-300 text-xs font-mono">Company B (COMPANYB)</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="flex-1 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center px-3">
                    <span className="text-emerald-300 text-xs font-mono">Company C (COMPANYC)</span>
                  </div>
                </div>
                <div className="text-center text-zinc-500 text-xs mt-2">
                  Each tenant&apos;s data is completely isolated via tenant_id on all 71 tables
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
