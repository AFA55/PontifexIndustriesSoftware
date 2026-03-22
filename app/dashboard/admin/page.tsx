'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, logout, isAdmin, type User } from '@/lib/auth';
import AdminOnboardingTour from '@/components/AdminOnboardingTour';
import {
  ADMIN_CARDS,
  ADMIN_DASHBOARD_ROLES,
  BYPASS_ROLES,
  getCardPermission,
  type PermissionLevel,
} from '@/lib/rbac';
import { useBranding } from '@/lib/branding-context';

// Dynamic Logo Component — uses branding if available
function BrandedLogo({ className = "h-8", logoUrl, companyName }: { className?: string; logoUrl?: string | null; companyName?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={companyName || 'Company Logo'} className={`${className} w-auto object-contain`} />;
  }
  return (
    <svg
      className={className}
      viewBox="0 0 250 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <path
          d="M20 15L35 5L50 15L50 35L35 45L20 35L20 25L35 25L35 35L42 30L42 20L35 15L28 20L28 30L20 25V15Z"
          fill="url(#patriot-gradient)"
        />
        <path
          d="M25 20L30 17L35 20L35 25L30 28L25 25V20Z"
          fill="currentColor"
          opacity="0.3"
        />
      </g>
      <g fill="currentColor">
        <text x="65" y="25" className="text-lg font-bold" style={{fontSize: '18px', fontFamily: 'Inter, sans-serif'}}>
          {(companyName || 'PONTIFEX').toUpperCase().split(' ')[0]}
        </text>
        <text x="65" y="45" className="text-sm" style={{fontSize: '12px', fontFamily: 'Inter, sans-serif', opacity: '0.8'}}>
          {(companyName || 'PONTIFEX INDUSTRIES').toUpperCase().split(' ').slice(1).join(' ') || 'INDUSTRIES'}
        </text>
      </g>
      <defs>
        <linearGradient id="patriot-gradient" x1="20" y1="5" x2="50" y2="45" gradientUnits="userSpaceOnUse">
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

// Feature flag to card key mapping
const FEATURE_FLAG_CARD_MAP: Record<string, string[]> = {
  show_billing_module: ['billing'],
  show_analytics_module: ['analytics'],
  show_inventory_module: ['blade_inventory', 'tools_equipment', 'equipment_performance'],
  show_customer_crm: ['customer_profiles'],
};

export default function AdminDashboard() {
  const router = useRouter();
  const { branding } = useBranding();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<QuickStats>({
    activeJobs: 0,
    crewsWorking: 0,
  });
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);
  const [userPermissions, setUserPermissions] = useState<Record<string, PermissionLevel> | null>(null);

  useEffect(() => {
    console.log('🔍 Checking admin access...');
    const currentUser = getCurrentUser();

    if (!currentUser) {
      console.log('❌ No authenticated user found, redirecting to login...');
      router.push('/login');
      return;
    }

    if (!ADMIN_DASHBOARD_ROLES.includes(currentUser.role)) {
      console.log('🚫 User does not have admin dashboard access, redirecting to operator dashboard...');
      router.push('/dashboard');
      return;
    }

    console.log('✅ Admin access granted');
    setUser(currentUser);

    // Fetch card permissions for this user
    fetchCardPermissions();

    // Check if this is demo admin account
    const isDemo = currentUser.email?.toLowerCase().includes('demo') ||
                   currentUser.email === 'admin@demo.com' ||
                   currentUser.email === 'admin@patriotcc.com';
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
        localStorage.removeItem('patriot-user');
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

  const fetchCardPermissions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/card-permissions/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.permissions) {
          setUserPermissions(json.permissions);
        }
      }
    } catch (e) {
      console.error('Error fetching card permissions:', e);
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

  // Resolve permission for each card using the RBAC system
  const getPermission = (cardKey: string): PermissionLevel => {
    return getCardPermission(userPermissions, cardKey, user?.role || 'operator');
  };

  // Determine which card keys are hidden by feature flags
  const hiddenByFeatureFlags = new Set<string>();
  for (const [flag, cardKeys] of Object.entries(FEATURE_FLAG_CARD_MAP)) {
    if (!(branding as unknown as Record<string, unknown>)[flag]) {
      cardKeys.forEach(k => hiddenByFeatureFlags.add(k));
    }
  }

  // Build card list from centralized ADMIN_CARDS, filtered by feature flags, sorted: full → view → none
  const sortedCards = [...ADMIN_CARDS]
    .filter(card => !hiddenByFeatureFlags.has(card.key))
    .sort((a, b) => {
      const order: Record<PermissionLevel, number> = { full: 0, view: 1, none: 2 };
      return order[getPermission(a.key)] - order[getPermission(b.key)];
    });

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
            {/* Company Logo with Animation */}
            <div className="transform hover:scale-105 transition-transform duration-200">
              <BrandedLogo className="h-10 text-white" logoUrl={branding.logo_dark_url || branding.logo_url} companyName={branding.company_name} />
            </div>

            {/* Modern Profile Section */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-lg px-4 py-2 rounded-xl border border-white/20">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-white/30">
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-blue-200 capitalize font-medium">{user?.role?.replace('_', ' ') || 'Admin'}</p>
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
              href="/dashboard/admin/active-jobs"
              className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl p-6 shadow-xl min-w-[140px] transform hover:scale-105 transition-all cursor-pointer group"
            >
              <p className="text-4xl font-bold text-white drop-shadow-lg">{stats.activeJobs}</p>
              <p className="text-sm text-white/90 font-semibold mt-1">Active Jobs</p>
              <p className="text-xs text-white/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">View progress</p>
            </Link>
            <div className="bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-2xl p-6 shadow-xl min-w-[140px] transform hover:scale-105 transition-all">
              <p className="text-4xl font-bold text-white drop-shadow-lg">{stats.crewsWorking}</p>
              <p className="text-sm text-white/90 font-semibold mt-1">Crews Working</p>
            </div>
          </div>
        </div>

        {/* Admin Modules Grid — sorted by permission: full → view → none */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {sortedCards.map((card, index) => {
            const perm = getPermission(card.key);

            const cardInner = (
              <>
                <div className={`absolute inset-0 bg-gradient-to-br ${card.bgColor} opacity-0 ${perm !== 'none' ? 'group-hover:opacity-100' : ''} transition-opacity duration-500 rounded-3xl`}></div>
                <div className={`relative bg-white rounded-[22px] p-6 ${perm !== 'none' ? 'group-hover:bg-transparent' : ''} transition-colors duration-500`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-14 h-14 bg-gradient-to-br ${card.bgColor} rounded-2xl flex items-center justify-center shadow-lg ${perm !== 'none' ? 'group-hover:shadow-xl transform group-hover:rotate-6' : ''} transition-all duration-300`}>
                      <span className="text-3xl">{card.icon}</span>
                    </div>
                    {perm === 'view' ? (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 group-hover:bg-white/20 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300 border border-yellow-200">
                        VIEW ONLY
                      </span>
                    ) : perm === 'full' ? (
                      <span className={`px-3 py-1 ${card.iconBg}/10 text-xs font-bold rounded-full group-hover:bg-white/20 group-hover:text-white transition-all duration-300`}>
                        ACTIVE
                      </span>
                    ) : null}
                  </div>
                  <h3 className={`text-2xl font-bold text-gray-800 ${perm !== 'none' ? 'group-hover:text-white' : ''} mb-2 transition-colors duration-300`}>
                    {card.title}
                  </h3>
                  <p className={`text-gray-600 ${perm !== 'none' ? 'group-hover:text-white/90' : ''} font-medium transition-colors duration-300 mb-4`}>
                    {card.description}
                  </p>
                  {perm !== 'none' && (
                    <div className="flex items-center text-gray-600 group-hover:text-white font-semibold transition-colors duration-300">
                      <span>{perm === 'view' ? 'View Module' : 'Open Module'}</span>
                      <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  )}
                </div>
              </>
            );

            // Full or View: render as clickable link
            if (perm === 'full' || perm === 'view') {
              return (
                <Link
                  key={card.key}
                  href={card.href}
                  className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-gray-50 p-1 shadow-xl hover:shadow-2xl hover:scale-[1.02] cursor-pointer animate-fade-in-up transition-all duration-500 ${
                    perm === 'view' ? 'ring-1 ring-yellow-200' : ''
                  }`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {cardInner}
                </Link>
              );
            }

            // None: render as blurred, non-clickable div
            return (
              <div
                key={card.key}
                className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-gray-50 p-1 shadow-xl blur-[2px] opacity-40 cursor-not-allowed animate-fade-in-up transition-all duration-500"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {cardInner}
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm rounded-3xl">
                  <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg">
                    <p className="text-sm font-semibold text-gray-600">No Access</p>
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