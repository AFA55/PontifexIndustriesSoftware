'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/admin" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Business Analytics Hub</h1>
                <p className="text-sm text-gray-600">Profitability & Performance Tracking</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full text-xs font-semibold shadow-lg">
              🚀 System Ready
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-3xl shadow-2xl p-8 mb-6 text-white">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative flex items-start gap-6">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3">Welcome to Your Analytics Hub</h2>
              <p className="text-white/90 text-lg mb-6 leading-relaxed">
                Track job profitability, operator performance, and business metrics all in one place. This system automatically calculates costs, revenue, and efficiency once you configure your business parameters.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="px-5 py-2.5 bg-white/20 backdrop-blur-lg rounded-xl text-sm font-semibold shadow-lg">
                  📊 Job Profitability
                </div>
                <div className="px-5 py-2.5 bg-white/20 backdrop-blur-lg rounded-xl text-sm font-semibold shadow-lg">
                  ⭐ Operator Rankings
                </div>
                <div className="px-5 py-2.5 bg-white/20 backdrop-blur-lg rounded-xl text-sm font-semibold shadow-lg">
                  💰 Revenue Tracking
                </div>
                <div className="px-5 py-2.5 bg-white/20 backdrop-blur-lg rounded-xl text-sm font-semibold shadow-lg">
                  📈 Performance Trends
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Banner */}
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-2xl p-6 mb-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-yellow-900 mb-2">⚙️ Configuration Required</h3>
              <p className="text-yellow-800 mb-4 leading-relaxed">
                To enable automatic profitability calculations, you need to configure your business costs. Once configured, the system will automatically calculate profit margins for every job in real-time.
              </p>
              <button className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg transition-all transform hover:scale-105">
                Configure Business Costs →
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Job Profitability Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-lg rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Job Profitability</h2>
                  <p className="text-white/90 text-sm">Automatic profit calculations per job</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* How It Works */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 mb-4">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  How It Works
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 font-bold text-lg">✓</span>
                    <span>Salespeople enter <strong className="text-green-700">Job Quote</strong> when creating tickets</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 font-bold text-lg">✓</span>
                    <span>System tracks <strong className="text-blue-700">operator hours</strong> automatically</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 font-bold text-lg">✓</span>
                    <span>Equipment usage is logged during job execution</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 font-bold text-lg">✓</span>
                    <span>Materials used are recorded by operators</span>
                  </div>
                </div>
              </div>

              {/* Profit Formula */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border-2 border-blue-200">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">💡 Profit Calculation Formula</h3>
                <div className="space-y-2">
                  <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg shadow-lg">
                    <div className="text-white font-bold mb-1">Revenue:</div>
                    <div className="text-white/90 text-sm">= Job Quote Amount ($)</div>
                  </div>
                  <div className="text-center text-gray-500 font-bold text-xl">−</div>
                  <div className="p-4 bg-white rounded-lg border-2 border-red-200 shadow-md">
                    <div className="text-red-600 font-bold mb-2">Total Costs:</div>
                    <div className="text-gray-700 text-xs space-y-1.5 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        Labor Cost = Hours × Operator Rate
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        Equipment Cost = Usage × Hourly Rate
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        Material Cost = Items Used
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        Overhead = Fixed % of Revenue
                      </div>
                    </div>
                  </div>
                  <div className="text-center text-gray-500 font-bold text-xl">=</div>
                  <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white shadow-lg">
                    <div className="font-bold text-lg text-center">💰 Net Profit</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Operator Performance Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-lg rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Operator Analytics</h2>
                  <p className="text-white/90 text-sm">Performance tracking & rankings</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Metrics Tracked */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 mb-4">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Metrics Tracked
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-purple-300 transition-all">
                    <div className="text-3xl mb-2">⭐</div>
                    <div className="text-xs font-bold text-gray-900">Customer Ratings</div>
                    <div className="text-xs text-gray-600 mt-1">Overall, Cleanliness, Communication</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-blue-300 transition-all">
                    <div className="text-3xl mb-2">⏱️</div>
                    <div className="text-xs font-bold text-gray-900">Time Efficiency</div>
                    <div className="text-xs text-gray-600 mt-1">Actual vs Estimated Hours</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-green-300 transition-all">
                    <div className="text-3xl mb-2">✅</div>
                    <div className="text-xs font-bold text-gray-900">Job Completion</div>
                    <div className="text-xs text-gray-600 mt-1">Success Rate & Quality</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-orange-300 transition-all">
                    <div className="text-3xl mb-2">🛠️</div>
                    <div className="text-xs font-bold text-gray-900">Skill Proficiency</div>
                    <div className="text-xs text-gray-600 mt-1">By Activity Type</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-indigo-300 transition-all">
                    <div className="text-3xl mb-2">⚙️</div>
                    <div className="text-xs font-bold text-gray-900">Equipment Usage</div>
                    <div className="text-xs text-gray-600 mt-1">Production Rates & Efficiency</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-teal-300 transition-all">
                    <div className="text-3xl mb-2">💎</div>
                    <div className="text-xs font-bold text-gray-900">Resource Management</div>
                    <div className="text-xs text-gray-600 mt-1">Blade & Material Efficiency</div>
                  </div>
                </div>
              </div>

              {/* Skill Tracking */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200">
                <h3 className="font-bold text-gray-900 mb-4">🎯 Operator Skills & Capabilities</h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center gap-3 text-gray-700">
                    <span className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">1</span>
                    <span>Track which operators are certified for specific tasks</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <span className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">2</span>
                    <span>Measure proficiency in drilling, sawing, demolition</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <span className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">3</span>
                    <span>Smart job assignment based on capabilities</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <span className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">4</span>
                    <span>Performance rankings within each skill category</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Equipment Performance Analytics Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-lg rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Equipment Analytics</h2>
                  <p className="text-white/90 text-sm">Production rates & resource efficiency</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Equipment Tracking Overview */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 mb-4">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Equipment Usage Tracking
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold text-lg">✓</span>
                    <span><strong className="text-indigo-700">Linear Feet Cut</strong> tracked by equipment type and task</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold text-lg">✓</span>
                    <span><strong className="text-blue-700">Job Difficulty Rating</strong> (easy/medium/hard/extreme)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold text-lg">✓</span>
                    <span>Blade usage and wear patterns logged per job</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold text-lg">✓</span>
                    <span>Resource consumption: hydraulic hose, water hose, power</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold text-lg">✓</span>
                    <span>Setup time and location changes tracked</span>
                  </div>
                </div>
              </div>

              {/* Production Rate Analysis */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-5 border-2 border-indigo-200 mb-4">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">📊 Production Rate Analysis</h3>
                <div className="space-y-3">
                  <div className="bg-white rounded-lg p-4 shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-900">Linear Feet per Hour</span>
                      <span className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold rounded-full">Auto-Calculated</span>
                    </div>
                    <p className="text-xs text-gray-600">Measures operator efficiency: linear feet cut ÷ time worked</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-900">Difficulty-Adjusted Rates</span>
                      <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-600 text-white text-xs font-bold rounded-full">Smart Metrics</span>
                    </div>
                    <p className="text-xs text-gray-600">Compare performance across easy vs. hard jobs fairly</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-900">Equipment Proficiency</span>
                      <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-xs font-bold rounded-full">Per Operator</span>
                    </div>
                    <p className="text-xs text-gray-600">See which operators excel with specific equipment types</p>
                  </div>
                </div>
              </div>

              {/* View Full Dashboard */}
              <Link
                href="/dashboard/admin/equipment-performance"
                className="block w-full mb-4"
              >
                <div className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 rounded-xl p-4 text-white text-center shadow-lg transition-all transform hover:scale-105 cursor-pointer">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="font-bold">View Full Equipment Dashboard →</span>
                  </div>
                  <p className="text-xs text-white/80 mt-1">Detailed performance analytics & rankings</p>
                </div>
              </Link>

              {/* Resource Efficiency */}
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-5 border-2 border-teal-200">
                <h3 className="font-bold text-gray-900 mb-4">💰 Resource Cost Tracking</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="text-2xl mb-1">💎</div>
                    <div className="text-xs font-bold text-gray-900">Blade Costs</div>
                    <div className="text-xs text-gray-600 mt-1">Usage per job tracked</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="text-2xl mb-1">🔌</div>
                    <div className="text-xs font-bold text-gray-900">Power Usage</div>
                    <div className="text-xs text-gray-600 mt-1">Hours tracked per job</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="text-2xl mb-1">💧</div>
                    <div className="text-xs font-bold text-gray-900">Water Hose</div>
                    <div className="text-xs text-gray-600 mt-1">Feet used logged</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="text-2xl mb-1">⚙️</div>
                    <div className="text-xs font-bold text-gray-900">Hydraulic Hose</div>
                    <div className="text-xs text-gray-600 mt-1">Feet used logged</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Checklist */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Configuration Checklist</h2>
              <p className="text-gray-600">Set up your business parameters to activate analytics</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Cost Configuration */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md">1</span>
                <h3 className="font-bold text-lg text-gray-900">Business Costs</h3>
              </div>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Operator Hourly Rates</div>
                    <div className="text-sm text-gray-600">Set labor cost per operator ($/hour)</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Equipment Hourly Rates</div>
                    <div className="text-sm text-gray-600">Cost per hour for each equipment type</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Material Costs</div>
                    <div className="text-sm text-gray-600">Price list for blades, bits, consumables</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Overhead Percentage</div>
                    <div className="text-sm text-gray-600">Insurance, admin, vehicle costs, etc.</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Operator Configuration */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md">2</span>
                <h3 className="font-bold text-lg text-gray-900">Operator Setup</h3>
              </div>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-purple-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Skill Certifications</div>
                    <div className="text-sm text-gray-600">Assign capabilities per operator</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-purple-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Performance Baselines</div>
                    <div className="text-sm text-gray-600">Set expected productivity rates</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-purple-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Rating Thresholds</div>
                    <div className="text-sm text-gray-600">Define "excellent" vs "needs improvement"</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-purple-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Training Records</div>
                    <div className="text-sm text-gray-600">Track certifications and safety training</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Equipment Configuration */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md">3</span>
                <h3 className="font-bold text-lg text-gray-900">Equipment Setup</h3>
              </div>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-indigo-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Blade Cost Rates</div>
                    <div className="text-sm text-gray-600">Price per blade by type and size</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-indigo-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Resource Cost Rates</div>
                    <div className="text-sm text-gray-600">Hose cost per foot, power per hour</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-indigo-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Production Benchmarks</div>
                    <div className="text-sm text-gray-600">Expected feet/hour by difficulty</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all border-2 border-gray-200">
                  <input type="checkbox" className="mt-1 w-5 h-5 text-indigo-600" />
                  <div>
                    <div className="font-semibold text-gray-900">Equipment Inventory</div>
                    <div className="text-sm text-gray-600">Track equipment IDs and availability</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border-2 border-green-200 shadow-xl">
          <h2 className="font-bold text-2xl text-gray-900 mb-6 flex items-center gap-3">
            <span className="text-3xl">🎯</span>
            Why This System Helps Your Business
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-green-200">
              <div className="text-4xl mb-3">💰</div>
              <div className="font-bold text-lg text-gray-900 mb-2">Maximize Profit</div>
              <div className="text-sm text-gray-700 leading-relaxed">See which jobs are most profitable and where you're losing money. Make data-driven pricing decisions.</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-200">
              <div className="text-4xl mb-3">📊</div>
              <div className="font-bold text-lg text-gray-900 mb-2">Data-Driven Decisions</div>
              <div className="text-sm text-gray-700 leading-relaxed">Make informed choices about pricing, staffing, and equipment based on real performance data.</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200">
              <div className="text-4xl mb-3">⚡</div>
              <div className="font-bold text-lg text-gray-900 mb-2">Improve Efficiency</div>
              <div className="text-sm text-gray-700 leading-relaxed">Identify bottlenecks and optimize operations for maximum productivity and customer satisfaction.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
