'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const adminModules = [
    {
      title: 'Create Estimate',
      description: 'Build professional estimates for concrete cutting services',
      icon: '📝',
      href: '/dashboard/admin/create-estimate',
      bgColor: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-500',
      features: ['Multi-service quotes', 'Real-time calculations', 'PDF generation', 'Email to clients'],
      status: 'active'
    },
    {
      title: 'Active Project Status Board',
      description: 'See all active jobs at a glance with color-coded status',
      icon: '📊',
      href: '/dashboard/admin/project-status-board',
      bgColor: 'from-red-500 to-red-600',
      iconBg: 'bg-red-500',
      features: ['Live job monitoring', 'Color-coded status', 'Timeline tracking', 'Crew management'],
      status: 'active'
    },
    {
      title: 'Upcoming Projects Board',
      description: 'Calendar view of scheduled projects and planning',
      icon: '📅',
      href: '/dashboard/admin/upcoming-projects',
      bgColor: 'from-indigo-500 to-indigo-600',
      iconBg: 'bg-indigo-500',
      features: ['Calendar view', 'Project scheduling', 'Resource planning', 'Timeline preview'],
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
      title: 'Client Management',
      description: 'Manage client relationships and project history',
      icon: '👥',
      href: '/dashboard/admin/clients',
      bgColor: 'from-cyan-500 to-blue-600',
      iconBg: 'bg-cyan-500',
      features: ['Client database', 'Project history', 'Contact management', 'Communications log'],
      status: 'coming-soon'
    },
    {
      title: 'Analytics & Reports',
      description: 'Comprehensive business analytics and reporting',
      icon: '📈',
      href: '/dashboard/admin/analytics',
      bgColor: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-500',
      features: ['Performance metrics', 'Trend analysis', 'Custom reports', 'Data exports'],
      status: 'coming-soon'
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
    }
  ];

  const quickStats = [
    { label: 'Active Jobs', value: '12', change: '+3', trend: 'up' },
    { label: 'Crews Working', value: '8', change: '0', trend: 'neutral' },
    { label: "Today's Revenue", value: '$45.2K', change: '+12%', trend: 'up' },
    { label: 'Equipment Utilization', value: '87%', change: '+5%', trend: 'up' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200 rounded-full opacity-5 blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 gradient-bg-brand rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">🏢</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold gradient-text">
                  Admin Dashboard
                </h1>
                <p className="text-sm text-gray-500 font-medium">Pontifex Industries Command Center</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all group">
                <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-all font-semibold shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Operator View</span>
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all font-semibold shadow-sm flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="container mx-auto px-4 py-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {quickStats.map((stat, index) => (
            <div key={index} className="card-premium p-6 hover-lift">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">{stat.label}</span>
                <span className={`text-sm font-semibold flex items-center gap-1 ${
                  stat.trend === 'up' ? 'text-green-600' :
                  stat.trend === 'down' ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                  {stat.trend === 'up' && '↑'}
                  {stat.trend === 'down' && '↓'}
                  {stat.change}
                </span>
              </div>
              <div className="text-3xl font-bold gradient-text">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Admin Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {adminModules.map((module, index) => (
            <div
              key={index}
              className={`relative card-premium transition-all duration-300 ${
                module.status === 'active'
                  ? 'hover-lift cursor-pointer'
                  : 'opacity-60 cursor-not-allowed'
              }`}
              onClick={() => module.status === 'active' && router.push(module.href)}
            >
              <div className="p-6">
                {/* Status Badge */}
                {module.status === 'coming-soon' && (
                  <div className="absolute top-4 right-4 px-3 py-1 bg-gray-100 rounded-full text-xs font-semibold text-gray-500">
                    Coming Soon
                  </div>
                )}

                {/* Icon */}
                <div className={`w-16 h-16 bg-gradient-to-br ${module.bgColor} rounded-2xl flex items-center justify-center mb-4 shadow-lg`}>
                  <span className="text-3xl">{module.icon}</span>
                </div>

                {/* Title & Description */}
                <h3 className="text-xl font-bold text-gray-800 mb-2">{module.title}</h3>
                <p className="text-gray-600 text-sm mb-4">{module.description}</p>

                {/* Features */}
                <div className="space-y-1 mb-4">
                  {module.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-gray-500 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full gradient-bg-brand"></div>
                      {feature}
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                {module.status === 'active' && (
                  <button className="w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-all font-semibold shadow-md hover:shadow-lg">
                    Open Module →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="mt-8 card-premium p-6">
          <h2 className="text-xl font-bold gradient-text mb-6">Recent Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-transparent rounded-xl border border-green-100 hover-lift">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <div>
                  <p className="font-semibold text-gray-800">Job #2024-001 started</p>
                  <p className="text-sm text-gray-600">Downtown Plaza Core Drilling</p>
                </div>
              </div>
              <span className="text-sm font-medium text-gray-500">10 mins ago</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-transparent rounded-xl border border-yellow-100 hover-lift">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                <div>
                  <p className="font-semibold text-gray-800">Equipment issue reported</p>
                  <p className="text-sm text-gray-600">Slab Saw #1 - Minor repair needed</p>
                </div>
              </div>
              <span className="text-sm font-medium text-gray-500">25 mins ago</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-transparent rounded-xl border border-blue-100 hover-lift">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <div>
                  <p className="font-semibold text-gray-800">New job scheduled</p>
                  <p className="text-sm text-gray-600">Bridge Deck Repair - Tomorrow 6:00 AM</p>
                </div>
              </div>
              <span className="text-sm font-medium text-gray-500">1 hour ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}