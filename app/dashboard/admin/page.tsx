'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();

  const adminModules = [
    {
      title: 'Create Estimate',
      description: 'Build professional estimates for concrete cutting services',
      icon: '📝',
      href: '/dashboard/admin/create-estimate',
      bgColor: 'bg-indigo-600',
      iconBg: 'bg-indigo-500',
      features: ['Multi-service quotes', 'Real-time calculations', 'PDF generation', 'Email to clients'],
      status: 'active'
    },
    {
      title: 'Active Project Status Board',
      description: 'See all active jobs at a glance with color-coded status',
      icon: '📊',
      href: '/dashboard/admin/project-status-board',
      bgColor: 'bg-blue-600',
      iconBg: 'bg-blue-500',
      features: ['Live job monitoring', 'Color-coded status', 'Timeline tracking', 'Crew management'],
      status: 'active'
    },
    {
      title: 'Upcoming Projects Board',
      description: 'Calendar view of scheduled projects and planning',
      icon: '📅',
      href: '/dashboard/admin/upcoming-projects',
      bgColor: 'bg-green-600',
      iconBg: 'bg-green-500',
      features: ['Calendar view', 'Project scheduling', 'Resource planning', 'Timeline preview'],
      status: 'active'
    },
    {
      title: 'Resource Management',
      description: 'Manage equipment, vehicles, and personnel assignments',
      icon: '🔧',
      href: '/dashboard/admin/resources',
      bgColor: 'bg-slate-600',
      iconBg: 'bg-slate-500',
      features: ['Equipment tracking', 'Staff scheduling', 'Resource allocation', 'Maintenance logs'],
      status: 'coming-soon'
    },
    {
      title: 'Financial Overview',
      description: 'Track project costs, revenue, and profitability',
      icon: '💰',
      href: '/dashboard/admin/financials',
      bgColor: 'bg-red-600',
      iconBg: 'bg-red-500',
      features: ['Cost tracking', 'Revenue reports', 'Profit margins', 'Invoice management'],
      status: 'coming-soon'
    },
    {
      title: 'Client Management',
      description: 'Manage client relationships and project history',
      icon: '👥',
      href: '/dashboard/admin/clients',
      bgColor: 'bg-blue-700',
      iconBg: 'bg-blue-600',
      features: ['Client database', 'Project history', 'Contact management', 'Communications log'],
      status: 'coming-soon'
    },
    {
      title: 'Analytics & Reports',
      description: 'Comprehensive business analytics and reporting',
      icon: '📈',
      href: '/dashboard/admin/analytics',
      bgColor: 'bg-slate-700',
      iconBg: 'bg-slate-600',
      features: ['Performance metrics', 'Trend analysis', 'Custom reports', 'Data exports'],
      status: 'coming-soon'
    },
    {
      title: 'Safety & Compliance',
      description: 'Track safety incidents, training, and compliance',
      icon: '🛡️',
      href: '/dashboard/admin/safety',
      bgColor: 'bg-red-700',
      iconBg: 'bg-red-600',
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-900 to-red-800 bg-clip-text text-transparent flex items-center gap-3">
                <span className="text-4xl">🏢</span>
                Admin Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Pontifex Industries Command Center</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                Operator View
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {quickStats.map((stat, index) => (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
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
              <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Admin Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {adminModules.map((module, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-xl border-2 transition-all duration-300 ${
                module.status === 'active'
                  ? 'border-gray-200 hover:border-blue-400 hover:shadow-xl cursor-pointer transform hover:scale-105'
                  : 'border-gray-100 opacity-60 cursor-not-allowed'
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
                <div className={`w-16 h-16 ${module.iconBg} bg-opacity-10 rounded-xl flex items-center justify-center mb-4`}>
                  <span className="text-3xl">{module.icon}</span>
                </div>

                {/* Title & Description */}
                <h3 className="text-xl font-bold text-gray-800 mb-2">{module.title}</h3>
                <p className="text-gray-600 text-sm mb-4">{module.description}</p>

                {/* Features */}
                <div className="space-y-1 mb-4">
                  {module.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-gray-500 text-xs">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      {feature}
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                {module.status === 'active' && (
                  <button className={`w-full px-4 py-2 ${module.bgColor} text-white rounded-lg hover:opacity-90 transition-all font-medium mt-4`}>
                    Open Module →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-gray-800">Job #2024-001 started</p>
                  <p className="text-sm text-gray-500">Downtown Plaza Core Drilling</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">10 mins ago</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-gray-800">Equipment issue reported</p>
                  <p className="text-sm text-gray-500">Slab Saw #1 - Minor repair needed</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">25 mins ago</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-gray-800">New job scheduled</p>
                  <p className="text-sm text-gray-500">Bridge Deck Repair - Tomorrow 6:00 AM</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">1 hour ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}