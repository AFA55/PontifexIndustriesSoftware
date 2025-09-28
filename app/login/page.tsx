'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { checkCredentials } from '@/lib/auth';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    console.log('🚀 Starting login process...');
    setLoading(true);
    setError(null);
    
    try {
      const result = await checkCredentials(data.email, data.password);
      
      if (result.success) {
        console.log('✅ Login successful, redirecting to dashboard...');
        router.push('/dashboard');
      } else {
        console.log('❌ Login failed:', result.error);
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      console.error('💥 Unexpected login error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-sm bg-surface/95 rounded-2xl shadow-2xl border border-border p-8 w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <h1 className="text-3xl font-bold text-foreground mt-4 mb-2 tracking-tight">Pontifex Industry Software</h1>
          <p className="text-text-secondary text-sm">Concrete Cutting Management System</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-primary" size={20} />
            <input
              type="email"
              placeholder="Email"
              {...register('email')}
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-surface border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200"
              autoComplete="email"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-primary" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              {...register('password')}
              className="w-full pl-10 pr-10 py-3 rounded-lg bg-surface border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-3 text-text-secondary hover:text-primary focus:outline-none transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-text-secondary">
              <input type="checkbox" {...register('remember')} className="accent-primary rounded" /> Remember me
            </label>
            <a href="#" className="text-primary hover:text-accent transition-colors">Forgot password?</a>
          </div>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="text-center mt-4">
            <Link href="/request-login" className="text-primary hover:text-accent text-sm transition-colors">
              Need access? Request Login
            </Link>
          </div>
        </form>
        
        {/* Demo Credentials Info */}
        <div className="mt-6 p-4 bg-surface border border-border rounded-xl">
          <h3 className="text-foreground font-medium text-sm mb-3">Demo Accounts</h3>

          {/* Operator Account */}
          <div className="mb-4 p-3 bg-background rounded-lg border border-border">
            <h4 className="text-accent font-medium text-xs mb-1">OPERATOR DASHBOARD</h4>
            <div className="text-xs text-text-secondary space-y-1">
              <div><span className="text-primary font-medium">Email:</span> demo@pontifex.com</div>
              <div><span className="text-primary font-medium">Password:</span> Demo1234!</div>
            </div>
          </div>

          {/* Admin Account */}
          <div className="p-3 bg-background rounded-lg border border-border">
            <h4 className="text-warning font-medium text-xs mb-1">ADMIN DASHBOARD</h4>
            <div className="text-xs text-text-secondary space-y-1">
              <div><span className="text-primary font-medium">Email:</span> admin@pontifex.com</div>
              <div><span className="text-primary font-medium">Password:</span> Admin1234!</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
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
