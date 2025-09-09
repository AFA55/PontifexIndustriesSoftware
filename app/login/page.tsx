'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
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
  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setLoading(false);
    if (error) setError(error.message);
    // else redirect to dashboard
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-900 via-blue-900 to-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/60 backdrop-blur-lg rounded-2xl shadow-2xl p-8 w-full max-w-md border border-blue-800"
      >
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <h1 className="text-3xl font-bold text-cyan-400 mt-4 mb-2 tracking-tight">Pontifex Industry Software</h1>
          <p className="text-gray-300 text-sm">Concrete Cutting Management System</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-cyan-400" size={20} />
            <input
              type="email"
              placeholder="Email"
              {...register('email')}
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-900/80 text-white border border-gray-700 focus:border-cyan-400 focus:outline-none"
              autoComplete="email"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-cyan-400" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              {...register('password')}
              className="w-full pl-10 pr-10 py-3 rounded-lg bg-gray-900/80 text-white border border-gray-700 focus:border-cyan-400 focus:outline-none"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-3 text-cyan-400 focus:outline-none"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-gray-300">
              <input type="checkbox" {...register('remember')} className="accent-cyan-400" /> Remember me
            </label>
            <a href="#" className="text-cyan-400 hover:underline">Forgot password?</a>
          </div>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold shadow-lg hover:from-cyan-600 hover:to-blue-600 transition"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="p-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#06b6d4" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="#0f172a" />
      <path d="M14 34V14h12a8 8 0 1 1 0 16H22v4" stroke="url(#p-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
