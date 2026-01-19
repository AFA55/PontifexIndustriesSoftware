'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface WorkItem {
  work_type: string;
  linear_feet_cut: number;
  core_quantity: number;
}

export default function CompleteJob() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hoursWorked, setHoursWorked] = useState('');
  const [totalLinearFeet, setTotalLinearFeet] = useState(0);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [jobNumber, setJobNumber] = useState('');

  useEffect(() => {
    loadJobSummary();
  }, []);

  const loadJobSummary = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Get job details
      const { data: job } = await supabase
        .from('job_orders')
        .select('id')
        .eq('id', params.id)
        .single();

      if (job) {
        setJobNumber(job.id);
      }

      // Get all work items
      const response = await fetch(`/api/work-items?job_order_id=${params.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (result.success && result.data) {
        setWorkItems(result.data);

        // Calculate total linear feet
        const total = result.data.reduce((sum: number, item: WorkItem) => {
          return sum + (item.linear_feet_cut || 0);
        }, 0);

        setTotalLinearFeet(total);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading job summary:', error);
      setLoading(false);
    }
  };

  const handleCompleteJob = async () => {
    try {
      setSubmitting(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      // Validate hours
      const hours = parseFloat(hoursWorked);
      if (!hours || hours <= 0) {
        alert('Please enter valid hours worked (greater than 0)');
        setSubmitting(false);
        return;
      }

      // Call API to record performance
      const response = await fetch('/api/operator/complete-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: params.id,
          hoursWorked: hours
        })
      });

      const result = await response.json();

      if (result.success) {
        // Show success and redirect
        alert(`Job completed! Your performance has been recorded.\n\nProduction: ${result.data.totalLinearFeet.toFixed(1)} LF\nHours: ${hours}\nProductivity: ${result.data.productivityRate} LF/hour`);
        router.push('/dashboard');
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error completing job:', error);
      alert('Error completing job. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading job summary...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/job-schedule/${params.id}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Complete Job</h1>
                <p className="text-sm text-gray-600">Submit final performance</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              Job #{params.id}
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to Complete Job?</h2>
            <p className="text-gray-600">
              Review your work and submit your performance data
            </p>
          </div>

          {/* Job Summary */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-gray-900 mb-4">Work Summary</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-3 border-b border-gray-200">
                <span className="text-gray-700 font-medium">Total Work Items</span>
                <span className="text-2xl font-bold text-gray-900">{workItems.length}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-gray-200">
                <span className="text-gray-700 font-medium">Total Linear Feet Cut</span>
                <span className="text-2xl font-bold text-green-600">{totalLinearFeet.toFixed(1)} LF</span>
              </div>

              {workItems.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Work Items:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {workItems.map((item, index) => (
                      <li key={index} className="flex justify-between">
                        <span>{item.work_type || 'Work Item'}</span>
                        <span className="font-medium">{item.linear_feet_cut?.toFixed(1) || 0} LF</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Hours Worked Input */}
          <div className="mb-8">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Hours Worked on This Job *
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
              className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:outline-none text-gray-900 font-bold text-xl"
              placeholder="8.0"
            />
            <p className="text-xs text-gray-500 mt-2">
              Enter total hours worked on this job (including drive time, setup, work, cleanup)
            </p>

            {/* Productivity Preview */}
            {hoursWorked && parseFloat(hoursWorked) > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-900">Your Productivity Rate:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {(totalLinearFeet / parseFloat(hoursWorked)).toFixed(1)} LF/hour
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Complete Button */}
          <button
            onClick={handleCompleteJob}
            disabled={!hoursWorked || parseFloat(hoursWorked) <= 0 || submitting}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 ${
              hoursWorked && parseFloat(hoursWorked) > 0 && !submitting
                ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <>
                <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full"></div>
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Complete Job & Submit Performance
              </>
            )}
          </button>

          <p className="text-xs text-center text-gray-500 mt-4">
            By completing this job, your performance data will be recorded and used to track your productivity metrics.
          </p>
        </div>
      </div>
    </div>
  );
}
