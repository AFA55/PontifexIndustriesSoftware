'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';

/**
 * Client island: sticky marketing nav with scroll-aware background + mobile menu.
 * Kept tiny on purpose — the rest of the homepage is server-rendered so crawlers
 * see the full marketing copy.
 */
export default function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '#problem', label: 'The Problem' },
    { href: '#how', label: 'How It Works' },
    { href: '#custom', label: 'Custom Builds' },
    { href: '#proof', label: 'Proof' },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 border-b ${
        scrolled
          ? 'backdrop-blur-xl bg-[#09090b]/85 border-white/[0.06]'
          : 'bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Pontifex Industries home">
          <Image
            src="/logo.svg"
            alt="Pontifex Industries logo"
            width={32}
            height={32}
            className="w-8 h-8"
            priority
          />
          <span className="font-bold text-white text-sm tracking-tight">Pontifex Industries</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-400" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a
            href="/company-login"
            className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm font-semibold transition-all"
          >
            Log In
          </a>
          <a
            href="/request-demo"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 hover:opacity-90 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-900/30"
          >
            Request a Demo
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden p-2 -mr-2 text-zinc-300"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#09090b]/95 backdrop-blur-xl px-6 py-4 space-y-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block text-zinc-300 hover:text-white py-1.5 text-sm font-medium"
            >
              {l.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.06]">
            <a
              href="/company-login"
              className="px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-200 text-sm font-semibold text-center"
            >
              Log In
            </a>
            <a
              href="/request-demo"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 text-white text-sm font-semibold text-center"
            >
              Request a Demo
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
