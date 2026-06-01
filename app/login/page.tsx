'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Mail, Lock, ChevronDown, ChevronUp, Shield, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBranding } from '@/lib/branding-context';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { label: 'Admin',      name: 'Demo Admin', email: 'admin@pontifex.com',      password: 'PontifexDemo2026!', color: 'violet' },
  { label: 'Supervisor', name: 'David',      email: 'supervisor@pontifex.com', password: 'PontifexDemo2026!', color: 'amber' },
  { label: 'Operator',   name: 'Zack',  email: 'zack@demopontifex.com',  password: 'Patriot2026!', color: 'blue' },
  { label: 'Operator',   name: 'Aiden', email: 'aiden@demopontifex.com', password: 'Patriot2026!', color: 'blue' },
  { label: 'Helper',     name: 'Lucas', email: 'lucas@demopontifex.com', password: 'Patriot2026!', color: 'emerald' },
  { label: 'Helper',     name: 'Javi',  email: 'javi@demopontifex.com',  password: 'Patriot2026!', color: 'emerald' },
  { label: 'Shop Hand',  name: 'Mechanic', email: 'shophelp@pontifex.com', password: 'Help1234!', color: 'teal' },
];
// per-color Tailwind classes (literal strings so Tailwind keeps them in the build)
const DEMO_COLORS: Record<string, { wrap: string; text: string; badge: string }> = {
  blue:    { wrap: 'bg-blue-50 border-blue-200 hover:border-blue-300',       text: 'text-blue-600',    badge: 'bg-blue-100 text-blue-700' },
  emerald: { wrap: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  violet:  { wrap: 'bg-violet-50 border-violet-200 hover:border-violet-300',  text: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700' },
  amber:   { wrap: 'bg-amber-50 border-amber-200 hover:border-amber-300',     text: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700' },
  teal:    { wrap: 'bg-teal-50 border-teal-200 hover:border-teal-300',       text: 'text-teal-600',    badge: 'bg-teal-100 text-teal-700' },
};
const DEMO_GATE_PASSWORD = 'PontifexDemo2026';

function LoginPageInner() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoGateInput, setDemoGateInput] = useState('');
  const [demoGateError, setDemoGateError] = useState(false);
  const [demoUnlocked, setDemoUnlocked] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [tenantBranding, setTenantBranding] = useState<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenant_id');
  const { branding: contextBranding } = useBranding();
  const branding = tenantBranding || contextBranding;

  // Redirect to company-login if no tenant_id param
  useEffect(() => {
    if (!tenantId) {
      router.replace('/company-login');
    }
  }, [tenantId, router]);

  // Fetch branding for the specific tenant from the URL param
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/admin/branding?tenant_id=${tenantId}`)
      .then(r => r.json())
      .then(json => { if (json.success && json.data) setTenantBranding(json.data); })
      .catch(() => {});
  }, [tenantId]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    console.log('🚀 Starting login process...');
    setLoading(true);
    setError(null);

    try {
      // Call our custom login API that bypasses RLS
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.log('❌ Login failed:', result.error);
        setError(result.error || 'Login failed');
        setLoading(false);
        return;
      }

      console.log('✅ Login successful!');
      console.log('👤 User:', result.user);

      // Set the session in the client
      if (result.session) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      // Store user data in localStorage for dashboard access
      localStorage.setItem('supabase-user', JSON.stringify({
        id: result.user.id,
        name: result.user.full_name,
        email: result.user.email,
        role: result.user.role,
      }));
      console.log('💾 User stored in localStorage');

      // Redirect based on user role.
      // Office + shop roles land on the admin dashboard (which then renders a
      // role-specific branch). Operators + apprentices land on the field dashboard.
      if (['admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager'].includes(result.user.role)) {
        router.push('/dashboard/admin');
      } else if (['operator', 'apprentice'].includes(result.user.role)) {
        router.push('/dashboard');
      } else {
        setError('Invalid user role');
        setLoading(false);
      }
      // Keep loading state true during navigation - it will unmount anyway
    } catch (err: any) {
      console.error('💥 Unexpected login error:', err);
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setError('Cannot connect to server. Please check your connection or try again.');
      } else {
        setError('An unexpected error occurred');
      }
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: `linear-gradient(to bottom right, ${branding.login_bg_gradient_from || '#0f172a'}, ${branding.login_bg_gradient_to || '#1e1b4b'})`,
      }}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 backdrop-blur-xl bg-white/95 rounded-3xl shadow-2xl p-5 sm:p-8 w-full max-w-md border border-gray-200"
      >
        {/* Logo and Header */}
        <div className="flex flex-col items-center mb-4 sm:mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex flex-col items-center"
          >
            {/* Tenant logo (loaded after company code entered) → else Pontifex platform logo */}
            <img
              src={branding.logo_icon_url || branding.logo_url || '/logo.svg'}
              alt={branding.company_name || 'Pontifex Industries'}
              className="h-14 w-14 sm:h-20 sm:w-20 object-contain rounded-2xl rounded-xl"
            />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-700 to-red-700 bg-clip-text text-transparent mt-3 mb-1 sm:mt-6 sm:mb-2 tracking-tight"
          >
            {branding.login_welcome_text || 'Welcome Back'}
          </motion.h1>
          <p className="text-gray-600 text-sm font-medium">{branding.tagline || 'Concrete Cutting Management System'}</p>
          {tenantId && (
            <Link href="/company-login" className="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-3 h-3" /> Change company
            </Link>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-5">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="relative group"
          >
            <Mail className="absolute left-4 top-3.5 sm:top-4 text-blue-600 group-focus-within:text-blue-700 transition-colors" size={20} />
            <input
              type="email"
              placeholder="Email"
              {...register('email')}
              className="w-full pl-12 pr-4 py-3 sm:py-4 rounded-xl bg-white border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all duration-200 text-gray-800 placeholder-gray-400"
              autoComplete="email"
              required
            />
          </motion.div>

          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="relative group"
          >
            <Lock className="absolute left-4 top-3.5 sm:top-4 text-blue-600 group-focus-within:text-blue-700 transition-colors" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              {...register('password')}
              className="w-full pl-12 pr-12 py-3 sm:py-4 rounded-xl bg-white border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all duration-200 text-gray-800 placeholder-gray-400"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-4 top-3.5 sm:top-4 text-gray-400 hover:text-blue-600 focus:outline-none transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-between text-sm"
          >
            <label className="flex items-center gap-2 text-gray-600 cursor-pointer hover:text-gray-800 transition-colors">
              <input type="checkbox" {...register('remember')} className="w-4 h-4 accent-blue-600 rounded" />
              <span>Remember me</span>
            </label>
            <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Forgot password?
            </Link>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            type="submit"
            className="w-full py-3 sm:py-4 rounded-xl text-white font-bold shadow-xl hover:shadow-2xl transition-all duration-300 focus:ring-4 focus:ring-blue-500/30 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: `linear-gradient(to right, ${branding.primary_color || '#2563eb'}, ${branding.secondary_color || '#dc2626'})`,
            }}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </span>
            ) : 'Sign In'}
          </motion.button>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center"
          >
            <Link href="/request-access" className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors">
              Need access? Request Login
            </Link>
          </motion.div>
        </form>

        {/* Demo Access — password-gated dropdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-3 sm:mt-6"
        >
          <button
            type="button"
            onClick={() => { setDemoOpen(o => !o); setDemoGateError(false); }}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              Demo Account Access
            </span>
            {demoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {demoOpen && (
            <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
              {!demoUnlocked ? (
                /* Gate: require access code */
                <div>
                  <p className="text-xs text-gray-500 mb-3 text-center">Enter the demo access code to view credentials</p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={demoGateInput}
                      onChange={e => { setDemoGateInput(e.target.value); setDemoGateError(false); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (demoGateInput === DEMO_GATE_PASSWORD) { setDemoUnlocked(true); setDemoGateError(false); }
                          else setDemoGateError(true);
                        }
                      }}
                      placeholder="Access code"
                      className={`flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 ${demoGateError ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (demoGateInput === DEMO_GATE_PASSWORD) { setDemoUnlocked(true); setDemoGateError(false); }
                        else setDemoGateError(true);
                      }}
                      className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Unlock
                    </button>
                  </div>
                  {demoGateError && <p className="text-xs text-red-500 mt-1">Incorrect access code</p>}
                </div>
              ) : (
                /* Unlocked: show demo accounts */
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Demo Accounts — tap one to auto-fill &amp; sign in</p>
                  {DEMO_ACCOUNTS.map(acc => {
                    const c = DEMO_COLORS[acc.color] ?? DEMO_COLORS.blue;
                    return (
                    <div
                      key={acc.email}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${c.wrap}`}
                      onClick={() => {
                        setValue('email', acc.email, { shouldValidate: true });
                        setValue('password', acc.password, { shouldValidate: true });
                        setCopiedEmail(acc.email);
                        setTimeout(() => { setCopiedEmail(null); setDemoOpen(false); }, 1000);
                      }}
                    >
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${c.text}`}>
                          {acc.label} — {acc.name}
                        </p>
                        <p className="text-xs font-mono text-gray-700">{acc.email}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                        copiedEmail === acc.email ? 'bg-green-500 text-white' : c.badge
                      }`}>
                        {copiedEmail === acc.email ? '✓ Filled!' : 'Use this account'}
                      </span>
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { setDemoUnlocked(false); setDemoGateInput(''); }}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1 transition-colors"
                  >
                    Lock credentials
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function Logo() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="p-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A73E8" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="#ffffff" stroke="#1e293b" strokeWidth="2" />
      <path d="M14 34V14h12a8 8 0 1 1 0 16H22v4" stroke="url(#p-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
