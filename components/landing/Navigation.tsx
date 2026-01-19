'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Handle scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'backdrop-blur-xl bg-white/95 shadow-lg border-b border-gray-200'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <Link href="/" className="flex items-center gap-3 group">
              <Logo />
              <div className="hidden sm:block">
                <div className="font-bold text-lg bg-gradient-to-r from-blue-600 via-blue-700 to-red-700 bg-clip-text text-transparent group-hover:from-blue-700 group-hover:to-red-800 transition-all">
                  Pontifex Industries
                </div>
                <div className={`text-xs font-medium transition-colors ${
                  isScrolled ? 'text-gray-600' : 'text-white/80'
                }`}>
                  Concrete Management
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  isScrolled ? 'text-gray-700' : 'text-white'
                }`}
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  isScrolled ? 'text-gray-700' : 'text-white'
                }`}
              >
                How It Works
              </a>
              <Link
                href="/login"
                className={`px-6 py-2 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                  isScrolled
                    ? 'bg-gradient-to-r from-blue-600 to-red-600 text-white shadow-lg hover:shadow-xl'
                    : 'bg-white/20 backdrop-blur-md text-white border-2 border-white/40 hover:bg-white/30'
                }`}
              >
                Sign In
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100/20 transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className={isScrolled ? 'text-gray-700' : 'text-white'} size={24} />
              ) : (
                <Menu className={isScrolled ? 'text-gray-700' : 'text-white'} size={24} />
              )}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-16 left-0 right-0 z-40 md:hidden backdrop-blur-xl bg-white/95 border-b border-gray-200 shadow-lg"
          >
            <div className="px-4 py-6 space-y-4">
              <a
                href="#features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-4 py-3 text-gray-700 font-medium hover:bg-blue-50 rounded-xl transition-colors"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-4 py-3 text-gray-700 font-medium hover:bg-blue-50 rounded-xl transition-colors"
              >
                How It Works
              </a>
              <Link
                href="/login"
                className="block px-4 py-3 text-center bg-gradient-to-r from-blue-600 to-red-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                Sign In
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nav-p-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A73E8" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="#ffffff" stroke="#1e293b" strokeWidth="2" />
      <path d="M14 34V14h12a8 8 0 1 1 0 16H22v4" stroke="url(#nav-p-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
