'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, ArrowRight, Loader2, CheckCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PLATFORM_TENANT_ID } from '@/lib/rbac';
import SplashIntro from '@/components/SplashIntro';

/**
 * Last company the user successfully signed in with (or looked up).
 * Persisted in localStorage under `pontifex.lastCompany` so a returning user
 * gets a one-tap "Continue to {Company}" fast path instead of re-typing the
 * company code on every app launch / after every logout.
 * NOTE: logout() in lib/auth.ts intentionally does NOT clear this key.
 */
interface LastCompany {
  tenantId: string;
  code?: string;
  name: string;
  logoUrl?: string;
}

const LAST_COMPANY_KEY = 'pontifex.lastCompany';

function readLastCompany(): LastCompany | null {
  try {
    const raw = localStorage.getItem(LAST_COMPANY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.tenantId === 'string' && parsed.tenantId && typeof parsed.name === 'string' && parsed.name) {
      return parsed as LastCompany;
    }
  } catch {
    /* corrupt JSON / private mode — fall through to the code form */
  }
  return null;
}

function PontifexLogoMark() {
  return (
    <svg viewBox="0 0 200 200" className="w-5 h-5 shrink-0" fill="none" stroke="#ffffff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path transform="translate(-5,-2)" d="M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108" />
    </svg>
  );
}

