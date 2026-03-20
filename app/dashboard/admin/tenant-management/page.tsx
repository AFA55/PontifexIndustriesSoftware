'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  Building2, Plus, Search, ArrowLeft, Users, Globe, Shield,
  CheckCircle, XCircle, AlertTriangle, Clock, ChevronRight,
  Zap, Crown, Briefcase, X, RefreshCw, Database,
  Download, HardDrive, Server
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  plan: string;
  max_users: number;
  max_jobs_per_month: number;
  features: Record<string, boolean>;
  owner_id: string | null;
  billing_email: string | null;
  created_at: string;
  tenant_users?: { count: number }[];
}

interface BackupInfo {
  enabled: boolean;
  type: string;
  frequency: string;
  retention: string;
  provider: string;
  note: string;
}

export default function TenantManagementPage() {
  const router = useRouter();
  const { success, error: showError } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'tenants' | 'backups'>('tenants');

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/tenants', { headers });
      const json = await res.json();
      if (json.success) setTenants(json.data || []);
    } catch {
      // May fail if migration not run yet
    }
  }, [getHeaders]);

  const fetchBackups = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/backups', { headers });
      const json = await res.json();
      if (json.success) {
        setBackups(json.data || []);
        if (json.supabase_backups) setBackupInfo(json.supabase_backups);
      }
    } catch {
      // May fail if migration not run yet
    }
  }, [getHeaders]);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u || u.role !== 'super_admin') {
      router.push('/dashboard');
      return;
    }
    Promise.all([fetchTenants(), fetchBackups()]).finally(() => setLoading(false));
  }, [router, fetchTenants, fetchBackups]);

  const handleCreateTenant = async (data: any) => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        success('Tenant created', `${data.name} is now active`);
        setShowCreateModal(false);
        fetchTenants();
      } else {
        showError('Failed to create tenant', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    }
  };

  const handleTriggerBackup = async () => {
    setBackupLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual', notes: 'Manual backup from admin portal' }),
      });
      const json = await res.json();
      if (json.success) {
        success('Backup completed', `${json.data?.total_rows || 0} rows backed up (${json.data?.size_human || '?'})`);
        fetchBackups();
      } else {
        showError('Backup failed', json.error);
      }
    } catch (err: any) {
      showError('Backup error', err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleUpdateStatus = async (tenantId: string, status: string) => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        success('Tenant updated', `Status changed to ${status}`);
        fetchTenants();
      } else {
        showError('Update failed', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    }
  };

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    suspended: 'bg-red-100 text-red-700 border-red-200',
    trial: 'bg-amber-100 text-amber-700 border-amber-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  };

  const planIcons: Record<string, React.ReactNode> = {
    starter: <Zap className="w-4 h-4 text-amber-500" />,
    professional: <Briefcase className="w-4 h-4 text-violet-500" />,
    enterprise: <Crown className="w-4 h-4 text-yellow-500" />,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-violet-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-gray-100 rounded-xl">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Platform Management</h1>
                  <p className="text-xs text-gray-500">Tenants, Users & Backups</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Tenant
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setActiveTab('tenants')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'tenants'
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-1.5" />
              Tenants ({tenants.length})
            </button>
            <button
              onClick={() => setActiveTab('backups')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'backups'
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Database className="w-4 h-4 inline mr-1.5" />
              Backups
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'tenants' && (
          <>
            {/* Search */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
              />
            </div>

            {/* Tenant Cards */}
            {filteredTenants.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="font-bold text-gray-900 mb-2">No tenants yet</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Create your first tenant to start the multi-tenant platform.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700"
                >
                  Create First Tenant
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTenants.map(tenant => (
                  <div key={tenant.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                          {tenant.name[0].toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{tenant.name}</h3>
                          <p className="text-xs text-gray-400 font-mono">{tenant.slug}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${statusColors[tenant.status] || 'bg-gray-100 text-gray-500'}`}>
                        {tenant.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-400">Plan</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          {planIcons[tenant.plan]}
                          <span className="text-sm font-bold text-gray-900 capitalize">{tenant.plan}</span>
                        </div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-400">Max Users</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">{tenant.max_users}</p>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-400">Jobs/mo</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">{tenant.max_jobs_per_month}</p>
                      </div>
                    </div>

                    {tenant.domain && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                        <Globe className="w-3.5 h-3.5" />
                        {tenant.domain}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-[10px] text-gray-400">
                        Created {new Date(tenant.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        {tenant.status === 'active' ? (
                          <button
                            onClick={() => handleUpdateStatus(tenant.id, 'suspended')}
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            Suspend
                          </button>
                        ) : tenant.status === 'suspended' ? (
                          <button
                            onClick={() => handleUpdateStatus(tenant.id, 'active')}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            Reactivate
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'backups' && (
          <div className="space-y-6">
            {/* Supabase Auto-Backups Info */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-green-900 text-lg">Automatic Daily Backups</h3>
                  <p className="text-sm text-green-700 mt-1">
                    Supabase automatically creates daily backups of your entire database with point-in-time recovery.
                    Your data is protected 24/7 with no manual action required.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="bg-white/60 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">Frequency</p>
                      <p className="text-sm font-bold text-green-900">Daily</p>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">Recovery</p>
                      <p className="text-sm font-bold text-green-900">Point-in-time</p>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">Retention</p>
                      <p className="text-sm font-bold text-green-900">7 days</p>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">Encryption</p>
                      <p className="text-sm font-bold text-green-900">AES-256</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Backup */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Download className="w-4 h-4 text-violet-600" />
                    Manual Data Snapshot
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Export a JSON snapshot of all critical tables to Supabase Storage
                  </p>
                </div>
                <button
                  onClick={handleTriggerBackup}
                  disabled={backupLoading}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  {backupLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Backing up...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Create Backup Now
                    </>
                  )}
                </button>
              </div>

              {/* Backup History */}
              {backups.length > 0 ? (
                <div className="space-y-2 mt-4">
                  {backups.map((backup: any) => (
                    <div key={backup.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        {backup.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : backup.status === 'failed' ? (
                          <XCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {backup.backup_type} backup
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(backup.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {backup.size_bytes && (
                          <p className="text-sm font-mono text-gray-700">
                            {formatBytes(backup.size_bytes)}
                          </p>
                        )}
                        {backup.duration_ms && (
                          <p className="text-xs text-gray-400">{backup.duration_ms}ms</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-xl mt-4">
                  <HardDrive className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No manual backups yet</p>
                  <p className="text-xs text-gray-400 mt-1">Click &quot;Create Backup Now&quot; to create your first snapshot</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTenant}
        />
      )}
    </div>
  );
}

function CreateTenantModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [domain, setDomain] = useState('');
  const [plan, setPlan] = useState('professional');
  const [maxUsers, setMaxUsers] = useState('50');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [billingEmail, setBillingEmail] = useState('');

  // Auto-generate slug from name
  useEffect(() => {
    if (name && !slug) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  }, [name, slug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      domain: domain || undefined,
      plan,
      max_users: parseInt(maxUsers) || 50,
      owner_email: ownerEmail || undefined,
      billing_email: billingEmail || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-violet-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Create New Tenant</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); if (!slug) setSlug(''); }}
              required
              placeholder="Patriot Concrete Cutting"
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
            <div className="flex items-center">
              <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-400">app.pontifex.com/</span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
                placeholder="patriot-concrete"
                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-r-xl text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="app.patriotconcrete.com"
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select
                value={plan}
                onChange={e => setPlan(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
              <input
                type="number"
                value={maxUsers}
                onChange={e => setMaxUsers(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              placeholder="owner@patriotconcrete.com"
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Email</label>
            <input
              type="email"
              value={billingEmail}
              onChange={e => setBillingEmail(e.target.value)}
              placeholder="billing@patriotconcrete.com"
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Create Tenant
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
