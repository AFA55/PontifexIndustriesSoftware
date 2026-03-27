'use client';

import { useState } from 'react';
import { X, Printer, FileText, Loader2, Check, MapPin, User } from 'lucide-react';

interface BatchPrintJob {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string;
  location?: string;
  assigned_to_name?: string | null;
}

interface BatchPrintModalProps {
  jobs: BatchPrintJob[];
  onClose: () => void;
}

export default function BatchPrintModal({ jobs, onClose }: BatchPrintModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(jobs.map(j => j.id)));
  const [printing, setPrinting] = useState(false);

  const toggleJob = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map(j => j.id)));
    }
  };

  const handlePrint = async () => {
    if (selected.size === 0) return;
    setPrinting(true);

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const selectedJobs = jobs.filter(j => selected.has(j.id));

      // Fetch all PDFs in parallel
      const pdfPromises = selectedJobs.map(async (job) => {
        const res = await fetch(`/api/job-orders/${job.id}/dispatch-pdf`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const blob = await res.blob();
          return { job, blob };
        }
        return null;
      });

      const results = await Promise.all(pdfPromises);
      const successfulPdfs = results.filter(Boolean);

      // Open each PDF in a new tab for printing
      for (const result of successfulPdfs) {
        if (result) {
          const pdfUrl = URL.createObjectURL(result.blob);
          window.open(pdfUrl, '_blank');
        }
      }

      onClose();
    } catch (err) {
      console.error('Error batch printing:', err);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-5 rounded-t-2xl text-white flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Printer className="w-5 h-5" /> Print Schedules
                </h2>
                <p className="text-purple-200 text-sm">Select jobs to print dispatch tickets</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Select all / count */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <button onClick={toggleAll} className="text-sm font-semibold text-purple-600 hover:text-purple-800 transition-colors">
              {selected.size === jobs.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-sm text-gray-500">
              <span className="font-bold text-gray-900">{selected.size}</span> of {jobs.length} selected
            </span>
          </div>

          {/* Job list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {jobs.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No jobs scheduled for this date</p>
              </div>
            ) : (
              jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => toggleJob(job.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                    selected.has(job.id) ? 'bg-purple-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected.has(job.id) ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                  }`}>
                    {selected.has(job.id) && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-purple-600">{job.job_number}</span>
                      <span className="font-semibold text-sm text-gray-900 truncate">{job.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500 truncate">
                        <MapPin className="w-3 h-3 inline mr-0.5" />{job.location || 'No location'}
                      </span>
                      {job.assigned_to_name && (
                        <span className="text-xs text-gray-500 truncate">
                          <User className="w-3 h-3 inline mr-0.5" />{job.assigned_to_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-semibold text-gray-600 flex-shrink-0">
                    {job.job_type?.split(',')[0]?.trim()}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4 flex items-center gap-3 flex-shrink-0">
            <button onClick={onClose}
              className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-sm transition-all">
              Cancel
            </button>
            <button
              onClick={handlePrint}
              disabled={selected.size === 0 || printing}
              className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {printing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDFs...</>
              ) : (
                <><Printer className="w-4 h-4" /> Print Selected ({selected.size})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