function PontifexLogo() {
  return (
    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
      <svg viewBox="0 0 200 200" className="w-9 h-9" fill="none" stroke="#ffffff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path transform="translate(-5,-2)" d="M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108" />
      </svg>
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
  // Fast path: remember the last company so returning users tap once instead of
  // re-typing the code. 'pending' avoids a form→fast-path flash before hydration.
  // 'resuming' = a valid persisted session was found and we're sending the user
  // straight to their dashboard — THE "Remember me" behavior. Before this,
  // sessions persisted in localStorage but no page ever read them, so everyone
  // re-typed their password on every launch.
  const [lastCompany, setLastCompany] = useState<LastCompany | null>(null);
  const [view, setView] = useState<'pending' | 'resuming' | 'fast' | 'form'>('pending');
  const [continuing, setContinuing] = useState(false);
  // A remembered PLATFORM-ORG (Pontifex owner) session: entry into the owner
  // console requires an explicit click, never a silent forward.
  const [platformSession, setPlatformSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const showEntry = () => {
      if (cancelled) return;
      const last = readLastCompany();
      if (last) {
        setLastCompany(last);
        setView('fast');
      } else {
        setView('form');
      }
    };

    (async () => {
      try {
        // Default-OFF: only auto-resume when the user explicitly opted in
        // (flag === 'true'). Unchecking "Remember me" writes 'false' and a
        // brand-new device has no flag at all — both disable auto sign-in so
        // the user re-authenticates. Existing users who previously checked
        // remember already have 'true' stored, so they're unaffected.
        const remember = localStorage.getItem('pontifex.rememberMe') === 'true';
        // Dashboard guards read this profile blob; without it they'd bounce
        // the user back here, so only resume when BOTH halves are present.
        const storedUser = localStorage.getItem('supabase-user');
        if (!remember || !storedUser) return showEntry();

        // getSession() returns the persisted session and transparently
        // refreshes an expired access token when the refresh token is valid.
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          // PLATFORM-ORG sessions never silently forward (founder Jul 12:
          // "no one should just automatically get into Pontifex"). The owner
          // console is entered by an explicit click; tenant users keep the
          // silent remember-me resume their office staff rely on.
          let storedTenant: string | null = null;
          try {
            storedTenant = JSON.parse(storedUser)?.tenant_id ?? null;
          } catch { /* unverifiable */ }
          // PONTIFEX-org sessions only (founder Jul 14: a TENANT's super
          // admin belongs in their own portal, never the owner console) —
          // and even the owner enters by an explicit click, never silently.
          if (storedTenant === PLATFORM_TENANT_ID) {
            setPlatformSession(true);
            showEntry();
            return;
          }
          // NATIVE + Face ID enrolled: the face gates the resume (founder
          // Jul 21 — employees expected a scan, not a silent let-in). Cancel
          // → the manual fast-path buttons; plugin absent → resume as before.
          try {
            const { isNativeApp } = await import('@/lib/is-native');
            if (isNativeApp()) {
              const { hasEnrolledBiometric, verifyAndGetSession } = await import('@/lib/biometric');
              if (await hasEnrolledBiometric()) {
                const ok = await verifyAndGetSession('Unlock Pontifex');
                if (cancelled) return;
                if (!ok) {
                  showEntry();
                  return;
                }
              }
            }
          } catch { /* biometric plugin absent — silent resume */ }
          setView('resuming');
          router.replace('/dashboard');
          return;
        }
        // Session truly gone (signed out / refresh token revoked) — the stale
        // profile blob must not linger or guards mis-render before bouncing.
        localStorage.removeItem('supabase-user');
        // NATIVE + enrolled: hand off to /login, whose Face ID auto-prompt +
        // token-rotation + profile-restore machinery already handles biometric
        // re-login end to end (the app cold-launches HERE, so the prompt never
        // fired before — Jul 21 audit finding #3).
        try {
          const { isNativeApp } = await import('@/lib/is-native');
          if (isNativeApp()) {
            const { hasEnrolledBiometric } = await import('@/lib/biometric');
            const last = readLastCompany();
            if (last?.tenantId && (await hasEnrolledBiometric())) {
              router.replace(`/login?tenant_id=${last.tenantId}`);
              return;
            }
          }
        } catch { /* plugin absent — normal entry */ }
        showEntry();
      } catch {
        showEntry();
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  const handleContinue = () => {
    if (!lastCompany) return;
    setContinuing(true);
    router.push(`/login?tenant_id=${lastCompany.tenantId}`);
  };

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

      // Persist for the one-tap "Continue to {Company}" fast path next launch.
      // The login page enriches this with the tenant logo once branding loads.
      try {
        const prev = readLastCompany();
        localStorage.setItem(LAST_COMPANY_KEY, JSON.stringify({
          tenantId: tenant.id,
          code: trimmed,
          name: tenant.name || trimmed,
          logoUrl: prev && prev.tenantId === tenant.id ? prev.logoUrl : undefined,
        }));
      } catch {
        /* localStorage unavailable — non-fatal */
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#1e1b4b]">
      {/* Premium launch intro — overlays once per app launch, then fades to reveal login */}
      <SplashIntro />

      {/* Background aurora — matches the SplashIntro colorway (purple→magenta→red on #1e1b4b) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#7c3aed]/25 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#ef4444]/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#db2777]/15 rounded-full blur-3xl animate-pulse delay-500" />
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
              {view === 'resuming' ? 'Welcome back' : view === 'fast' ? 'Welcome back' : 'Enter your company code to sign in'}
            </p>
          </div>

          {/* Auto sign-in — valid remembered session found, heading to the dashboard */}
          {view === 'resuming' && (
            <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
              <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
              <p className="text-slate-300 text-sm font-medium">Signing you back in…</p>
            </div>
          )}

          {/* Remembered PLATFORM-OWNER session: explicit, labeled entry into
              the owner console — never a silent forward. Rendered above the
              company fast-path so the founder can still pick either door. */}
          {platformSession && view !== 'resuming' && (
            <button
              type="button"
              onClick={() => { setView('resuming'); router.replace('/dashboard/platform'); }}
              className="mb-3 w-full min-h-[56px] py-4 px-5 rounded-xl border border-white/25 bg-white/10 hover:bg-white/15 text-white font-bold text-sm tracking-wide flex items-center justify-center gap-3 transition-all"
            >
              <PontifexLogoMark />
              <span className="leading-snug">Continue to Pontifex Platform Hub</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* Fast path — returning user: one tap back to their company's login */}
          {view === 'fast' && lastCompany && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleContinue}
                disabled={continuing}
                className="w-full min-h-[56px] py-4 px-5 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#EF4444] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm tracking-wide flex items-center justify-center gap-3 transition-all shadow-lg shadow-fuchsia-900/40"
              >
                {continuing ? (
                  <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Opening sign in…</>
                ) : (
                  <>
                    {lastCompany.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={lastCompany.logoUrl}
                        alt=""
                        className="w-7 h-7 rounded-lg object-contain bg-white/90 shrink-0"
                      />
                    ) : (
                      <Building2 className="w-5 h-5 shrink-0" />
                    )}
                    <span className="leading-snug">Continue to {lastCompany.name}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setView('form')}
                className="w-full min-h-[44px] py-3 text-sm text-slate-400 hover:text-slate-200 font-medium transition-colors"
              >
                Use a different company
              </button>
            </div>
          )}

          {view === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-400" />
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\s/g, '').toUpperCase()); setError(null); }}
                placeholder="COMPANY CODE"
                autoComplete="organization"
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-500 font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 transition-all uppercase"
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
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#EF4444] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-900/40"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Looking up company…</>
              ) : (
                <>Continue <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
          )}

          {/* Pre-hydration placeholder — keeps the card from collapsing for one frame */}
          {view === 'pending' && <div className="h-[120px]" aria-hidden="true" />}

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
