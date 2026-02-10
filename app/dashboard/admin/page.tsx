'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, logout, isAdmin, type User } from '@/lib/auth';
import AdminOnboardingTour from '@/components/AdminOnboardingTour';

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

interface QuickStats {
  activeJobs: number;
  crewsWorking: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<QuickStats>({
    activeJobs: 0,
    crewsWorking: 0,
  });
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);

  useEffect(() => {
    console.log('🔍 Checking admin access...');
    const currentUser = getCurrentUser();

    if (!currentUser) {
      console.log('❌ No authenticated user found, redirecting to login...');
      router.push('/login');
      return;
    }

    if (currentUser.role !== 'admin') {
      console.log('🚫 User is not admin, redirecting to operator dashboard...');
      router.push('/dashboard');
      return;
    }

    console.log('✅ Admin access granted');
    setUser(currentUser);

    // Check if this is demo admin account
    const isDemo = currentUser.email?.toLowerCase().includes('demo') ||
                   currentUser.email === 'admin@demo.com' ||
                   currentUser.email === 'admin@pontifex.com';
    setIsDemoAdmin(isDemo);

    // Show walkthrough for demo admin on first visit
    if (isDemo) {
      checkOnboardingStatus(currentUser.id);
    }

    setLoading(false);
    fetchDashboardStats();
  }, [router]);

  const checkOnboardingStatus = async (userId: string) => {
    try {
      // Check if walkthrough was already shown in this session
      const shownThisSession = sessionStorage.getItem('admin-walkthrough-shown-this-session');
      if (shownThisSession === 'true') {
        return; // Don't show again in the same session
      }

      const response = await fetch(`/api/onboarding?userId=${userId}&type=admin`);
      const data = await response.json();

      if (!data.hasCompleted && !data.hasSkipped) {
        setShowWalkthrough(true);
        // Mark as shown for this session
        sessionStorage.setItem('admin-walkthrough-shown-this-session', 'true');
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      // Fallback to localStorage
      const hasSeenWalkthrough = localStorage.getItem('demo-admin-walkthrough-seen');
      const shownThisSession = sessionStorage.getItem('admin-walkthrough-shown-this-session');
      if (!hasSeenWalkthrough && shownThisSession !== 'true') {
        setShowWalkthrough(true);
        sessionStorage.setItem('admin-walkthrough-shown-this-session', 'true');
      }
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn('⚠️ No active session found - session may have expired. Redirecting to login...');
        localStorage.removeItem('supabase-user');
        localStorage.removeItem('pontifex-user');
        window.location.href = '/login';
        return;
      }

      // Fetch active jobs for today
      const today = new Date().toISOString().split('T')[0];
      const { data: jobs } = await supabase
        .from('job_orders')
        .select('id, status, scheduled_date')
        .eq('scheduled_date', today)
        .neq('status', 'completed')
        .neq('status', 'cancelled');

      // Fetch operators currently working via admin API (handles RLS + correct table)
      let uniqueOperators = 0;
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          const res = await fetch('/api/admin/operators/active', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            uniqueOperators = json.data?.summary?.totalActive || 0;
          }
        }
      } catch {
        // Silently default to 0 — no operators active
      }

      setStats({
        activeJobs: jobs?.length || 0,
        crewsWorking: uniqueOperators,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    console.log('🚪 Admin logging out...');
    logout();
    router.push('/login');
  };

  const markWalkthroughComplete = () => {
    localStorage.setItem('demo-admin-walkthrough-seen', 'true');
    setShowWalkthrough(false);
  };

  // Check if card should be accessible for demo admin
  const isCardAccessible = (moduleTitle: string) => {
    if (!isDemoAdmin) return true; // Full access for real admins

    const accessibleCards = [
      'Dispatch & Scheduling',
      'Schedule Board',
      'Completed Job Tickets',
      'Operator Profiles',
      'Access Requests',
      'Team Management'
    ];

    return accessibleCards.includes(moduleTitle);
  };

  const adminModules = [
    {
      title: 'Dispatch & Scheduling',
      description: 'Create and manage job orders for operators',
      icon: '🚚',
      href: '/dashboard/admin/dispatch-scheduling',
      bgColor: 'from-orange-500 to-red-600',
      iconBg: 'bg-orange-500',
      features: ['Create job orders', 'Assign operators', 'Schedule jobs', 'Equipment tracking'],
      status: 'active'
    },
    {
      title: 'Schedule Board',
      description: 'View operator schedules and send schedule notifications',
      icon: '📅',
      href: '/dashboard/admin/schedule-board',
      bgColor: 'from-purple-500 to-indigo-600',
      iconBg: 'bg-purple-500',
      features: ['View all schedules', 'Send email notifications', 'Shop arrival times', 'Daily overview'],
      status: 'active'
    },
    {
      title: 'Team Management',
      description: 'Create accounts and manage team member access permissions',
      icon: '👥',
      href: '/dashboard/admin/team-management',
      bgColor: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-500',
      features: ['Create user accounts', 'Role-based access', 'Permission settings', 'Team directory'],
      status: 'active'
    },
    {
      title: 'Access Requests',
      description: 'Review and approve user access requests',
      icon: '🔐',
      href: '/dashboard/admin/access-requests',
      bgColor: 'from-cyan-500 to-blue-600',
      iconBg: 'bg-cyan-500',
      features: ['Pending requests', 'Approve/Deny access', 'Role assignment', 'Request history'],
      status: 'active'
    },
    {
      title: 'Analytics & Reports',
      description: 'Comprehensive business analytics and reporting',
      icon: '📈',
      href: '/dashboard/admin/analytics',
      bgColor: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-500',
      features: ['Project P&L tracking', 'Operator performance', 'Financial KPIs', 'Production metrics'],
      status: 'active'
    },
    {
      title: 'Equipment Performance',
      description: 'Track equipment usage, production rates, and resource efficiency',
      icon: '🔧',
      href: '/dashboard/admin/equipment-performance',
      bgColor: 'from-teal-500 to-cyan-600',
      iconBg: 'bg-teal-500',
      features: ['Production rates', 'Difficulty analysis', 'Resource tracking', 'Operator rankings'],
      status: 'active'
    },
    {
      title: 'Operator Profiles',
      description: 'Manage operator skills, costs, and certifications',
      icon: '👤',
      href: '/dashboard/admin/operator-profiles',
      bgColor: 'from-blue-500 to-indigo-600',
      iconBg: 'bg-blue-500',
      features: ['Set hourly rates', 'Track skills & certifications', 'Production analytics', 'Task qualifications'],
      status: 'active'
    },
    {
      title: 'Completed Job Tickets',
      description: 'View completed jobs with customer signatures and documents',
      icon: '✅',
      href: '/dashboard/admin/completed-job-tickets',
      bgColor: 'from-green-500 to-emerald-600',
      iconBg: 'bg-green-500',
      features: ['Signed job tickets', 'Customer feedback', 'Legal documents', 'Job analytics'],
      status: 'active'
    },
    {
      title: 'Blade & Bit Management',
      description: 'Track blade/bit stock levels and assign to operators',
      icon: '🔪',
      href: '/dashboard/inventory',
      bgColor: 'from-indigo-500 to-purple-600',
      iconBg: 'bg-indigo-500',
      features: ['Stock tracking', 'QR code scanning', 'Assign to operators', 'Low stock alerts'],
      status: 'active'
    },
    {
      title: 'Tools & Equipment',
      description: 'View all equipment across operators and manage inventory',
      icon: '⚙️',
      href: '/dashboard/admin/all-equipment',
      bgColor: 'from-purple-500 to-pink-600',
      iconBg: 'bg-purple-500',
      features: ['View all equipment', 'Search by operator', 'Equipment status', 'Assignment tracking'],
      status: 'active'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full opacity-5 blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Modern Header with Professional Gradient */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 border-b border-blue-800 sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Pontifex Logo with Animation */}
            <div className="transform hover:scale-105 transition-transform duration-200">
              <PontifexLogo className="h-10 text-white" />
            </div>

            {/* Modern Profile Section */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-lg px-4 py-2 rounded-xl border border-white/20">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-white/30">
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-blue-200 capitalize font-medium">Super Admin</p>
                </div>
              </div>

              {/* Operator View Button */}
              <Link
                href="/dashboard"
                className="px-4 py-2.5 bg-white/10 backdrop-blur-lg hover:bg-white/20 text-white rounded-xl transition-all font-semibold shadow-md hover:shadow-lg flex items-center gap-2 border border-white/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Operator View</span>
              </Link>

              {/* Premium Logout Button */}
              <button
                onClick={handleLogout}
                className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 via-red-600 to-pink-600 hover:from-red-600 hover:via-red-700 hover:to-pink-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
              >
                <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        {/* Modern Animated Greeting */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-block">
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3 animate-gradient drop-shadow-sm">
              Welcome back, {user?.name?.split(' ')[0] || 'Super'}!
            </h1>
            <p className="text-gray-700 text-lg font-medium">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Quick Stats Bar with Professional Gradients */}
          <div className="flex justify-center gap-6 mt-8">
            <Link
              href="/dashboard/admin/debug/active-jobs"
              className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl p-6 shadow-xl min-w-[140px] transform hover:scale-105 transition-all cursor-pointer group"
            >
              <p className="text-4xl font-bold text-white drop-shadow-lg">{stats.activeJobs}</p>
              <p className="text-sm text-white/90 font-semibold mt-1">Active Jobs</p>
              <p className="text-xs text-white/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Click to debug</p>
            </Link>
            <div className="bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-2xl p-6 shadow-xl min-w-[140px] transform hover:scale-105 transition-all">
              <p className="text-4xl font-bold text-white drop-shadow-lg">{stats.crewsWorking}</p>
              <p className="text-sm text-white/90 font-semibold mt-1">Crews Working</p>
            </div>
          </div>
        </div>

        {/* Admin Modules Grid — accessible cards first, blurred cards at bottom */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {[...adminModules].sort((a, b) => {
            const aAccessible = isCardAccessible(a.title) ? 0 : 1;
            const bAccessible = isCardAccessible(b.title) ? 0 : 1;
            return aAccessible - bAccessible;
          }).map((module, index) => {
            const isActive = module.status === 'active';
            const isAccessible = isCardAccessible(module.title);
            const isBlurred = isDemoAdmin && !isAccessible;

            const cardContent = (
              <>
                <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 ${isActive ? 'group-hover:opacity-100' : ''} transition-opacity duration-500 rounded-3xl`}></div>
                <div className={`relative bg-white rounded-[22px] p-6 ${isActive ? 'group-hover:bg-transparent' : ''} transition-colors duration-500`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-14 h-14 bg-gradient-to-br ${module.bgColor} rounded-2xl flex items-center justify-center shadow-lg ${isActive ? 'group-hover:shadow-xl transform group-hover:rotate-6' : ''} transition-all duration-300`}>
                      <span className="text-3xl">{module.icon}</span>
                    </div>
                    <span className={`px-3 py-1 ${
                      module.status === 'coming-soon'
                        ? 'bg-gray-100 text-gray-600'
                        : `${module.iconBg.replace('bg-', 'bg-')}/10 text-${module.iconBg.split('-')[1]}-600`
                    } ${isActive ? 'group-hover:bg-white/20 group-hover:text-white' : ''} text-xs font-bold rounded-full transition-all duration-300`}>
                      {module.status === 'coming-soon' ? 'COMING SOON' : 'ACTIVE'}
                    </span>
                  </div>
                  <h3 className={`text-2xl font-bold text-gray-800 ${isActive ? 'group-hover:text-white' : ''} mb-2 transition-colors duration-300`}>
                    {module.title}
                  </h3>
                  <p className={`text-gray-600 ${isActive ? 'group-hover:text-white/90' : ''} font-medium transition-colors duration-300 mb-4`}>
                    {module.description}
                  </p>
                  {isActive && (
                    <div className={`flex items-center ${
                      module.bgColor === 'from-orange-500 to-red-600' ? 'text-orange-600' :
                      module.bgColor === 'from-red-500 to-red-600' ? 'text-red-600' :
                      module.bgColor === 'from-blue-500 to-blue-600' ? 'text-blue-600' :
                      module.bgColor === 'from-green-500 to-emerald-600' ? 'text-green-600' :
                      module.bgColor === 'from-purple-500 to-purple-600' ? 'text-purple-600' :
                      'text-gray-600'
                    } group-hover:text-white font-semibold transition-colors duration-300`}>
                      <span>Open Module</span>
                      <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  )}
                </div>
              </>
            );

            // Only render active modules
            if (!isActive) return null;

            // If accessible, render as clickable link
            if (isAccessible) {
              return (
                <Link
                  key={index}
                  href={module.href}
                  className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white ${
                    module.bgColor === 'from-orange-500 to-red-600' ? 'to-red-50' :
                    module.bgColor === 'from-gray-500 to-gray-600' ? 'to-gray-50' :
                    module.bgColor === 'from-red-500 to-red-600' ? 'to-red-50' :
                    module.bgColor === 'from-blue-500 to-blue-600' ? 'to-blue-50' :
                    module.bgColor === 'from-green-500 to-emerald-600' ? 'to-green-50' :
                    module.bgColor === 'from-purple-500 to-purple-600' ? 'to-purple-50' :
                    'to-gray-50'
                  } p-1 shadow-xl hover:shadow-2xl hover:scale-[1.02] cursor-pointer animate-fade-in-up transition-all duration-500`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {cardContent}
                </Link>
              );
            }

            // If not accessible (blurred for demo), render as non-clickable div
            return (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white ${
                  module.bgColor === 'from-orange-500 to-red-600' ? 'to-red-50' :
                  module.bgColor === 'from-gray-500 to-gray-600' ? 'to-gray-50' :
                  module.bgColor === 'from-red-500 to-red-600' ? 'to-red-50' :
                  module.bgColor === 'from-blue-500 to-blue-600' ? 'to-blue-50' :
                  module.bgColor === 'from-green-500 to-emerald-600' ? 'to-green-50' :
                  module.bgColor === 'from-purple-500 to-purple-600' ? 'to-purple-50' :
                  'to-gray-50'
                } p-1 shadow-xl blur-sm opacity-50 cursor-not-allowed animate-fade-in-up transition-all duration-500`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {cardContent}
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm rounded-3xl">
                  <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg">
                    <p className="text-sm font-semibold text-gray-700">Available in Full Version</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Admin Onboarding Tour */}
      {showWalkthrough && isDemoAdmin && user && (
        <AdminOnboardingTour userId={user.id} onComplete={markWalkthroughComplete} />
      )}

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