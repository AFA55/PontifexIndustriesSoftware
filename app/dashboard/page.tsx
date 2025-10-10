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
          <stop stopColor="#dc2626" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e40af" />
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200 rounded-full opacity-5 blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Modern Glass Morphism Header */}
      <div className="backdrop-blur-xl bg-white/70 border-b border-white/20 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Pontifex Logo with Animation */}
            <div className="transform hover:scale-105 transition-transform duration-200">
              <PontifexLogo className="h-10 text-foreground" />
            </div>

            {/* Modern Profile Section */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                  {user?.name?.charAt(0) || 'D'}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{user?.name || 'Demo Operator'}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role || 'Operator'}</p>
                </div>
              </div>

              {/* Premium Logout Button */}
              <button
                onClick={handleLogout}
                className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        {/* Modern Animated Greeting */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-block">
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-red-600 bg-clip-text text-transparent mb-3 animate-gradient">
              Welcome back, {user?.name?.split(' ')[0] || 'Demo'}!
            </h1>
            <p className="text-gray-600 text-lg font-light">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Quick Stats Bar */}
          <div className="flex justify-center gap-8 mt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">4</p>
              <p className="text-sm text-gray-500">Active Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">8.5</p>
              <p className="text-sm text-gray-500">Hours Today</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-indigo-600">92%</p>
              <p className="text-sm text-gray-500">Efficiency</p>
            </div>
          </div>
        </div>

        {/* Ultra Modern Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">

          {/* Job Schedule - Premium Red Card */}
          <Link
            href="/dashboard/job-schedule"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-red-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] animate-fade-in-up"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-6 group-hover:bg-transparent transition-colors duration-500">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="px-3 py-1 bg-red-100 group-hover:bg-white/20 text-red-600 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300">
                  4 ACTIVE
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 group-hover:text-white mb-2 transition-colors duration-300">
                Job Schedule
              </h3>
              <p className="text-gray-600 group-hover:text-white/90 font-medium transition-colors duration-300">
                View today's assignments and routes
              </p>
              <div className="mt-4 flex items-center text-red-600 group-hover:text-white font-semibold transition-colors duration-300">
                <span>Open Schedule</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Tools & Equipment - Premium Blue Card */}
          <Link
            href="/dashboard/tools/my-equipment"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-blue-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] animate-fade-in-up delay-100"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-6 group-hover:bg-transparent transition-colors duration-500">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="px-3 py-1 bg-blue-100 group-hover:bg-white/20 text-blue-600 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300">
                  READY
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 group-hover:text-white mb-2 transition-colors duration-300">
                Tools & Equipment
              </h3>
              <p className="text-gray-600 group-hover:text-white/90 font-medium transition-colors duration-300">
                Manage and track your equipment
              </p>
              <div className="mt-4 flex items-center text-blue-600 group-hover:text-white font-semibold transition-colors duration-300">
                <span>Manage Tools</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* View Timecard - Premium Indigo Card */}
          <button className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-indigo-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] text-left animate-fade-in-up delay-200">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-6 group-hover:bg-transparent transition-colors duration-500">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="px-3 py-1 bg-indigo-100 group-hover:bg-white/20 text-indigo-600 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300">
                  40.5 HRS
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 group-hover:text-white mb-2 transition-colors duration-300">
                View Timecard
              </h3>
              <p className="text-gray-600 group-hover:text-white/90 font-medium transition-colors duration-300">
                Check hours and attendance
              </p>
              <div className="mt-4 flex items-center text-indigo-600 group-hover:text-white font-semibold transition-colors duration-300">
                <span>View Hours</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </button>

          {/* Request Time Off - Premium Gray Card */}
          <button className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-gray-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] text-left animate-fade-in-up delay-300">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-6 group-hover:bg-transparent transition-colors duration-500">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gray-500 to-gray-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="px-3 py-1 bg-gray-100 group-hover:bg-white/20 text-gray-600 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300">
                  2 DAYS
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 group-hover:text-white mb-2 transition-colors duration-300">
                Request Time Off
              </h3>
              <p className="text-gray-600 group-hover:text-white/90 font-medium transition-colors duration-300">
                Submit vacation requests
              </p>
              <div className="mt-4 flex items-center text-gray-600 group-hover:text-white font-semibold transition-colors duration-300">
                <span>Request Leave</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="mt-10 max-w-5xl mx-auto">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 shadow-lg border border-gray-100">
            <p className="text-sm font-semibold text-gray-500 mb-3">QUICK ACTIONS</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl font-medium whitespace-nowrap transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Clock In
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-xl font-medium whitespace-nowrap transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Notifications
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-xl font-medium whitespace-nowrap transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Reports
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl font-medium whitespace-nowrap transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Messages
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add custom animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }

        .delay-100 {
          animation-delay: 100ms;
        }

        .delay-200 {
          animation-delay: 200ms;
        }

        .delay-300 {
          animation-delay: 300ms;
        }

        .delay-1000 {
          animation-delay: 1s;
        }

        .delay-2000 {
          animation-delay: 2s;
        }

        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}