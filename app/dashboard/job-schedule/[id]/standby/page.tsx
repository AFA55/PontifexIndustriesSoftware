'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { STANDBY_POLICY_SUMMARY, STANDBY_POLICY_FULL, STANDBY_HOURLY_RATE, calculateStandbyCharge } from '@/lib/legal/standby-policy';
import StandbyDebugger from '@/components/StandbyDebugger';

// Standby reasons
const STANDBY_REASONS = [
  { value: 'no_access', label: 'No Access to Work Area', description: 'Other trades or activities blocking access' },
  { value: 'incomplete_work', label: 'Prerequisite Work Incomplete', description: 'Other contractors have not finished required work' },
  { value: 'missing_materials', label: 'Missing Materials', description: 'Required materials not available on site' },
  { value: 'unsafe_conditions', label: 'Unsafe Working Conditions', description: 'Safety concerns preventing work' },
  { value: 'utility_issues', label: 'Utility Issues', description: 'Power, water, or other utilities not available' },
  { value: 'scope_change', label: 'Scope Changes', description: 'Work scope or location changed without notice' },
  { value: 'no_authorization', label: 'No Authorization', description: 'Client personnel unavailable for approvals' },
  { value: 'weather', label: 'Weather Conditions', description: 'Unsafe weather after arriving on-site' },
  { value: 'other', label: 'Other Delay', description: 'Other circumstances beyond our control' },
];

