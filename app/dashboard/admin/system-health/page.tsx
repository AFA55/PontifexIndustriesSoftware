'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  Activity, Server, Database, Shield, HardDrive, Users, Briefcase,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Clock, Wifi,
  ArrowLeft, Globe, Bug, TrendingUp, Zap, Eye, ChevronRight,
  MonitorSmartphone, Bell
} from 'lucide-react';

interface ServiceStatus {
  status: string;
  latency_ms: number;
  error: string | null;
}

interface SystemHealthData {
  overall_status: string;
  timestamp: string;
  services: {
    database: ServiceStatus;
    authentication: ServiceStatus;
    storage: ServiceStatus;
  };
  users: {
    total: number;
    by_role: Record<string, number>;
  };
  jobs: {
    total: number;
    today: number;
    this_week: number;
    by_status: Record<string, number>;
  };
  errors: {
    last_24h: number;
    last_7d: number;
    recent: Array<{
      type: string;
      error_message: string;
      url: string;
      created_at: string;
    }>;
  };
  active_users: {
    count: number;
  };
  recent_logins: Array<{
    user_id: string;
    user_email: string;
    action: string;
    created_at: string;
  }>;
  storage: {
    buckets: Array<{
      name: string;
      id: string;
      public: boolean;
    }>;
  };
}

