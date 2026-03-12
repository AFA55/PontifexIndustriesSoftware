'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Send, FileText } from 'lucide-react';

interface HelperWorkLogProps {
  jobId: string;
  jobNumber: string;
  customerName: string;
}

export default function HelperWorkLog({ jobId, jobNumber, customerName }: HelperWorkLogProps) {
  const [workDescription, setWorkDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingLog, setExistingLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkExistingLog();
  }, [jobId]);

  const checkExistingLog = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/helper-work-log?job_order_id=${jobId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.has_log && result.data) {
          setExistingLog(result.data.work_description);
          setWorkDescription(result.data.work_description);
          setSubmitted(true);
        }
      }
    } catch (err) {
      console.error('Error checking existing log:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!workDescription.trim()) return;
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_order_id: jobId,
          work_description: workDescription.trim(),
        }),
      });

      if (response.ok) {
        setSubmitted(true);
        setExistingLog(workDescription.trim());
      }
    } catch (err) {
      console.error('Error submitting work log:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-24 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${submitted ? 'bg-green-100' : 'bg-orange-100'}`}>
          {submitted ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <FileText className="w-5 h-5 text-orange-600" />
          )}
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Work Log — #{jobNumber}</h3>
          <p className="text-sm text-gray-500">{customerName}</p>
        </div>
        {submitted && (
          <span className="ml-auto text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
            Submitted
          </span>
        )}
      </div>

      <textarea
        value={workDescription}
        onChange={(e) => {
          setWorkDescription(e.target.value);
          if (submitted && e.target.value !== existingLog) {
            setSubmitted(false);
          }
        }}
        placeholder="Describe the work you performed today..."
        rows={4}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
      />

      <button
        onClick={handleSubmit}
        disabled={submitting || !workDescription.trim() || (submitted && workDescription === existingLog)}
        className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
          submitted && workDescription === existingLog
            ? 'bg-green-100 text-green-700 cursor-default'
            : submitting || !workDescription.trim()
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg'
        }`}
      >
        {submitting ? (
          <>
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
            Saving...
          </>
        ) : submitted && workDescription === existingLog ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Work Log Saved
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            {existingLog ? 'Update Work Log' : 'Submit Work Log'}
          </>
        )}
      </button>
    </div>
  );
}
