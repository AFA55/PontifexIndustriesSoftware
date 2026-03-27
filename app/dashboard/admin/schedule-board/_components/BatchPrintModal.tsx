'use client';

import { useState } from 'react';
import { Printer, Check, X, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface BatchPrintModalProps {
  jobs: Array<{
    id: string;
    job_number: string;
    customer_name: string;
    job_type: string;
    location?: string;
    assigned_to_name?: string | null;
  }>;
  onClose: () => void;
}

export default function BatchPrintModal({ jobs, onClose }: BatchPrintModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(jobs.map(j => j.id)));
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selectedIds.size === jobs.length;
  const selectedCount = selectedIds.size;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(jobs.map(j => j.id)));
    }
  }

  function toggleJob(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handlePrint() {
    if (selectedCount === 0) return;

    setPrinting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated. Please log in and try again.');
        setPrinting(false);
        return;
      }

      const selected = jobs.filter(j => selectedIds.has(j.id));
      const results: { id: string; job_number: string; blob: Blob }[] = [];
      const errors: string[] = [];

      await Promise.all(
        selected.map(async (job) => {
          try {
            const res = await fetch(`/api/job-orders/${job.id}/dispatch-pdf`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) {
              errors.push(`${job.job_number}: ${res.statusText}`);
              return;
            }
            const blob = await res.blob();
            results.push({ id: job.id, job_number: job.job_number, blob });
          } catch {
            errors.push(`${job.job_number}: Network error`);
          }
        })
      );

      if (results.length === 0) {
        setError(`Failed to generate PDFs. ${errors.join('; ')}`);
        setPrinting(false);
        return;
      }

      // Open each PDF in a new tab for printing
      for (const result of results) {
        const url = URL.createObjectURL(result.blob);
        window.open(url, `_blank_${result.id}`);
      }

      if (errors.length > 0) {
        setError(`Generated ${results.length} of ${selected.length}. Failed: ${errors.join('; ')}`);
      } else {
        // All succeeded — close modal after brief delay
        setTimeout(() => onClose(), 500);
      }
    } catch {
      setError('Unexpected error generating PDFs.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[70]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-700 to-purple-500 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Printer className="w-5 h-5 text-white" />
              <h2 className="text-lg font-semibold text-white">Print Schedules</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Select All / Counter */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900 transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                allSelected
                  ? 'bg-purple-600 border-purple-600'
                  : 'border-gray-300 bg-white'
              }`}>
                {allSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-gray-500">
              {selectedCount} of {jobs.length} selected
            </span>
          </div>

          {/* Job List */}
          <div className="flex-1 overflow-y-auto px-6 py-2 divide-y divide-gray-50">
            {jobs.map((job) => {
              const isSelected = selectedIds.has(job.id);
              return (
                <label
                  key={job.id}
                  className={`flex items-center gap-3 py-3 cursor-pointer rounded-lg px-2 -mx-2 transition-colors ${
                    isSelected ? 'bg-purple-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-purple-600 border-purple-600'
                      : 'border-gray-300 bg-white'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => toggleJob(job.id)}
                  />

                  {/* Job Icon */}
                  <FileText className="w-4 h-4 text-purple-400 flex-shrink-0" />

                  {/* Job Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{job.job_number}</span>
                      <span className="text-xs text-gray-500">{job.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-purple-600 font-medium">{job.job_type}</span>
                      {job.assigned_to_name && (
                        <>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="text-xs text-gray-500">{job.assigned_to_name}</span>
                        </>
                      )}
                      {job.location && (
                        <>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="text-xs text-gray-400 truncate">{job.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}

            {jobs.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">
                No jobs available for printing.
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-6 py-2">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-700">
                {error}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={printing}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePrint}
              disabled={printing || selectedCount === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {printing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  Print Selected ({selectedCount})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
