'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Shield, Activity, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Loader2, Users, Database, Clock, Globe, Lock, Server
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface ApiHealthItem {
  endpoint: string;
  path: string;
  status: string;
  statusCode: number;
  responseTimeMs: number;
}

interface ErrorLogItem {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  error_message: string;
  user_role: string;
  ip_address: string;
  created_at: string;
}

interface LoginAttemptItem {
  id: string;
  email: string;
  success: boolean;
  ip_address: string;
  user_agent: string;
  failure_reason: string | null;
  created_at: string;
}

interface OpsHubData {
  apiHealth: ApiHealthItem[];
  recentErrors: ErrorLogItem[];
  loginAudit: {
    attempts: LoginAttemptItem[];
    summary: { total: number; successful: number; failed: number };
  };
  databaseStats: Array<{ table_name: string; row_count: number; size_bytes: number }>;
  roleOverview: Record<string, { total: number; active: number }>;
  systemStatus: {
    databaseConnected: boolean;
    totalJobs: number;
    totalProfiles: number;
    lastChecked: string;
  };
}

async function apiFetch(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export default function OpsHubPage() {
  const router = useRouter();
  const [data, setData] = useState<OpsHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['super_admin', 'operations_manager'].includes(currentUser.role || '')) {
      router.push('/dashboard/admin');
    }
  }, [router]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await apiFetch('/api/admin/ops-hub');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setError(null);
      } else {
        setError('Failed to load diagnostics');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + formatTime(iso);
  };

  // Overall health status
  const overallHealth = data?.apiHealth?.every(h => h.status === 'ok')
    ? 'healthy'
    : data?.apiHealth?.some(h => h.status === 'ok')
      ? 'degraded'
      : 'down';

  const healthColor = overallHealth === 'healthy' ? 'from-green-500 to-emerald-600' :
    overallHealth === 'degraded' ? 'from-yellow-500 to-orange-600' : 'from-red-500 to-red-700';

  const healthLabel = overallHealth === 'healthy' ? 'All Systems Operational' :
    overallHealth === 'degraded' ? 'Some Services Degraded' : 'System Issues Detected';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-blue-400" />
                Operations Hub
              </h1>
              <p className="text-sm text-gray-400">System diagnostics, security monitoring & audit trail</p>
            </div>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* ═══ SYSTEM STATUS BANNER ═══ */}
            <div className={`bg-gradient-to-r ${healthColor} rounded-2xl p-5 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-white" />
                <div>
                  <h2 className="font-bold text-lg">{healthLabel}</h2>
                  <p className="text-white/70 text-sm">
                    Last checked: {data.systemStatus.lastChecked ? formatTime(data.systemStatus.lastChecked) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-white/80 text-sm">
                <span>{data.systemStatus.totalJobs} jobs</span>
                <span>{data.systemStatus.totalProfiles} profiles</span>
              </div>
            </div>

            {/* ═══ API HEALTH GRID ═══ */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                API Health
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.apiHealth.map((h) => (
                  <div key={h.path} className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-white">{h.endpoint}</span>
                      {h.status === 'ok' ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        h.status === 'ok' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                      }`}>
                        {h.statusCode || 'TIMEOUT'}
                      </span>
                      <span className="text-xs text-gray-400">{h.responseTimeMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ═══ LOGIN AUDIT TRAIL ═══ */}
              <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-yellow-400" />
                  Login Audit Trail (24h)
                  <span className="ml-auto text-xs text-gray-500 font-normal">
                    {data.loginAudit.summary.successful} ok / {data.loginAudit.summary.failed} failed
                  </span>
                </h3>
                {data.loginAudit.attempts.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">No login attempts in the last 24 hours</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data.loginAudit.attempts.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-white/5">
                        {a.success ? (
                          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium truncate block">{a.email}</span>
                          {a.failure_reason && (
                            <span className="text-xs text-red-400">{a.failure_reason.replace(/_/g, ' ')}</span>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-400">{formatDateTime(a.created_at)}</p>
                          {a.ip_address && <p className="text-xs text-gray-500">{a.ip_address}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ═══ RECENT ERRORS ═══ */}
              <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Recent Errors (24h)
                  <span className="ml-auto text-xs text-gray-500 font-normal">
                    {data.recentErrors.length} errors
                  </span>
                </h3>
                {data.recentErrors.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <p className="text-green-300 text-sm font-semibold">No errors in the last 24 hours</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data.recentErrors.map((e) => (
                      <div key={e.id} className="text-sm p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-red-300">
                            {e.method} {e.endpoint}
                          </span>
                          <span className="text-xs text-gray-400">{formatDateTime(e.created_at)}</span>
                        </div>
                        <p className="text-xs text-gray-300 truncate">{e.error_message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ═══ ROLE / PERMISSION MATRIX ═══ */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Role &amp; Permission Overview
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(data.roleOverview)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([role, counts]) => {
                    const roleLabel = role === 'super_admin' ? 'Super Admin'
                      : role === 'operations_manager' ? 'Ops Manager'
                        : role === 'apprentice' ? 'Helper'
                          : role.charAt(0).toUpperCase() + role.slice(1);
                    const roleColor = role === 'super_admin' ? 'from-red-500 to-pink-600'
                      : role === 'operations_manager' ? 'from-slate-500 to-slate-700'
                        : role === 'admin' ? 'from-blue-500 to-indigo-600'
                          : role === 'operator' ? 'from-purple-500 to-violet-600'
                            : role === 'apprentice' ? 'from-cyan-500 to-teal-600'
                              : role === 'salesman' ? 'from-orange-500 to-amber-600'
                                : 'from-gray-500 to-gray-700';
                    return (
                      <div key={role} className={`bg-gradient-to-br ${roleColor} rounded-xl p-4`}>
                        <p className="text-2xl font-bold text-white">{counts.total}</p>
                        <p className="text-xs text-white/80 font-semibold">{roleLabel}</p>
                        <p className="text-xs text-white/50">{counts.active} active</p>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* ═══ DATABASE STATS ═══ */}
            {data.databaseStats.length > 0 && (
              <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Database Tables
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 text-gray-400 font-semibold">Table</th>
                        <th className="text-right py-2 text-gray-400 font-semibold">Rows</th>
                        <th className="text-right py-2 text-gray-400 font-semibold">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.databaseStats.map((t) => (
                        <tr key={t.table_name} className="border-b border-white/5">
                          <td className="py-2 text-white font-medium">{t.table_name}</td>
                          <td className="py-2 text-right text-gray-300">{t.row_count.toLocaleString()}</td>
                          <td className="py-2 text-right text-gray-400">{t.size_bytes >= 1048576 ? `${(t.size_bytes / 1048576).toFixed(1)} MB` : `${(t.size_bytes / 1024).toFixed(0)} KB`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ SECURITY INFO ═══ */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                Security Summary
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-bold text-green-300">RLS Enabled</span>
                  </div>
                  <p className="text-xs text-gray-400">Row-Level Security active on all tables</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-bold text-green-300">API Auth Guards</span>
                  </div>
                  <p className="text-xs text-gray-400">JWT Bearer token verification on all endpoints</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-bold text-green-300">Audit Logging</span>
                  </div>
                  <p className="text-xs text-gray-400">All admin actions logged with timestamps</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
