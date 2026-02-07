'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function JobStatusSyncDebugger() {
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>>([]);
  const [loading, setLoading] = useState(false);
  const [jobOrders, setJobOrders] = useState<any[]>([]);
  const [projectBoardJobs, setProjectBoardJobs] = useState<any[]>([]);
  const [orphanedJobs, setOrphanedJobs] = useState<any[]>([]);

  const addLog = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const checkJobOrdersTable = async () => {
    setLoading(true);
    addLog('🔍 Checking job_orders table...', 'info');

    try {
      const { data, error } = await supabase
        .from('job_orders')
        .select('*')
        .order('scheduled_date', { ascending: false });

      if (error) {
        addLog(`❌ Error fetching job_orders: ${error.message}`, 'error');
      } else {
        setJobOrders(data || []);
        addLog(`✅ Found ${data?.length || 0} jobs in job_orders table`, 'success');

        // Status breakdown
        const statusCounts = (data || []).reduce((acc: any, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {});

        addLog(`📊 Status breakdown: ${JSON.stringify(statusCounts, null, 2)}`, 'info');

        // Check for multi-day jobs
        const multiDayJobs = data?.filter(job => {
          // Check if job has daily logs (indicating it's been running multiple days)
          return job.status === 'in_progress' || job.status === 'scheduled';
        });

        addLog(`📅 Active/Scheduled jobs: ${multiDayJobs?.length || 0}`, 'info');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const checkDailyLogs = async () => {
    setLoading(true);
    addLog('🔍 Checking daily_job_logs for multi-day jobs...', 'info');

    try {
      const { data, error } = await supabase
        .from('daily_job_logs')
        .select('*, job_orders(job_number, customer, status)')
        .order('created_at', { ascending: false });

      if (error) {
        addLog(`❌ Error fetching daily logs: ${error.message}`, 'error');
      } else {
        addLog(`✅ Found ${data?.length || 0} daily log entries`, 'success');

        // Group by job
        const jobGroups = (data || []).reduce((acc: any, log) => {
          const jobId = log.job_order_id;
          if (!acc[jobId]) {
            acc[jobId] = [];
          }
          acc[jobId].push(log);
          return acc;
        }, {});

        const multiDayJobs = Object.keys(jobGroups).filter(jobId => jobGroups[jobId].length > 1);
        addLog(`📊 Jobs running multiple days: ${multiDayJobs.length}`, 'info');

        Object.keys(jobGroups).forEach(jobId => {
          const logs = jobGroups[jobId];
          if (logs.length > 1) {
            addLog(`   📌 Job ${logs[0]?.job_orders?.job_number}: ${logs.length} days of logs`, 'info');
          }
        });
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const checkWorkPerformed = async () => {
    setLoading(true);
    addLog('🔍 Checking work_performed table...', 'info');

    try {
      const { data, error } = await supabase
        .from('work_performed')
        .select('*, job_orders(job_number, customer, status)')
        .order('created_at', { ascending: false });

      if (error) {
        addLog(`❌ Error fetching work_performed: ${error.message}`, 'error');
      } else {
        addLog(`✅ Found ${data?.length || 0} work performed entries`, 'success');

        // Group by job
        const jobWork = (data || []).reduce((acc: any, work) => {
          const jobId = work.job_order_id;
          if (!acc[jobId]) {
            acc[jobId] = [];
          }
          acc[jobId].push(work);
          return acc;
        }, {});

        addLog(`📊 Jobs with work performed: ${Object.keys(jobWork).length}`, 'info');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncJobStatuses = async () => {
    setLoading(true);
    addLog('🔄 Syncing job statuses...', 'info');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addLog('❌ No active session', 'error');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/sync-job-statuses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (response.ok) {
        addLog(`✅ Job statuses synced successfully`, 'success');
        addLog(`📊 Result: ${JSON.stringify(result, null, 2)}`, 'info');
      } else {
        addLog(`❌ Sync failed: ${result.error}`, 'error');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const findOrphanedJobs = async () => {
    setLoading(true);
    addLog('🔍 Finding orphaned jobs (no job_order record)...', 'info');

    try {
      // This would check if project board has jobs that don't exist in job_orders
      const { data: allJobs, error: jobError } = await supabase
        .from('job_orders')
        .select('id, job_number, status');

      if (jobError) {
        addLog(`❌ Error: ${jobError.message}`, 'error');
        setLoading(false);
        return;
      }

      const validJobIds = new Set(allJobs?.map(j => j.id) || []);

      // Check work_performed for orphaned entries
      const { data: workEntries } = await supabase
        .from('work_performed')
        .select('job_order_id');

      const orphanedWork = workEntries?.filter(w => !validJobIds.has(w.job_order_id)) || [];

      if (orphanedWork.length > 0) {
        addLog(`⚠️ Found ${orphanedWork.length} orphaned work_performed entries`, 'warning');
        setOrphanedJobs(orphanedWork);
      } else {
        addLog(`✅ No orphaned entries found`, 'success');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const cleanupOrphanedData = async () => {
    if (orphanedJobs.length === 0) {
      addLog('⚠️ No orphaned jobs to clean up', 'warning');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${orphanedJobs.length} orphaned entries? This cannot be undone.`)) {
      return;
    }

    setLoading(true);
    addLog('🧹 Cleaning up orphaned data...', 'info');

    try {
      const orphanedIds = orphanedJobs.map(j => j.job_order_id);

      const { error } = await supabase
        .from('work_performed')
        .delete()
        .in('job_order_id', orphanedIds);

      if (error) {
        addLog(`❌ Cleanup failed: ${error.message}`, 'error');
      } else {
        addLog(`✅ Cleaned up ${orphanedJobs.length} orphaned entries`, 'success');
        setOrphanedJobs([]);
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Job Status Sync Debugger</h1>
          <p className="text-gray-600">Diagnose and fix job status tracking issues</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Tests */}
          <div className="space-y-6">
            {/* Database Checks */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-blue-900 mb-4">Database Checks</h2>
              <div className="space-y-3">
                <button
                  onClick={checkJobOrdersTable}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Check Job Orders Table
                </button>
                <button
                  onClick={checkDailyLogs}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400"
                >
                  Check Daily Logs (Multi-Day Jobs)
                </button>
                <button
                  onClick={checkWorkPerformed}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
                >
                  Check Work Performed
                </button>
              </div>
            </div>

            {/* Data Integrity */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-yellow-900 mb-4">Data Integrity</h2>
              <div className="space-y-3">
                <button
                  onClick={findOrphanedJobs}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 disabled:bg-gray-400"
                >
                  Find Orphaned Jobs
                </button>
                {orphanedJobs.length > 0 && (
                  <button
                    onClick={cleanupOrphanedData}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400"
                  >
                    Cleanup {orphanedJobs.length} Orphaned Entries
                  </button>
                )}
              </div>
            </div>

            {/* Sync Actions */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-green-900 mb-4">Sync Actions</h2>
              <button
                onClick={syncJobStatuses}
                disabled={loading}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
              >
                Sync All Job Statuses
              </button>
            </div>

            {/* Job Summary */}
            {jobOrders.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h2 className="text-xl font-bold text-indigo-900 mb-4">Job Summary</h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {jobOrders.slice(0, 10).map((job, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-900">{job.job_number}</p>
                          <p className="text-sm text-gray-600">{job.customer}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          job.status === 'completed' ? 'bg-green-100 text-green-700' :
                          job.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          job.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {job.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(job.scheduled_date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Logs */}
          <div className="bg-white rounded-2xl shadow-xl p-6 h-fit lg:sticky lg:top-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Debug Logs</h2>
              <button
                onClick={clearLogs}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600"
              >
                Clear
              </button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 h-[800px] overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No logs yet. Run some checks!</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded ${
                        log.type === 'success' ? 'bg-green-900/30 text-green-300' :
                        log.type === 'error' ? 'bg-red-900/30 text-red-300' :
                        log.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300' :
                        'bg-blue-900/30 text-blue-300'
                      }`}
                    >
                      <span className="text-gray-500 text-xs">[{log.timestamp}]</span>{' '}
                      <span className="whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mt-8">
          <h3 className="font-bold text-blue-900 mb-2">🎯 Debugging Guide</h3>
          <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
            <li>Click "Check Job Orders Table" to see all jobs and their statuses</li>
            <li>Click "Check Daily Logs" to see multi-day job tracking</li>
            <li>Click "Check Work Performed" to verify work entries are linked</li>
            <li>Click "Find Orphaned Jobs" to find data without valid job records</li>
            <li>Use "Cleanup" to remove orphaned data (cannot be undone!)</li>
            <li>Click "Sync All Job Statuses" to force update all job statuses</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