export default function StandbyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'reason' | 'policy' | 'timer'>('reason');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientSignature, setClientSignature] = useState('');
  const [standbyStartTime, setStandbyStartTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setLoading(false);

    // Update clock every second when timer is active
    if (step === 'timer') {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [router, step]);

  const handleReasonSubmit = () => {
    if (!selectedReason) {
      setError('Please select a reason for standby time');
      return;
    }
    if (selectedReason === 'other' && !customReason.trim()) {
      setError('Please describe the reason for standby time');
      return;
    }
    setError('');
    setStep('policy');
  };

  const handlePolicyAcknowledge = async () => {
    if (!clientName.trim()) {
      setError('Please enter the client representative name');
      return;
    }
    if (!clientSignature.trim()) {
      setError('Please provide client signature');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please log in again.');
        setSubmitting(false);
        return;
      }

      // Start standby timer
      const startTime = new Date();
      setStandbyStartTime(startTime);

      // Get reason text
      const reasonObj = STANDBY_REASONS.find(r => r.value === selectedReason);
      const reasonText = selectedReason === 'other'
        ? customReason
        : `${reasonObj?.label}: ${reasonObj?.description}`;

      // Create standby log in database
      const response = await fetch('/api/standby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          reason: reasonText,
          clientName: clientName,
          clientSignature: clientSignature,
          startedAt: startTime.toISOString(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to start standby timer');
        setSubmitting(false);
        return;
      }

      // Store standby log ID in local state
      localStorage.setItem(`standby-log-${jobId}`, result.data.id);

      // Move to timer step
      setStep('timer');
    } catch (err: any) {
      console.error('Error starting standby:', err);
      setError(err.message || 'An error occurred while starting standby timer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndStandby = async () => {
    if (!standbyStartTime) return;

    setSubmitting(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please log in again.');
        setSubmitting(false);
        return;
      }

      const standbyLogId = localStorage.getItem(`standby-log-${jobId}`);
      if (!standbyLogId) {
        setError('Could not find standby log ID');
        setSubmitting(false);
        return;
      }

      const endTime = new Date();

      // Update standby log in database
      const response = await fetch('/api/standby', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          standbyLogId: standbyLogId,
          endedAt: endTime.toISOString(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to end standby timer');
        setSubmitting(false);
        return;
      }

      // Clear local storage
      localStorage.removeItem(`standby-log-${jobId}`);

      // Redirect back to job detail page
      router.push(`/dashboard/job-schedule/${jobId}`);
    } catch (err: any) {
      console.error('Error ending standby:', err);
      setError(err.message || 'An error occurred while ending standby timer');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = () => {
    if (!standbyStartTime) return '0:00:00';
    const diff = currentTime.getTime() - standbyStartTime.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculateCurrentCharge = () => {
    if (!standbyStartTime) return 0;
    const diff = currentTime.getTime() - standbyStartTime.getTime();
    const hours = diff / 3600000;
    return calculateStandbyCharge(hours);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-orange-50">
      {/* Header */}
      <div className="bg-white border-b-4 border-yellow-500 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/job-schedule/${jobId}`}
              className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Job
            </Link>

            <h1 className="text-xl font-bold text-gray-800 text-center flex-1 mx-4">
              ⏱️ Standby Time
            </h1>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">{user?.name?.charAt(0) || 'U'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 shadow-lg mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-red-200 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-red-800 font-bold text-lg">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Select Reason */}
        {step === 'reason' && (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-yellow-100 p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Report Standby Time</h2>
            <p className="text-gray-600 mb-6">
              Please select the reason why work cannot proceed at this time.
            </p>

            <div className="space-y-3">
              {STANDBY_REASONS.map((reason) => (
                <button
                  key={reason.value}
                  onClick={() => setSelectedReason(reason.value)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                    selectedReason === reason.value
                      ? 'bg-yellow-50 border-yellow-500 shadow-md'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selectedReason === reason.value
                        ? 'border-yellow-500 bg-yellow-500'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {selectedReason === reason.value && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800">{reason.label}</h3>
                      <p className="text-sm text-gray-600">{reason.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {selectedReason === 'other' && (
              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Please describe the reason:
                </label>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Enter detailed description..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  rows={4}
                />
              </div>
            )}

            <button
              onClick={handleReasonSubmit}
              className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Continue to Policy Review
            </button>
          </div>
        )}

        {/* Step 2: Policy Acknowledgment */}
        {step === 'policy' && (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-yellow-100 p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Standby Time Policy</h2>
            <p className="text-gray-600 mb-6">
              The client representative must acknowledge the standby policy before the timer begins.
            </p>

            {/* Policy Summary */}
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6 rounded-r-xl">
              <h3 className="font-bold text-yellow-900 text-lg mb-2">Policy Summary</h3>
              <p className="text-yellow-800 whitespace-pre-line">{STANDBY_POLICY_SUMMARY}</p>
              <p className="text-yellow-900 font-bold mt-3">
                Billing Rate: ${STANDBY_HOURLY_RATE}/hour (minimum 1 hour)
              </p>
            </div>

            {/* Full Policy */}
            <details className="mb-6 bg-gray-50 rounded-xl p-4">
              <summary className="font-bold text-gray-800 cursor-pointer hover:text-yellow-600 transition-colors">
                View Full Policy Document
              </summary>
              <div className="mt-4 text-sm text-gray-700 whitespace-pre-line max-h-96 overflow-y-auto border-2 border-gray-200 rounded-lg p-4 bg-white">
                {STANDBY_POLICY_FULL}
              </div>
            </details>

            {/* Client Acknowledgment Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Client Representative Name *
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Client Representative Signature *
                </label>
                <input
                  type="text"
                  value={clientSignature}
                  onChange={(e) => setClientSignature(e.target.value)}
                  placeholder="Type signature here"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent font-signature text-xl"
                  style={{ fontFamily: 'cursive' }}
                />
                <p className="text-xs text-gray-500 mt-1">By typing your name, you agree to the terms above</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep('reason')}
                className="flex-1 px-6 py-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold text-lg transition-all duration-200"
                disabled={submitting}
              >
                Back
              </button>
              <button
                onClick={handlePolicyAcknowledge}
                disabled={submitting}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Starting...' : 'Start Standby Timer'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Active Timer */}
        {step === 'timer' && standbyStartTime && (
          <div className="space-y-6">
            {/* Timer Card */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-yellow-100 p-8 text-center">
              <div className="inline-block p-4 bg-yellow-100 rounded-full mb-4">
                <svg className="w-16 h-16 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-2">Standby Time Active</h2>
              <p className="text-gray-600 mb-6">Timer started at {standbyStartTime.toLocaleTimeString()}</p>

              {/* Large Timer Display */}
              <div className="bg-gradient-to-br from-yellow-100 to-orange-100 rounded-2xl p-8 mb-6">
                <div className="text-6xl font-bold text-yellow-900 font-mono">
                  {formatDuration()}
                </div>
                <p className="text-gray-700 font-semibold mt-4">
                  Current Charge: ${calculateCurrentCharge().toFixed(2)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  @ ${STANDBY_HOURLY_RATE}/hour (minimum 1 hour)
                </p>
              </div>

              <button
                onClick={handleEndStandby}
                disabled={submitting}
                className="w-full px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Ending...' : '⏹️ End Standby Time'}
              </button>
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
              <h3 className="font-bold text-blue-900 mb-3">While on Standby:</h3>
              <ul className="space-y-2 text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Remain on-site and available to work</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Document site conditions with photos if possible</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Communicate with foreman about expected resolution time</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Click "End Standby Time" as soon as work can resume</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Standby Debugger */}
        <StandbyDebugger jobId={jobId} />
      </div>
    </div>
  );
}
