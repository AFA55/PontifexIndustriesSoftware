'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Phone, Clock, AlertCircle } from 'lucide-react';

interface QuickAccessButtonsProps {
  jobId: string;
  onStandbyChange?: (isOnStandby: boolean) => void;
}

interface JobData {
  customer_name: string;
  location: string;
  address: string;
  foreman_phone?: string;
  foreman_name?: string;
}

interface StandbyLog {
  id: string;
  started_at: string;
  ended_at: string | null;
}

const STANDBY_REASONS = [
  { value: 'no_access', label: 'No Access to Work Area' },
  { value: 'incomplete_work', label: 'Prerequisite Work Incomplete' },
  { value: 'missing_materials', label: 'Missing Materials' },
  { value: 'unsafe_conditions', label: 'Unsafe Working Conditions' },
  { value: 'utility_issues', label: 'Utility Issues' },
  { value: 'scope_change', label: 'Scope Changes' },
  { value: 'weather', label: 'Weather Conditions' },
  { value: 'other', label: 'Other' },
];

export default function QuickAccessButtons({ jobId, onStandbyChange }: QuickAccessButtonsProps) {
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showStandbyModal, setShowStandbyModal] = useState(false);
  const [isOnStandby, setIsOnStandby] = useState(false);
  const [currentStandbyLog, setCurrentStandbyLog] = useState<StandbyLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmedStartTime, setConfirmedStartTime] = useState('');
  const [confirmedEndTime, setConfirmedEndTime] = useState('');
  const [standbyReason, setStandbyReason] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    fetchJobData();
    checkStandbyStatus();
  }, [jobId]);

  // Set default start time when opening start standby modal
  useEffect(() => {
    if (showStandbyModal && !isOnStandby && !confirmedStartTime) {
      const now = new Date();
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setConfirmedStartTime(localDateTime);
    }
  }, [showStandbyModal, isOnStandby]);

  // Set default end time when opening end standby modal
  useEffect(() => {
    if (showStandbyModal && isOnStandby && !confirmedEndTime) {
      const now = new Date();
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setConfirmedEndTime(localDateTime);
    }
  }, [showStandbyModal, isOnStandby]);


  const fetchJobData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/job-orders?id=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          setJobData(result.data[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching job data:', error);
    }
  };

  const checkStandbyStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/standby?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Find an active standby log (no ended_at) for this operator
          const activeLog = result.data.find(
            (log: any) => !log.ended_at && log.operator_id === session.user.id
          );
          if (activeLog) {
            setIsOnStandby(true);
            setCurrentStandbyLog(activeLog);
            if (onStandbyChange) {
              onStandbyChange(true);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking standby status:', error);
    }
  };

  const startStandby = async () => {
    if (!standbyReason) {
      showToast('Please select a reason for standby', 'error');
      return;
    }

    if (!confirmedStartTime) {
      showToast('Please confirm the start time', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/standby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          startedAt: confirmedStartTime,
          reason: standbyReason
        })
      });

      if (response.ok) {
        const result = await response.json();
        setIsOnStandby(true);
        setCurrentStandbyLog(result.data);
        setShowStandbyModal(false);
        setConfirmedStartTime('');
        setStandbyReason('');
        if (onStandbyChange) {
          onStandbyChange(true);
        }
        showToast('Standby time started. Stop standby before continuing work.');
      } else {
        showToast('Error starting standby time', 'error');
      }
    } catch (error) {
      console.error('Error starting standby:', error);
      showToast('Error starting standby time', 'error');
    } finally {
      setLoading(false);
    }
  };

  const endStandby = async () => {
    if (!confirmedEndTime) {
      showToast('Please confirm the end time', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/standby', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          standbyLogId: currentStandbyLog?.id,
          endedAt: confirmedEndTime
        })
      });

      if (response.ok) {
        setIsOnStandby(false);
        setCurrentStandbyLog(null);
        setShowStandbyModal(false);
        setConfirmedEndTime('');
        if (onStandbyChange) {
          onStandbyChange(false);
        }
        showToast('Standby time ended. You can now continue working.');
      } else {
        showToast('Error ending standby time', 'error');
      }
    } catch (error) {
      console.error('Error ending standby:', error);
      showToast('Error ending standby time', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getDirectionsUrl = (address: string) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  };

  const makeCall = (phoneNumber: string) => {
    window.location.href = `tel:${phoneNumber}`;
  };

  const sendSMS = (phoneNumber: string) => {
    window.location.href = `sms:${phoneNumber}`;
  };

  if (!jobData) return null;

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl font-semibold text-white text-sm flex items-center gap-2 pointer-events-none ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          <span>{toast.type === 'success' ? '✓' : '✗'}</span>
          {toast.msg}
        </div>
      )}

      {/* Standby Warning Banner */}
      {isOnStandby && (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border-2 border-yellow-400 dark:border-yellow-500/30 rounded-2xl p-4 mb-6 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-yellow-900 dark:text-yellow-200">⚠️ You are on standby time</p>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Stop standby before proceeding with your work
              </p>
            </div>
            <button
              onClick={endStandby}
              disabled={loading}
              className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              {loading ? 'Stopping...' : 'Stop Standby'}
            </button>
          </div>
        </div>
      )}

      {/* Quick Access Buttons */}
      <div className="flex gap-2 sm:gap-3 mb-4 sm:mb-6">
        <button
          onClick={() => setShowLocationModal(true)}
          className="flex-1 px-2 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 sm:gap-2"
        >
          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="truncate">View Location</span>
        </button>

        <button
          onClick={() => isOnStandby ? setShowStandbyModal(true) : setShowContactModal(true)}
          className={`flex-1 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 sm:gap-2 ${
            isOnStandby
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white'
          }`}
        >
          <Phone className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="truncate">Contact On Site</span>
        </button>

        <button
          onClick={() => setShowStandbyModal(true)}
          className={`flex-1 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 sm:gap-2 ${
            isOnStandby
              ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white'
              : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white'
          }`}
        >
          <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="truncate">{isOnStandby ? 'Stop Standby' : 'Start Standby'}</span>
        </button>
      </div>

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white dark:bg-[#1a0f35] rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-4 sm:p-8 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-blue-100 dark:bg-blue-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 sm:w-8 sm:h-8 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-1 sm:mb-2">Job Location</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-white/60">Get directions to the job site</p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-500/10 border-2 border-blue-200 dark:border-blue-500/30 rounded-xl p-6 mb-6">
              <div className="mb-4">
                <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold mb-1">Location Name</p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{jobData.location}</p>
              </div>
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold mb-1">Address</p>
                <p className="text-base font-semibold text-blue-900 dark:text-blue-100">{jobData.address}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLocationModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white rounded-xl font-semibold transition-all"
              >
                Close
              </button>
              <a
                href={getDirectionsUrl(jobData.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Get Directions
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white dark:bg-[#1a0f35] rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-4 sm:p-8 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-green-100 dark:bg-green-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 sm:w-8 sm:h-8 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-1 sm:mb-2">Contact On Site</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-white/60">Call or text the customer</p>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-500/10 border-2 border-green-200 dark:border-green-500/30 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
              <div className="mb-4">
                <p className="text-sm text-green-700 dark:text-green-300 font-semibold mb-1">Contact On Site</p>
                <p className="text-base sm:text-lg font-bold text-green-900 dark:text-green-100">
                  {jobData.foreman_name || jobData.customer_name}
                </p>
              </div>
              {jobData.foreman_phone && (
                <div>
                  <p className="text-sm text-green-700 dark:text-green-300 font-semibold mb-1">Phone Number</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-900 dark:text-green-100">{jobData.foreman_phone}</p>
                </div>
              )}
            </div>

            {jobData.foreman_phone ? (
              <div className="space-y-3">
                <button
                  onClick={() => makeCall(jobData.foreman_phone!)}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
                >
                  <span className="text-2xl">📞</span>
                  Call {jobData.foreman_name || 'Contact'}
                </button>
                <button
                  onClick={() => sendSMS(jobData.foreman_phone!)}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
                >
                  <span className="text-2xl">💬</span>
                  Text {jobData.foreman_name || 'Contact'}
                </button>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="w-full px-6 py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white rounded-xl font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-yellow-50 dark:bg-yellow-500/10 border-2 border-yellow-300 dark:border-yellow-500/30 rounded-xl p-4">
                  <p className="text-yellow-800 dark:text-yellow-300 text-sm font-medium text-center">
                    No contact phone number available for this job
                  </p>
                </div>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="w-full px-6 py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white rounded-xl font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standby Time Modal */}
      {showStandbyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white dark:bg-[#1a0f35] rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-4 sm:p-8 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                isOnStandby ? 'bg-yellow-100 dark:bg-yellow-500/20' : 'bg-orange-100 dark:bg-orange-500/20'
              }`}>
                <Clock className={`w-5 h-5 sm:w-8 sm:h-8 ${isOnStandby ? 'text-yellow-600' : 'text-orange-600'}`} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-1 sm:mb-2">
                  {isOnStandby ? 'Stop Standby Time' : 'Start Standby Time'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-white/60">
                  {isOnStandby
                    ? 'Stop standby to continue working'
                    : 'Track time when contractor is not ready'}
                </p>
              </div>
            </div>

            {isOnStandby ? (
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-500/10 border-2 border-yellow-300 dark:border-yellow-500/30 rounded-xl p-4 sm:p-6">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold mb-1">Currently on standby</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-4">
                    Started: {currentStandbyLog && new Date(currentStandbyLog.started_at).toLocaleString()}
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    Confirm the end time below. Adjust if you forgot to stop standby at the actual time.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmedEndTime" className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-2">
                    Confirm End Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="confirmedEndTime"
                    name="confirmedEndTime"
                    value={confirmedEndTime}
                    onChange={(e) => setConfirmedEndTime(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-white/10 rounded-xl bg-white dark:bg-white/10 text-gray-900 dark:text-white focus:border-yellow-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 dark:text-white/60 mt-1">
                    Adjust if you forgot to stop standby at the actual time
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={endStandby}
                    disabled={loading}
                    className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl ${
                      loading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white'
                    }`}
                  >
                    {loading ? 'Stopping Standby...' : 'Stop Standby Time'}
                  </button>
                  <button
                    onClick={() => setShowStandbyModal(false)}
                    className="w-full px-6 py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white rounded-xl font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-orange-50 dark:bg-orange-500/10 border-2 border-orange-200 dark:border-orange-500/30 rounded-xl p-4 mb-4">
                  <p className="text-sm text-orange-800 dark:text-orange-300 font-medium">
                    Use standby time when the contractor is not ready and you're waiting to begin work.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-2">
                    Reason for Standby *
                  </label>
                  <select
                    value={standbyReason}
                    onChange={(e) => setStandbyReason(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-white/10 rounded-xl bg-white dark:bg-white/10 text-gray-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  >
                    <option value="">Select a reason...</option>
                    {STANDBY_REASONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="confirmedStartTime" className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-2">
                    Confirm Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="confirmedStartTime"
                    name="confirmedStartTime"
                    value={confirmedStartTime}
                    onChange={(e) => setConfirmedStartTime(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-white/10 rounded-xl bg-white dark:bg-white/10 text-gray-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 dark:text-white/60 mt-1">
                    Adjust if you forgot to start standby at the actual time
                  </p>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-500/10 border-2 border-yellow-300 dark:border-yellow-500/30 rounded-xl p-4">
                  <p className="text-xs text-yellow-800 dark:text-yellow-300 font-medium">
                    ⚠️ Remember: You cannot proceed with workflow steps while on standby time. Stop standby before continuing work.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={startStandby}
                    disabled={loading}
                    className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl ${
                      loading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white'
                    }`}
                  >
                    {loading ? 'Starting Standby...' : 'Start Standby Time'}
                  </button>
                  <button
                    onClick={() => setShowStandbyModal(false)}
                    className="w-full px-6 py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white rounded-xl font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