export default function SystemHealthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchHealth = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch('/api/admin/system-health', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        if (res.status === 403) {
          setError('Super admin access required');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLastRefresh(new Date());
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch system health');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Auth guard
    const u = getCurrentUser();
    if (!u || u.role !== 'super_admin') {
      router.push('/dashboard/admin');
      return;
    }
    fetchHealth();
  }, [router, fetchHealth]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'ok' || status === 'healthy') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === 'degraded') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      ok: 'bg-green-100 text-green-700 border-green-200',
      healthy: 'bg-green-100 text-green-700 border-green-200',
      degraded: 'bg-amber-100 text-amber-700 border-amber-200',
      down: 'bg-red-100 text-red-700 border-red-200',
      critical: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${colors[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const LatencyBar = ({ ms }: { ms: number }) => {
    const pct = Math.min(100, (ms / 3000) * 100);
    const color = ms < 500 ? 'bg-green-500' : ms < 1500 ? 'bg-amber-500' : 'bg-red-500';
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono text-gray-500">{ms}ms</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-violet-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading system health...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard/admin')} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard/admin')} className="p-2 hover:bg-gray-100 rounded-xl">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  data.overall_status === 'healthy' ? 'bg-green-100' :
                  data.overall_status === 'degraded' ? 'bg-amber-100' : 'bg-red-100'
                }`}>
                  <Activity className={`w-5 h-5 ${
                    data.overall_status === 'healthy' ? 'text-green-600' :
                    data.overall_status === 'degraded' ? 'text-amber-600' : 'text-red-600'
                  }`} />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">System Health</h1>
                  <p className="text-xs text-gray-500">Central monitoring hub</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={data.overall_status} />
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {lastRefresh.toLocaleTimeString()}</span>
              </div>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  autoRefresh
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              </button>
              <button
                onClick={fetchHealth}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Service Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Database */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Database</h3>
                  <p className="text-xs text-gray-400">PostgreSQL / Supabase</p>
                </div>
              </div>
              <StatusIcon status={data.services.database.status} />
            </div>
            <LatencyBar ms={data.services.database.latency_ms} />
            {data.services.database.error && (
              <p className="text-xs text-red-500 mt-2">{data.services.database.error}</p>
            )}
          </div>

          {/* Authentication */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Authentication</h3>
                  <p className="text-xs text-gray-400">Supabase Auth</p>
                </div>
              </div>
              <StatusIcon status={data.services.authentication.status} />
            </div>
            <LatencyBar ms={data.services.authentication.latency_ms} />
            {data.services.authentication.error && (
              <p className="text-xs text-red-500 mt-2">{data.services.authentication.error}</p>
            )}
          </div>

          {/* Storage */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">File Storage</h3>
                  <p className="text-xs text-gray-400">Supabase Storage</p>
                </div>
              </div>
              <StatusIcon status={data.services.storage.status} />
            </div>
            <LatencyBar ms={data.services.storage.latency_ms} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.storage.buckets.map(b => (
                <span key={b.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-mono rounded-md">
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <QuickStat icon={<Users className="w-5 h-5 text-violet-600" />} label="Total Users" value={data.users.total} bg="bg-violet-50" />
          <QuickStat icon={<Eye className="w-5 h-5 text-blue-600" />} label="Active (24h)" value={data.active_users.count} bg="bg-blue-50" />
          <QuickStat icon={<Briefcase className="w-5 h-5 text-emerald-600" />} label="Jobs Today" value={data.jobs.today} bg="bg-emerald-50" />
          <QuickStat icon={<TrendingUp className="w-5 h-5 text-amber-600" />} label="Jobs This Week" value={data.jobs.this_week} bg="bg-amber-50" />
          <QuickStat icon={<Bug className="w-5 h-5 text-red-600" />} label="Errors (24h)" value={data.errors.last_24h} bg="bg-red-50" alert={data.errors.last_24h > 10} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users by Role */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-600" />
              Users by Role
            </h3>
            <div className="space-y-3">
              {Object.entries(data.users.by_role)
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-violet-500" />
                      <span className="text-sm text-gray-700 capitalize">{role.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Jobs by Status */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-600" />
              Jobs by Status ({data.jobs.total} total)
            </h3>
            <div className="space-y-3">
              {Object.entries(data.jobs.by_status)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                  const pct = data.jobs.total > 0 ? Math.round((count / data.jobs.total) * 100) : 0;
                  const colors: Record<string, string> = {
                    completed: 'bg-green-500',
                    in_progress: 'bg-blue-500',
                    assigned: 'bg-violet-500',
                    pending: 'bg-amber-500',
                    scheduled: 'bg-indigo-500',
                    cancelled: 'bg-red-500',
                  };
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700 capitalize">{status.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-500">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors[status] || 'bg-gray-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Recent Logins */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Recent Logins
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.recent_logins.length === 0 ? (
                <p className="text-sm text-gray-400">No recent logins tracked</p>
              ) : (
                data.recent_logins.map((login, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-600">
                          {(login.user_email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm text-gray-700">{login.user_email}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(login.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Errors */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Bug className="w-4 h-4 text-red-600" />
              Recent Errors
              {data.errors.last_24h > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                  {data.errors.last_24h} today
                </span>
              )}
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.errors.recent.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No errors recorded</p>
                </div>
              ) : (
                data.errors.recent.map((err, i) => (
                  <div key={i} className="p-3 bg-red-50 rounded-xl">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-medium text-red-800 capitalize">{err.type.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-red-400">
                        {new Date(err.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-red-600 mt-1 line-clamp-2">{err.error_message}</p>
                    {err.url && (
                      <p className="text-[10px] text-red-400 mt-1 font-mono truncate">{err.url}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Backup & Infrastructure Info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-gray-600" />
            Infrastructure & Backup Status
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Daily Backups</span>
              </div>
              <p className="text-xs text-green-600">Supabase automatic daily backups enabled. Point-in-time recovery available for the last 7 days.</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">SSL/TLS</span>
              </div>
              <p className="text-xs text-blue-600">All connections encrypted with TLS 1.2+. Database connections use SSL by default.</p>
            </div>
            <div className="p-4 bg-violet-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-violet-800">Edge Network</span>
              </div>
              <p className="text-xs text-violet-600">Deployed on Vercel edge network with global CDN. Supabase hosted in US region.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickStat({ icon, label, value, bg, alert }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border ${alert ? 'border-red-200' : 'border-gray-200'} p-4`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        <div>
          <p className={`text-xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
