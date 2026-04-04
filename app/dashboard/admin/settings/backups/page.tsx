'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import {
  Database,
  Download,
  Shield,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  FileText,
} from 'lucide-react';

interface BackupRecord {
  id: string;
  created_at: string;
  backup_type: 'manual' | 'scheduled';
  record_count: number;
  file_size_bytes: number;
  status: 'completed' | 'pending' | 'failed';
}

export default function BackupsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || !['admin', 'operations_manager', 'super_admin'].includes(user.role)) {
      router.push('/dashboard/admin');
      return;
    }
    setAuthed(true);
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch('/api/admin/backups/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { success: boolean; data: BackupRecord[] };
      if (data.success) setBackups(data.data || []);
    } catch {
      // silently fail — table may not exist yet
    } finally {
      setLoading(false);
    }
  }

  async function downloadBackup() {
    setDownloading(true);
    setError('');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/backups/contacts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json() as {
        success: boolean;
        data?: { csv: string; filename: string; recordCount: number };
        error?: string;
      };

      if (!data.success || !data.data) {
        setError(data.error || 'Failed to generate backup');
        return;
      }

      const blob = new Blob([data.data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await loadBackups();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setDownloading(false);
    }
  }

  if (!authed) return null;

  const lastBackup = backups[0];

  function formatBytes(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  return (
    <div className="min-h-screen bg-[#0f0f17] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/dashboard/admin/settings')}
            className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <Database className="w-6 h-6 text-violet-400" />
              Data Backups
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Protect your customer data. Export anytime — your data is always yours.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Last Backup</p>
            <p className="text-white font-bold text-sm">
              {lastBackup ? formatDate(lastBackup.created_at) : 'No backups yet'}
            </p>
          </div>
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Records Backed Up</p>
            <p className="text-white font-bold text-sm">
              {lastBackup ? `${lastBackup.record_count.toLocaleString()} contacts` : '—'}
            </p>
          </div>
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Exports</p>
            <p className="text-white font-bold text-sm">{backups.length}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-violet-500/10 to-violet-900/10 border border-violet-500/30 rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-400" />
                Contact Backup (CSV)
              </h2>
              <p className="text-zinc-400 text-sm">
                Downloads all customer names, emails, phones, and addresses. Compatible with Excel,
                Google Sheets, and any CRM.
              </p>
            </div>
            <button
              onClick={downloadBackup}
              disabled={downloading}
              className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl text-white font-bold text-sm transition-all whitespace-nowrap"
            >
              {downloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Backup
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm mb-1">Automatic Database Backups</p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Supabase (AWS) runs automatic point-in-time recovery with 7-day retention on all your data.
              </p>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm mb-1">Manual CSV Exports</p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Download a contact snapshot any time. Keep a local copy or import into another tool.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="font-bold text-white">Export History</h3>
            <button
              onClick={loadBackups}
              className="p-1.5 rounded-lg hover:bg-white/[0.05] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-zinc-600 text-sm">Loading...</div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center">
              <Database className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No exports yet. Click &quot;Download Backup&quot; to create your first.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <div>
                    <p className="text-sm text-white font-medium">{formatDate(b.created_at)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {b.record_count.toLocaleString()} contacts · {formatBytes(b.file_size_bytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      b.backup_type === 'manual'
                        ? 'bg-violet-500/15 text-violet-300'
                        : 'bg-blue-500/15 text-blue-300'
                    }`}>
                      {b.backup_type}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
