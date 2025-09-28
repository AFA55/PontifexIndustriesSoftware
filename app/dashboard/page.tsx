'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, isAdmin, type User } from '@/lib/auth';

// Pontifex Industries Logo Component
function PontifexLogo({ className = "h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 250 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* P Letter with Geometric Design */}
      <g>
        {/* Outer P Shape */}
        <path
          d="M20 15L35 5L50 15L50 35L35 45L20 35L20 25L35 25L35 35L42 30L42 20L35 15L28 20L28 30L20 25V15Z"
          fill="url(#pontifex-gradient)"
        />
        {/* Inner geometric elements */}
        <path
          d="M25 20L30 17L35 20L35 25L30 28L25 25V20Z"
          fill="currentColor"
          opacity="0.3"
        />
      </g>

      {/* PONTIFEX Text */}
      <g fill="currentColor">
        <text x="65" y="25" className="text-lg font-bold" style={{fontSize: '18px', fontFamily: 'Inter, sans-serif'}}>
          PONTIFEX
        </text>
        <text x="65" y="45" className="text-sm" style={{fontSize: '12px', fontFamily: 'Inter, sans-serif', opacity: '0.8'}}>
          INDUSTRIES
        </text>
      </g>

      <defs>
        <linearGradient id="pontifex-gradient" x1="20" y1="5" x2="50" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A73E8" />
          <stop offset="0.5" stopColor="#0891b2" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    console.log('🔍 Checking authentication status...');
    const currentUser = getCurrentUser();

    if (!currentUser) {
      console.log('❌ No authenticated user found, redirecting to login...');
      router.push('/login');
      return;
    }

    console.log('✅ User authenticated:', currentUser);

    // Redirect based on role
    if (currentUser.role === 'admin') {
      console.log('🔑 Admin user, redirecting to admin dashboard...');
      router.push('/admin');
      return;
    }

    // For operator or default, stay on this dashboard
    setUser(currentUser);
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    console.log('🚪 Logging out user...');
    logout();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Modern Mobile-First Header */}
      <div className="bg-surface border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Pontifex Logo */}
            <PontifexLogo className="h-8 text-foreground" />

            {/* Logout Button - Mobile Optimized */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 bg-error/10 hover:bg-error/20 text-error rounded-xl transition-all duration-200 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Personal Greeting */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Hi, {user?.name?.split(' ')[0] || 'Demo'}! 👋
          </h1>
          <p className="text-text-secondary text-lg">
            Ready to get to work?
          </p>
        </div>

        {/* Modern Button Grid - Red, White, Blue Theme */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">

          {/* Job Schedule - Red Theme */}
          <Link
            href="/dashboard/job-schedule"
            className="group relative overflow-hidden bg-gradient-to-br from-red-50 to-red-100 hover:from-red-100 hover:to-red-200 border-2 border-red-200 hover:border-red-300 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-red-500 group-hover:bg-red-600 rounded-xl flex items-center justify-center transition-colors shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-800 mb-1">Job Schedule</h3>
                <p className="text-red-600 text-sm font-medium">View your daily assignments</p>
              </div>
            </div>
          </Link>

          {/* Tools & Equipment - Blue Theme */}
          <Link
            href="/dashboard/tools/my-equipment"
            className="group relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-200 hover:border-blue-300 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-500 group-hover:bg-blue-600 rounded-xl flex items-center justify-center transition-colors shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-blue-800 mb-1">Tools & Equipment</h3>
                <p className="text-blue-600 text-sm font-medium">Manage your equipment</p>
              </div>
            </div>
          </Link>

          {/* View Timecard - Navy Theme */}
          <button className="group relative overflow-hidden bg-gradient-to-br from-indigo-50 to-indigo-100 hover:from-indigo-100 hover:to-indigo-200 border-2 border-indigo-200 hover:border-indigo-300 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl text-left">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-indigo-600 group-hover:bg-indigo-700 rounded-xl flex items-center justify-center transition-colors shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-indigo-800 mb-1">View Timecard</h3>
                <p className="text-indigo-600 text-sm font-medium">Check your hours</p>
              </div>
            </div>
          </button>

          {/* Request Time Off - Gray/White Theme */}
          <button className="group relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 border-2 border-gray-200 hover:border-gray-300 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl text-left">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-600 group-hover:bg-gray-700 rounded-xl flex items-center justify-center transition-colors shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4-4m0 0l-4 4m4-4v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-1">Request Time Off</h3>
                <p className="text-gray-600 text-sm font-medium">Submit time-off requests</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}