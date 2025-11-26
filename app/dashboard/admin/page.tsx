'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
  }, [router]);

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
      title: 'Create Estimate',
      description: 'Build professional estimates for concrete cutting services',
      icon: '📝',
      href: '/dashboard/admin/create-estimate',
      bgColor: 'from-gray-500 to-gray-600',
      iconBg: 'bg-gray-500',
      features: ['Multi-service quotes', 'Real-time calculations', 'PDF generation', 'Email to clients'],
      status: 'coming-soon'
    },
    {
      title: 'Project Board',
      description: 'View current and upcoming jobs with color-coded status',
      icon: '📊',
      href: '/dashboard/admin/project-status-board',
      bgColor: 'from-red-500 to-red-600',
      iconBg: 'bg-red-500',
      features: ['Live job monitoring', 'Upcoming jobs view', 'Analytics dashboard', 'Timeline tracking'],
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
      title: 'Resource Management',
      description: 'Manage equipment, vehicles, and personnel assignments',
      icon: '🔧',
      href: '/dashboard/admin/resources',
      bgColor: 'from-gray-500 to-gray-600',
      iconBg: 'bg-gray-500',
      features: ['Equipment tracking', 'Staff scheduling', 'Resource allocation', 'Maintenance logs'],
      status: 'coming-soon'
    },
    {
      title: 'Financial Overview',
      description: 'Track project costs, revenue, and profitability',
      icon: '💰',
      href: '/dashboard/admin/financials',
      bgColor: 'from-green-500 to-emerald-600',
      iconBg: 'bg-green-500',
      features: ['Cost tracking', 'Revenue reports', 'Profit margins', 'Invoice management'],
      status: 'coming-soon'
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
      title: 'Safety & Compliance',
      description: 'Track safety incidents, training, and compliance',
      icon: '🛡️',
      href: '/dashboard/admin/safety',
      bgColor: 'from-orange-500 to-red-600',
      iconBg: 'bg-orange-500',
      features: ['Incident reporting', 'Training records', 'Compliance tracking', 'Safety scores'],
      status: 'coming-soon'
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

  const quickStats = [
    { label: 'Active Jobs', value: '12', change: '+3', trend: 'up' },
    { label: 'Crews Working', value: '8', change: '0', trend: 'neutral' },
    { label: "Today's Revenue", value: '$45.2K', change: '+12%', trend: 'up' },
    { label: 'Equipment Utilization', value: '87%', change: '+5%', trend: 'up' }
  ];

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
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-gray-500 capitalize">Administrator</p>
                </div>
              </div>

              {/* Operator View Button */}
              <Link
                href="/dashboard"
                className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-all font-semibold shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Operator View</span>
              </Link>

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
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-blue-600 bg-clip-text text-transparent mb-3 animate-gradient">
              Welcome back, {user?.name?.split(' ')[0] || 'Admin'}!
            </h1>
            <p className="text-gray-600 text-lg font-light">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Quick Stats Bar */}
          <div className="flex justify-center gap-8 mt-6">
            {quickStats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {adminModules.map((module, index) => {
            const isActive = module.status === 'active';

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

            return isActive ? (
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
            ) : (
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
                } p-1 shadow-xl opacity-60 cursor-not-allowed animate-fade-in-up transition-all duration-500`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {cardContent}
              </div>
            );
          })}
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