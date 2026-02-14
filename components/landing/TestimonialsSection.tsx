'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const testimonials = [
  {
    initials: 'MR',
    name: 'M.R.',
    title: 'Operations Manager',
    quote:
      'We cut our weekly admin time by 15 hours. Paperwork that used to take all Friday afternoon now happens automatically in the field.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    initials: 'JT',
    name: 'J.T.',
    title: 'Owner/Operator',
    quote:
      "For the first time, I know whether a job is profitable before my crew even leaves the site. That visibility has changed how I bid work entirely.",
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    initials: 'SK',
    name: 'S.K.',
    title: 'Field Supervisor',
    quote:
      'OSHA compliance used to be a nightmare of paper checklists. Now it is effortless -- everything is documented digitally and always audit-ready.',
    gradient: 'from-green-500 to-emerald-500',
  },
];

export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="py-24 bg-[#0a0a0f] relative overflow-hidden"
    >
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[150px]" />
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
            Trusted by Contractors{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Nationwide
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto">
            See why teams choose us to run their operations
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: index * 0.15, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8 group hover:border-white/20 transition-colors duration-300"
            >
              {/* Star Rating */}
              <div className="flex items-center gap-1 mb-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className="text-yellow-400 fill-yellow-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-zinc-300 italic text-lg leading-relaxed">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              {/* Divider */}
              <div className="border-t border-white/10 mt-6 pt-6">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.gradient} flex items-center justify-center flex-shrink-0 shadow-lg`}
                  >
                    <span className="text-white font-semibold text-sm">
                      {testimonial.initials}
                    </span>
                  </div>

                  {/* Name & Title */}
                  <div>
                    <div className="text-white font-semibold">
                      {testimonial.name}
                    </div>
                    <div className="text-zinc-500 text-sm">
                      {testimonial.title}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Trust Line */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center text-zinc-500 mt-16 text-sm"
        >
          Join 50+ contractors already transforming their operations
        </motion.p>
      </div>
    </section>
  );
}
