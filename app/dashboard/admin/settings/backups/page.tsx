'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Database,
  Download,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileText,
  Calendar,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface ContactBackup {
  id: string;
  created_at: string;
  backup_type: 'manual' | 'scheduled';
  record_count: number;
  file_size_bytes: number;
  status: 'pending' | 'completed' | 'failed';
  notes: string | null;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BackupsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [backups, setBackups] = useState<ContactBackup[]>([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auth guard — admin+ only
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!['admin', 'operations_manager', 'super_admin'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [router]);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/backups/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setBackups(json.data || []);
      } else {
        setError(json.error || 'Failed to load backup history');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    setSuccessMsg('');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/backups/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || 'Backup failed — please try again');
        return;
      }

      // Trigger CSV download in browser
      const { csv, filename, recordCount } = json.data;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMsg(`Downloaded ${recordCount.toLocaleString()} records as ${filename}`);
      setTimeout(() => setSuccessMsg(''), 5000);

      // Refresh history
      fetchBackups();
    } catch {
      setError('Network error — please try again');
    } finally {
      setDownloading(false);
    }
  };

  const lastBackup = backups[0] || null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin/settings"
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-600" />
                  Data Backups
                </h1>
                <p className="text-gray-500 text-xs">
                  Protect your customer data with regular backups. Export anytime.
                </p>
              </div>
            </div>

            <button
              onClick={fetchBackups}
              disabled={loading}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
              title="Refresh backup history"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 max-w-3xl space-y-6">

        {/* Feedback messages */}
        {successMsg && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold animate-in slide-in-from-top duration-200">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ─── Manual Export Card ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Download className="w-5 h-5" />
              Contact &amp; Customer Export
            </h2>
            <p className="text-purple-200 text-sm mt-0.5">
              Download all customers and contacts as a CSV file.
            </p>
          </div>
          <div className="p-6 space-y-4">
            {/* Last backup status */}
            {lastBackup ? (
              <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                <CheckCircle className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-gray-900">
                    Last backup — {formatDate(lastBackup.created_at)}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {lastBackup.record_count.toLocaleString()} records &middot; {formatBytes(lastBackup.file_size_bytes)} &middot; {lastBackup.backup_type}
                  </p>
                </div>
              </div>
            ) : !loading ? (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700">
                  No backups yet. Download your first export now.
                </p>
              </div>
            ) : null}

            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-medium text-gray-800">What&apos;s included in the export:</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-500 text-xs pl-2">
                <li>All customer records (name, email, phone, address, type, payment terms)</li>
                <li>All contacts linked to customers (name, email, phone, title)</li>
                <li>Export date and active status for each record</li>
              </ul>
            </div>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-60"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating export...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Contact Backup
                </>
              )}
            </button>
          </div>
        </div>

        {/* ─── Automated Backup Notice ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Automated Backups
            </h2>
            <p className="text-emerald-100 text-sm mt-0.5">Your data is protected automatically.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <Clock className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-900">Every 24 hours</p>
                  <p className="text-xs text-gray-500">Automatic full-platform backup</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-900">7-day retention</p>
                  <p className="text-xs text-gray-500">Point-in-time recovery (Pro)</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 border border-gray-100">
              Backups run automatically every 24 hours and are stored securely via Supabase Pro.
              Manual CSV exports above are supplementary — download them before large imports or major changes.
            </p>
          </div>
        </div>

        {/* ─── Backup History Table ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-6 py-4 text-white">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Backup History
            </h2>
            <p className="text-slate-300 text-sm mt-0.5">Last 20 contact exports</p>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading history...</span>
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                <FileText className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium">No exports yet</p>
                <p className="text-xs text-gray-400">Your first backup will appear here after you download.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Records</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {formatDate(b.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          b.backup_type === 'scheduled'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {b.backup_type === 'scheduled' ? 'Scheduled' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">
                        {b.record_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                        {formatBytes(b.file_size_bytes)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {b.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Done
                          </span>
                        ) : b.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
