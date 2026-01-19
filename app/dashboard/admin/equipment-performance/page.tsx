'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface EquipmentStats {
  totalEntries: number;
  totalLinearFeet: number;
  totalBlades: number;
  averageProductionRate: number;
  byEquipmentType: Record<string, { count: number; linearFeet: number; avgRate: number }>;
  byDifficulty: Record<string, { count: number; linearFeet: number; avgRate: number }>;
  topOperators: Array<{
    operatorName: string;
    equipmentType: string;
    totalLinearFeet: number;
    avgProductionRate: number;
    jobCount: number;
  }>;
  resourceTotals: {
    hydraulicHose: number;
    waterHose: number;
    powerHours: number;
  };
}

export default function EquipmentPerformancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EquipmentStats | null>(null);

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

    await fetchEquipmentStats();
    setLoading(false);
  };

  const fetchEquipmentStats = async () => {
    try {
      const { data: equipmentData, error } = await supabase
        .from('equipment_usage')
        .select(`
          *,
          operator:profiles(full_name),
          job_order:job_orders(job_number)
        `);

      if (error) throw error;

      if (equipmentData && equipmentData.length > 0) {
        // Calculate stats
        const totalLinearFeet = equipmentData.reduce((sum, e) => sum + (e.linear_feet_cut || 0), 0);
        const totalBlades = equipmentData.reduce((sum, e) => sum + (e.blades_used || 0), 0);
        const avgProductionRate = equipmentData
          .filter(e => e.feet_per_hour && e.feet_per_hour > 0)
          .reduce((sum, e, _, arr) => sum + (e.feet_per_hour || 0) / arr.length, 0);

        // By equipment type
        const byEquipmentType: Record<string, { count: number; linearFeet: number; avgRate: number }> = {};
        equipmentData.forEach(e => {
          if (!byEquipmentType[e.equipment_type]) {
            byEquipmentType[e.equipment_type] = { count: 0, linearFeet: 0, avgRate: 0 };
          }
          byEquipmentType[e.equipment_type].count++;
          byEquipmentType[e.equipment_type].linearFeet += e.linear_feet_cut || 0;
          if (e.feet_per_hour && e.feet_per_hour > 0) {
            byEquipmentType[e.equipment_type].avgRate += e.feet_per_hour;
          }
        });
        // Calculate average rates
        Object.keys(byEquipmentType).forEach(key => {
          const count = equipmentData.filter(e => e.equipment_type === key && e.feet_per_hour && e.feet_per_hour > 0).length;
          if (count > 0) {
            byEquipmentType[key].avgRate = byEquipmentType[key].avgRate / count;
          }
        });

        // By difficulty
        const byDifficulty: Record<string, { count: number; linearFeet: number; avgRate: number }> = {};
        equipmentData.forEach(e => {
          if (!byDifficulty[e.difficulty_level]) {
            byDifficulty[e.difficulty_level] = { count: 0, linearFeet: 0, avgRate: 0 };
          }
          byDifficulty[e.difficulty_level].count++;
          byDifficulty[e.difficulty_level].linearFeet += e.linear_feet_cut || 0;
          if (e.feet_per_hour && e.feet_per_hour > 0) {
            byDifficulty[e.difficulty_level].avgRate += e.feet_per_hour;
          }
        });
        // Calculate average rates
        Object.keys(byDifficulty).forEach(key => {
          const count = equipmentData.filter(e => e.difficulty_level === key && e.feet_per_hour && e.feet_per_hour > 0).length;
          if (count > 0) {
            byDifficulty[key].avgRate = byDifficulty[key].avgRate / count;
          }
        });

        // Top operators by equipment type
        const operatorStats: Record<string, any> = {};
        equipmentData.forEach(e => {
          const key = `${e.operator_id}-${e.equipment_type}`;
          if (!operatorStats[key]) {
            operatorStats[key] = {
              operatorId: e.operator_id,
              operatorName: e.operator?.full_name || 'Unknown',
              equipmentType: e.equipment_type,
              totalLinearFeet: 0,
              totalRate: 0,
              rateCount: 0,
              jobCount: 0,
            };
          }
          operatorStats[key].totalLinearFeet += e.linear_feet_cut || 0;
          operatorStats[key].jobCount++;
          if (e.feet_per_hour && e.feet_per_hour > 0) {
            operatorStats[key].totalRate += e.feet_per_hour;
            operatorStats[key].rateCount++;
          }
        });

        const topOperators = Object.values(operatorStats)
          .map((op: any) => ({
            operatorName: op.operatorName,
            equipmentType: op.equipmentType,
            totalLinearFeet: op.totalLinearFeet,
            avgProductionRate: op.rateCount > 0 ? op.totalRate / op.rateCount : 0,
            jobCount: op.jobCount,
          }))
          .sort((a, b) => b.totalLinearFeet - a.totalLinearFeet)
          .slice(0, 10);

        // Resource totals
        const resourceTotals = {
          hydraulicHose: equipmentData.reduce((sum, e) => sum + (e.hydraulic_hose_used_ft || 0), 0),
          waterHose: equipmentData.reduce((sum, e) => sum + (e.water_hose_used_ft || 0), 0),
          powerHours: equipmentData.reduce((sum, e) => sum + (e.power_hours || 0), 0),
        };

        setStats({
          totalEntries: equipmentData.length,
          totalLinearFeet,
          totalBlades,
          averageProductionRate: avgProductionRate,
          byEquipmentType,
          byDifficulty,
          topOperators,
          resourceTotals,
        });
      }
    } catch (error) {
      console.error('Error fetching equipment stats:', error);
    }
  };

  const getEquipmentIcon = (type: string) => {
    const icons: Record<string, string> = {
      hand_saw: '🪚',
      slab_saw: '⚙️',
      wall_saw: '🔨',
      core_drill: '🔩',
      brokk: '🤖',
      mini_x: '🚜',
      skid_steer: '🚧',
      wire_saw: '🔗',
    };
    return icons[type] || '⚙️';
  };

  const getDifficultyColor = (level: string) => {
    const colors: Record<string, string> = {
      easy: 'from-green-500 to-emerald-600',
      medium: 'from-yellow-500 to-orange-500',
      hard: 'from-orange-500 to-red-500',
      extreme: 'from-red-600 to-pink-700',
    };
    return colors[level] || 'from-gray-500 to-gray-600';
  };

  const formatEquipmentName = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading equipment performance data...</p>
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
                <h1 className="text-xl font-bold text-gray-800">Equipment Performance Dashboard</h1>
                <p className="text-sm text-gray-600">Production rates, efficiency & resource usage</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full text-xs font-semibold shadow-lg">
              ⚙️ Analytics
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {!stats || stats.totalEntries === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-xl">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-600 text-lg font-medium mb-2">No Equipment Data Yet</p>
            <p className="text-gray-500 text-sm">
              Equipment usage data will appear here once operators start logging equipment information during jobs.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-800">{stats.totalEntries}</p>
                <p className="text-sm text-gray-500 font-medium">Equipment Logs</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-800">{stats.totalLinearFeet.toLocaleString()}</p>
                <p className="text-sm text-gray-500 font-medium">Total Linear Feet</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">⚡</span>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-800">{stats.averageProductionRate.toFixed(1)}</p>
                <p className="text-sm text-gray-500 font-medium">Avg Feet/Hour</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">💎</span>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-800">{stats.totalBlades}</p>
                <p className="text-sm text-gray-500 font-medium">Blades Used</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* By Equipment Type */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6">
                  <h2 className="text-xl font-bold text-white">Production by Equipment Type</h2>
                  <p className="text-blue-100 text-sm">Linear feet cut per equipment</p>
                </div>
                <div className="p-6 space-y-4">
                  {Object.entries(stats.byEquipmentType)
                    .sort(([, a], [, b]) => b.linearFeet - a.linearFeet)
                    .map(([type, data]) => (
                      <div key={type} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border-2 border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getEquipmentIcon(type)}</span>
                            <div>
                              <p className="font-bold text-gray-900">{formatEquipmentName(type)}</p>
                              <p className="text-xs text-gray-600">{data.count} jobs</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-600">{data.linearFeet.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">linear ft</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-gray-600">Avg Rate:</span>
                          <span className="text-sm font-bold text-gray-800">{data.avgRate.toFixed(1)} ft/hr</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* By Difficulty Level */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-br from-orange-500 to-red-600 p-6">
                  <h2 className="text-xl font-bold text-white">Production by Difficulty</h2>
                  <p className="text-orange-100 text-sm">Performance across job difficulty levels</p>
                </div>
                <div className="p-6 space-y-4">
                  {['easy', 'medium', 'hard', 'extreme']
                    .filter(level => stats.byDifficulty[level])
                    .map(level => {
                      const data = stats.byDifficulty[level];
                      return (
                        <div key={level} className={`bg-gradient-to-br ${getDifficultyColor(level)} rounded-xl p-4 border-2 border-transparent shadow-lg`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-bold text-white text-lg capitalize">{level}</p>
                              <p className="text-xs text-white/80">{data.count} jobs</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-white">{data.linearFeet.toLocaleString()}</p>
                              <p className="text-xs text-white/80">linear ft</p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-white/80">Avg Rate:</span>
                            <span className="text-sm font-bold text-white">{data.avgRate.toFixed(1)} ft/hr</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Top Performers */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
              <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-6">
                <h2 className="text-xl font-bold text-white">Top Performers by Equipment</h2>
                <p className="text-purple-100 text-sm">Highest production operators per equipment type</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stats.topOperators.map((op, index) => (
                    <div key={index} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border-2 border-gray-200">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{op.operatorName}</p>
                            <p className="text-xs text-gray-600 flex items-center gap-1">
                              <span>{getEquipmentIcon(op.equipmentType)}</span>
                              <span>{formatEquipmentName(op.equipmentType)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-purple-600">{op.totalLinearFeet.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">linear ft</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-gray-600">{op.jobCount} jobs</span>
                        <span className="font-bold text-gray-800">{op.avgProductionRate.toFixed(1)} ft/hr avg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Resource Consumption */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-6">
                <h2 className="text-xl font-bold text-white">Resource Consumption</h2>
                <p className="text-teal-100 text-sm">Total resources used across all jobs</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-2xl">⚙️</span>
                      </div>
                      <p className="font-bold text-gray-900">Hydraulic Hose</p>
                    </div>
                    <p className="text-3xl font-bold text-blue-600">{stats.resourceTotals.hydraulicHose.toLocaleString()}</p>
                    <p className="text-sm text-gray-600 mt-1">feet used</p>
                  </div>

                  <div className="bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl p-6 border-2 border-cyan-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-2xl">💧</span>
                      </div>
                      <p className="font-bold text-gray-900">Water Hose</p>
                    </div>
                    <p className="text-3xl font-bold text-cyan-600">{stats.resourceTotals.waterHose.toLocaleString()}</p>
                    <p className="text-sm text-gray-600 mt-1">feet used</p>
                  </div>

                  <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-6 border-2 border-yellow-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-yellow-500 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-2xl">🔌</span>
                      </div>
                      <p className="font-bold text-gray-900">Power Usage</p>
                    </div>
                    <p className="text-3xl font-bold text-yellow-600">{stats.resourceTotals.powerHours.toFixed(1)}</p>
                    <p className="text-sm text-gray-600 mt-1">hours consumed</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
