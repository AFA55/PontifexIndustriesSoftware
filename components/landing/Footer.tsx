'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { BRAND } from './brand-config';

export default function Footer() {
  return (
    <footer className="bg-[#050507] border-t border-white/5 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand Column */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center">
                <span className="font-bold text-sm bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {BRAND.logoInitials}
                </span>
              </div>
              <div>
                <div className="font-bold text-white">{BRAND.companyName}</div>
                <div className="text-xs text-zinc-500">{BRAND.tagline}</div>
              </div>
            </div>
            <p className="text-zinc-500 text-sm max-w-md leading-relaxed">
              The all-in-one platform for {BRAND.industry} contractors who want to
              eliminate paperwork, track profitability in real-time, and scale
              their operations with confidence.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Quick Links
            </h3>
            <ul className="space-y-3 text-sm">
              {[
                { label: 'Features', href: '#features' },
                { label: 'How It Works', href: '#how-it-works' },
                { label: 'ROI Calculator', href: '#roi' },
                { label: 'Contact', href: '#contact' },
              ].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-zinc-500 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Get in Touch
            </h3>
            <p className="text-zinc-500 text-sm mb-5 leading-relaxed">
              Want to see how it works for your business? Reach out for a
              personalized walkthrough.
            </p>
            <a
              href={`mailto:${BRAND.contactEmail}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all hover:scale-105"
            >
              Contact Us
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-zinc-600 text-sm">
            &copy; {new Date().getFullYear()} {BRAND.companyName}. All rights
            reserved.
          </p>
          <div className="flex items-center gap-6 text-sm">
            <a
              href="#"
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
