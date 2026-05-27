'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, ArrowRight, Loader2, CheckCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

function PontifexLogo() {
  return (
    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
      <span className="text-white font-bold text-2xl tracking-tight">P</span>
    </div>
  );
}

function CompanyLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activated = searchParams.get('activated') === 'true';
  const [showActivatedBanner, setShowActivatedBanner] = useState(activated);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!trimmed) return;

    if (!/^[A-Z0-9]{2,20}$/.test(trimmed)) {
      setError('Invalid company code format.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call Supabase directly — no Vercel Lambda in the path.
      // lookup_tenant_by_code is a SECURITY DEFINER function callable by anon,
      // returning only id + name + company_code (no billing data exposed).
      const { data, error: rpcError } = await supabase
        .rpc('lookup_tenant_by_code', { p_code: trimmed });

      if (rpcError) {
        console.error('[company-login] rpc error:', rpcError.message);
        setError('Lookup failed. Please try again.');
        setLoading(false);
        return;
      }

      const tenant = Array.isArray(data) ? data[0] : data;

      if (!tenant?.id) {
        setError('Company not found. Please check your company code.');
        setLoading(false);
        return;
      }

      // Navigate before clearing loading — router.push triggers navigation immediately
      router.push(`/login?tenant_id=${tenant.id}`);
      // setLoading(false) intentionally omitted — page unmounts on navigation
    } catch (err: any) {
      console.error('[company-login] unexpected error:', err?.message);
      setError('Unable to connect. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm px-4"
      >
        {/* Activated banner */}
        {showActivatedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              Your account is now active — sign in to get started.
            </div>
            <button
              onClick={() => setShowActivatedBanner(false)}
              className="p-1 hover:bg-emerald-500/20 rounded-lg transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8">
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-8">
            <PontifexLogo />
            <h1 className="text-2xl font-bold text-white mt-5 mb-1 tracking-tight">
              Pontifex Industries
            </h1>
            <p className="text-slate-400 text-sm text-center">
              Enter your company code to sign in
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\s/g, '').toUpperCase()); setError(null); }}
                placeholder="COMPANY CODE"
                autoFocus
                autoComplete="organization"
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-500 font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all uppercase"
                required
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/40"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Looking up company…</>
              ) : (
                <>Continue <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-500 text-xs mt-6">
            Don&apos;t have a company code?{' '}
            <a href="/request-demo" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
              Request a demo
            </a>
          </p>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          © {new Date().getFullYear()} Pontifex Industries. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}

export default function CompanyLoginPage() {
  return (
    <Suspense>
      <CompanyLoginContent />
    </Suspense>
  );
}
