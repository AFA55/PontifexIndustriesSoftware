'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, Loader2, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CompanyCodePage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check if tenant already stored — skip to login
  useEffect(() => {
    try {
      const stored = localStorage.getItem('current-tenant');
      if (stored) {
        const tenant = JSON.parse(stored);
        if (tenant?.company_code) {
          router.replace(`/login?company=${tenant.company_code}`);
        }
      }
    } catch {
      // ignore
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/auth/lookup-company?code=${encodeURIComponent(code.toUpperCase())}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError('Company not found. Please check your code and try again.');
        return;
      }

      // Store tenant info
      localStorage.setItem('current-tenant', JSON.stringify(data.tenant));

      // Store branding if available
      if (data.branding) {
        localStorage.setItem(`branding-${data.tenant.id}`, JSON.stringify({
          data: data.branding,
          timestamp: Date.now(),
        }));
      }

      router.push(`/login?company=${data.tenant.company_code}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden px-4">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Platform header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-purple-400" />
            <span className="text-purple-300/80 text-sm font-medium tracking-widest uppercase">
              Operations Platform
            </span>
          </div>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/[0.1] shadow-2xl p-8"
        >
          {/* Icon */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex justify-center mb-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </motion.div>

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-center mb-8"
          >
            <h1 className="text-2xl font-bold text-white mb-2">
              Enter your company code
            </h1>
            <p className="text-slate-400 text-sm">
              Your administrator will provide this code
            </p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <motion.div
              initial={{ x: -15, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="COMPANY CODE"
                  autoFocus
                  autoComplete="off"
                  className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/[0.06] border-2 border-white/[0.1] focus:border-purple-500/60 focus:ring-4 focus:ring-purple-500/10 focus:outline-none transition-all duration-200 text-white text-lg font-mono tracking-widest placeholder-slate-600 uppercase"
                />
              </div>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm font-medium"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300 focus:ring-4 focus:ring-purple-500/30 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>
          </form>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center mt-6 text-slate-500 text-xs"
        >
          Don&apos;t have a company code?{' '}
          <span className="text-purple-400">
            Contact your administrator
          </span>
        </motion.p>
      </motion.div>
    </div>
  );
}
