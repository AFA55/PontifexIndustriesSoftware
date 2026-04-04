'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  ClipboardCheck,
  Clock,
  Users,
  Wrench,
  FileText,
  DollarSign,
  Building2,
  Shield,
  MapPin,
  PenTool,
  BarChart3,
  Smartphone,
  Package,
  HardHat,
  CheckCircle,
} from 'lucide-react';

const modules = [
  {
    icon: Calendar,
    title: 'Schedule Board',
    description: 'Drag-and-drop job scheduling with all-operator view, time-off tracking, and real-time status colors',
    status: 'live',
    color: 'from-purple-500/20 to-indigo-500/20',
    borderColor: 'border-purple-500/20',
    iconColor: 'text-purple-400',
    highlights: ['All operators view', 'Skill match warnings', 'Realtime status updates', 'Inline editing'],
  },
  {
    icon: ClipboardCheck,
    title: '8-Step Schedule Form',
    description: 'Complete job scheduling wizard with customer-first flow, project details, and site compliance',
    status: 'live',
    color: 'from-orange-500/20 to-red-500/20',
    borderColor: 'border-orange-500/20',
    iconColor: 'text-orange-400',
    highlights: ['Customer search/create', 'Smart contact dropdown', 'Facility compliance', 'Approval workflow'],
  },
  {
    icon: Clock,
    title: 'Timecard Management',
    description: 'Weekly grid view with per-operator breakdown, overtime tracking, and NFC clock-in support',
    status: 'live',
    color: 'from-emerald-500/20 to-teal-500/20',
    borderColor: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
    highlights: ['Weekly grid view', 'OT breakdown', 'NFC tag support', 'PDF export'],
  },
  {
    icon: Smartphone,
    title: 'Operator Mobile Workflow',
    description: 'Full field workflow: My Jobs > En Route (GPS) > Work Performed > Signature > Complete',
    status: 'live',
    color: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/20',
    iconColor: 'text-blue-400',
    highlights: ['GPS tracking', 'Photo capture', 'Work logging', 'Digital signatures'],
  },
  {
    icon: Users,
    title: 'Team Management',
    description: 'Role-based access control with 8 roles, card-level permissions, and access request approval',
    status: 'live',
    color: 'from-blue-500/20 to-blue-600/20',
    borderColor: 'border-blue-500/20',
    iconColor: 'text-blue-400',
    highlights: ['8 role levels', 'Card permissions', 'Access requests', 'Team directory'],
  },
  {
    icon: DollarSign,
    title: 'Billing & Invoicing',
    description: 'Generate invoices from completed jobs, track payments, export PDF & QuickBooks CSV',
    status: 'live',
    color: 'from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-500/20',
    iconColor: 'text-green-400',
    highlights: ['Auto-generate invoices', 'PDF export', 'QuickBooks CSV', 'Payment tracking'],
  },
  {
    icon: Building2,
    title: 'Customer CRM',
    description: 'Full customer database with contacts, job history, revenue tracking, and multi-contact support',
    status: 'live',
    color: 'from-indigo-500/20 to-blue-500/20',
    borderColor: 'border-indigo-500/20',
    iconColor: 'text-indigo-400',
    highlights: ['Customer database', 'Contact management', 'Job history', 'Revenue tracking'],
  },
  {
    icon: HardHat,
    title: 'Operator Profiles',
    description: 'Manage operator skills, hourly rates, certifications, and performance analytics',
    status: 'live',
    color: 'from-blue-500/20 to-indigo-500/20',
    borderColor: 'border-blue-500/20',
    iconColor: 'text-blue-400',
    highlights: ['Skill tracking', 'Cost rates', 'Certifications', 'Performance data'],
  },
  {
    icon: Package,
    title: 'Blade & Bit Inventory',
    description: 'Track blade/bit stock levels, assign to operators, scan QR codes, and low stock alerts',
    status: 'live',
    color: 'from-indigo-500/20 to-purple-500/20',
    borderColor: 'border-indigo-500/20',
    iconColor: 'text-indigo-400',
    highlights: ['Stock tracking', 'QR scanning', 'Operator assignment', 'Low stock alerts'],
  },
  {
    icon: Wrench,
    title: 'Tools & Equipment',
    description: 'Full equipment tracking with checkout/return, NFC pairing, maintenance requests, and damage reports',
    status: 'live',
    color: 'from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-500/20',
    iconColor: 'text-purple-400',
    highlights: ['Checkout/return', 'NFC pairing', 'Maintenance alerts', 'Usage history'],
  },
  {
    icon: Shield,
    title: 'Facilities & Badging',
    description: 'Facility compliance management with operator badge tracking and auto-expiration alerts',
    status: 'live',
    color: 'from-violet-500/20 to-purple-500/20',
    borderColor: 'border-violet-500/20',
    iconColor: 'text-violet-400',
    highlights: ['Facility CRUD', 'Badge tracking', 'Expiry alerts', 'Compliance docs'],
  },
  {
    icon: PenTool,
    title: 'Customer Signature Portal',
    description: 'Public token-based signature pages — customers sign waivers and completion forms without logging in',
    status: 'live',
    color: 'from-cyan-500/20 to-blue-500/20',
    borderColor: 'border-cyan-500/20',
    iconColor: 'text-cyan-400',
    highlights: ['Public sign pages', 'Token-based links', 'No auth required', 'SMS/email delivery'],
  },
  {
    icon: FileText,
    title: 'Completed Job Tickets',
    description: 'View all completed jobs with signed tickets, customer feedback, and legal documents',
    status: 'live',
    color: 'from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-500/20',
    iconColor: 'text-green-400',
    highlights: ['Signed tickets', 'Photo evidence', 'Legal documents', 'Job analytics'],
  },
  {
    icon: MapPin,
    title: 'GPS & Geolocation',
    description: 'Real-time location tracking for operators in the field with automatic clock-in verification',
    status: 'live',
    color: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/20',
    iconColor: 'text-red-400',
    highlights: ['Live location', 'Clock-in verification', 'Route tracking', 'Geofencing'],
  },
  {
    icon: BarChart3,
    title: 'Operations Hub',
    description: 'System diagnostics, API health checks, login audit trail, and error monitoring',
    status: 'live',
    color: 'from-slate-500/20 to-zinc-500/20',
    borderColor: 'border-slate-500/20',
    iconColor: 'text-slate-400',
    highlights: ['API health', 'Audit trail', 'Error monitoring', 'DB stats'],
  },
];

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
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              15 Live Modules
            </span>{' '}
            — All Functional Today
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto">
            Every module below is built, tested, and ready for production. Click any card to see details.
          </p>
        </motion.div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex justify-center mb-12"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <CheckCircle className="text-emerald-400" size={16} />
            <span className="text-emerald-300 text-sm font-medium">All modules are live and functional</span>
          </div>
        </motion.div>

        {/* Module Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map((mod, index) => {
            const Icon = mod.icon;
            return (
              <motion.div
                key={mod.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`group bg-gradient-to-br ${mod.color} border ${mod.borderColor} rounded-2xl p-6 hover:border-white/20 transition-all duration-300`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center`}>
                    <Icon className={mod.iconColor} size={20} />
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20 uppercase tracking-wider">
                    Live
                  </span>
                </div>

                {/* Title & Description */}
                <h3 className="text-white font-bold text-lg mb-2">{mod.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-4">{mod.description}</p>

                {/* Highlights */}
                <div className="grid grid-cols-2 gap-1.5">
                  {mod.highlights.map((h) => (
                    <div key={h} className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                      <span className="text-zinc-500 text-xs">{h}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
