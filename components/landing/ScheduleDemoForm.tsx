'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, Send, User, Building2, Mail, Phone, MessageSquare, Loader2 } from 'lucide-react';
import { BRAND } from './brand-config';

interface FormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  tradeType: string;
  companySize: string;
  message: string;
}

const TRADE_OPTIONS = [
  'Concrete Cutting',
  'Demolition',
  'General Contracting',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Excavation',
  'Landscaping',
  'Roofing',
  'Other',
];

const SIZE_OPTIONS = [
  '1-5 employees',
  '6-15 employees',
  '16-50 employees',
  '50+ employees',
];

export default function ScheduleDemoForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    company: '',
    email: '',
    phone: '',
    tradeType: '',
    companySize: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsSubmitted(true);
      } else {
        // Fallback: open mailto
        const subject = encodeURIComponent(`Demo Request from ${formData.name} - ${formData.company}`);
        const body = encodeURIComponent(
          `Name: ${formData.name}\nCompany: ${formData.company}\nEmail: ${formData.email}\nPhone: ${formData.phone}\nTrade: ${formData.tradeType}\nSize: ${formData.companySize}\n\nMessage:\n${formData.message}`
        );
        window.location.href = `mailto:${BRAND.contactEmail}?subject=${subject}&body=${body}`;
        setIsSubmitted(true);
      }
    } catch {
      // Fallback: open mailto
      const subject = encodeURIComponent(`Demo Request from ${formData.name} - ${formData.company}`);
      const body = encodeURIComponent(
        `Name: ${formData.name}\nCompany: ${formData.company}\nEmail: ${formData.email}\nPhone: ${formData.phone}\nTrade: ${formData.tradeType}\nSize: ${formData.companySize}\n\nMessage:\n${formData.message}`
      );
      window.location.href = `mailto:${BRAND.contactEmail}?subject=${subject}&body=${body}`;
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="demo" className="relative py-24 overflow-hidden bg-[#0a0a0f]">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/8 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/8 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Column - Copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 tracking-tight">
                Let&apos;s Build{' '}
                <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
                  Your Solution
                </span>
              </h2>

              <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                Every {BRAND.industry} company works differently. Tell us about your operations
                and we&apos;ll show you exactly how we can automate your workflows,
                eliminate paperwork, and give you real-time visibility into your business.
              </p>

              {/* Value Props */}
              <div className="space-y-4 mb-8">
                {BRAND.valueProps.map((prop, i) => (
                  <motion.div
                    key={prop}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                    <span className="text-zinc-300">{prop}</span>
                  </motion.div>
                ))}
              </div>

              {/* Direct contact fallback */}
              <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
                <p className="text-zinc-500 text-sm mb-2">Prefer to reach out directly?</p>
                <a
                  href={`mailto:${BRAND.contactEmail}`}
                  className="text-blue-400 hover:text-blue-300 font-medium text-sm transition-colors flex items-center gap-2"
                >
                  <Mail size={16} />
                  {BRAND.contactEmail}
                </a>
              </div>
            </motion.div>
          </div>

          {/* Right Column - Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            {isSubmitted ? (
              <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 p-10 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center"
                >
                  <CheckCircle className="text-green-400" size={32} />
                </motion.div>
                <h3 className="text-2xl font-bold text-white mb-3">We&apos;ll Be in Touch!</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Thanks for your interest, {formData.name.split(' ')[0] || 'there'}! We&apos;ll review your
                  information and reach out within 24 hours to schedule your personalized demo.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 p-8 space-y-5"
              >
                <h3 className="text-xl font-bold text-white mb-1">Schedule Your Demo</h3>
                <p className="text-zinc-500 text-sm !mt-0 mb-2">
                  Fill out the form below and we&apos;ll set up a personalized walkthrough.
                </p>

                {/* Name */}
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your full name"
                    className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all text-sm"
                  />
                </div>

                {/* Company */}
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="text"
                    name="company"
                    required
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Company name"
                    className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all text-sm"
                  />
                </div>

                {/* Email + Phone row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Email address"
                      className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all text-sm"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Phone (optional)"
                      className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Trade Type + Company Size row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <select
                    name="tradeType"
                    required
                    value={formData.tradeType}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all appearance-none cursor-pointer"
                    style={{ color: formData.tradeType ? '#fff' : '#52525b' }}
                  >
                    <option value="" disabled>Trade / specialty</option>
                    {TRADE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-zinc-900 text-white">
                        {opt}
                      </option>
                    ))}
                  </select>
                  <select
                    name="companySize"
                    required
                    value={formData.companySize}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all appearance-none cursor-pointer"
                    style={{ color: formData.companySize ? '#fff' : '#52525b' }}
                  >
                    <option value="" disabled>Company size</option>
                    {SIZE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-zinc-900 text-white">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message */}
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3.5 text-zinc-500" size={18} />
                  <textarea
                    name="message"
                    rows={3}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us about your biggest operational challenges — what would you want to automate or improve?"
                    className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all text-sm resize-none"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 text-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Schedule My Demo
                    </>
                  )}
                </button>

                <p className="text-zinc-600 text-xs text-center">
                  We&apos;ll reach out within 24 hours. No spam, ever.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
