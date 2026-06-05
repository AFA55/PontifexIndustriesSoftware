'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Download, Database, RefreshCw, CheckCircle, XCircle, HardDrive,
} from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { getHeaders, getJsonHeaders } from '@/components/platform/shared';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function PlatformBackupsPage() {
  const { success, error: showError } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/backups', { headers });
      const json = await res.json();
      if (json.success) setBackups(json.data || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const handleTriggerBackup = async () => {
    setBackupLoading(true);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch('/api/admin/backups', {
        method: 'POST', headers,
        body: JSON.stringify({ type: 'manual', notes: 'Manual backup from platform console' }),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Backups</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">Automatic daily backups + on-demand snapshots</p>
      </div>

      {/* Auto-backups */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-2xl border border-green-200 dark:border-green-900 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-green-900 dark:text-green-300 text-lg">Automatic Daily Backups</h3>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
              Supabase automatically creates daily backups of the entire database with point-in-time recovery.
              Data is protected 24/7 with no manual action required.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {[['Frequency', 'Daily'], ['Recovery', 'Point-in-time'], ['Retention', '7 days'], ['Encryption', 'AES-256']].map(([k, v]) => (
                <div key={k} className="bg-white/60 dark:bg-slate-900/40 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-medium">{k}</p>
                  <p className="text-sm font-bold text-green-900 dark:text-green-300">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manual snapshot */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-violet-600" /> Manual Data Snapshot
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Export a JSON snapshot of all critical tables to Supabase Storage</p>
          </div>
          <button
            onClick={handleTriggerBackup}
            disabled={backupLoading}
            className="px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {backupLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />Backing up…</> : <><Database className="w-4 h-4" />Create Backup Now</>}
          </button>
        </div>

        {backups.length > 0 ? (
          <div className="space-y-2 mt-4">
            {backups.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <div className="flex items-center gap-3">
                  {b.status === 'completed' ? <CheckCircle className="w-5 h-5 text-green-500" />
                    : b.status === 'failed' ? <XCircle className="w-5 h-5 text-red-500" />
                    : <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{b.backup_type} backup</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  {b.size_bytes && <p className="text-sm font-mono text-gray-700 dark:text-slate-300">{formatBytes(b.size_bytes)}</p>}
                  {b.duration_ms && <p className="text-xs text-gray-400">{b.duration_ms}ms</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 dark:bg-slate-800 rounded-xl mt-4">
            <HardDrive className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No manual backups yet</p>
            <p className="text-xs text-gray-400 mt-1">Click &quot;Create Backup Now&quot; to create your first snapshot</p>
          </div>
        )}
      </div>
    </div>
  );
}
