'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Phone, Clock, AlertCircle } from 'lucide-react';
import LoadingTransition from '@/components/LoadingTransition';

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

export default function QuickAccessButtons({ jobId, onStandbyChange }: QuickAccessButtonsProps) {
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showStandbyModal, setShowStandbyModal] = useState(false);
  const [isOnStandby, setIsOnStandby] = useState(false);
  const [currentStandbyLog, setCurrentStandbyLog] = useState<StandbyLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [confirmedStartTime, setConfirmedStartTime] = useState('');
  const [confirmedEndTime, setConfirmedEndTime] = useState('');

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

      // TEMPORARILY DISABLED due to RLS policy issues
      // Will be re-enabled once RLS policies are fixed
      console.log('Standby status check temporarily disabled');
      return;

      // Check if there's an active standby log (ended_at is null)
      // const { data, error } = await supabase
      //   .from('standby_logs')
      //   .select('*')
      //   .eq('job_order_id', jobId)
      //   .eq('operator_id', session.user.id)
      //   .is('ended_at', null)
      //   .maybeSingle();

      // if (error) {
      //   console.warn('Could not check standby status (RLS policy):', error.message);
      //   // Continue without standby status - user can still use the feature
      //   return;
      // }

      // if (data) {
      //   setIsOnStandby(true);
      //   setCurrentStandbyLog(data);
      //   if (onStandbyChange) {
      //     onStandbyChange(true);
      //   }
      // }
    } catch (error) {
      console.error('Error checking standby status:', error);
    }
  };

  const startStandby = async () => {
    if (!confirmedStartTime) {
      alert('Please confirm the start time');
      return;
    }

    setLoading(true);
    setLoadingMessage('Starting standby time...');
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
          reason: 'Waiting for work to proceed'
        })
      });

      if (response.ok) {
        const result = await response.json();
        setIsOnStandby(true);
        setCurrentStandbyLog(result.data);
        setShowStandbyModal(false);
        setConfirmedStartTime('');
        if (onStandbyChange) {
          onStandbyChange(true);
        }
        alert('Standby time started. Remember to stop standby before continuing work!');
      } else {
        alert('Error starting standby time');
      }
    } catch (error) {
      console.error('Error starting standby:', error);
      alert('Error starting standby time');
    } finally {
      setLoading(false);
    }
  };

  const endStandby = async () => {
    if (!confirmedEndTime) {
      alert('Please confirm the end time');
      return;
    }

    setLoading(true);
    setLoadingMessage('Ending standby time...');
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
        alert('Standby time ended. You can now continue with your work.');
      } else {
        alert('Error ending standby time');
      }
    } catch (error) {
      console.error('Error ending standby:', error);
      alert('Error ending standby time');
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
      {/* Loading Transition */}
      <LoadingTransition isLoading={loading} message={loadingMessage} />

      {/* Standby Warning Banner */}
      {isOnStandby && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-2xl p-4 mb-6 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-yellow-900">⚠️ You are on standby time</p>
              <p className="text-sm text-yellow-800">
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
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setShowLocationModal(true)}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
        >
          <MapPin className="w-5 h-5" />
          View Location
        </button>

        <button
          onClick={() => isOnStandby ? setShowStandbyModal(true) : setShowContactModal(true)}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 ${
            isOnStandby
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white'
          }`}
        >
          <Phone className="w-5 h-5" />
          Contact On Site
        </button>

        <button
          onClick={() => setShowStandbyModal(true)}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 ${
            isOnStandby
              ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white'
              : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white'
          }`}
        >
          <Clock className="w-5 h-5" />
          {isOnStandby ? 'Stop Standby' : 'Start Standby'}
        </button>
      </div>

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <MapPin className="w-8 h-8 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Job Location</h2>
                <p className="text-sm text-gray-600">Get directions to the job site</p>
              </div>
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
              <div className="mb-4">
                <p className="text-sm text-blue-700 font-semibold mb-1">Location Name</p>
                <p className="text-lg font-bold text-blue-900">{jobData.location}</p>
              </div>
              <div>
                <p className="text-sm text-blue-700 font-semibold mb-1">Address</p>
                <p className="text-base font-semibold text-blue-900">{jobData.address}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLocationModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Phone className="w-8 h-8 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Contact On Site</h2>
                <p className="text-sm text-gray-600">Call or text the customer</p>
              </div>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-6">
              <div className="mb-4">
                <p className="text-sm text-green-700 font-semibold mb-1">Contact On Site</p>
                <p className="text-lg font-bold text-green-900">
                  {jobData.foreman_name || jobData.customer_name}
                </p>
              </div>
              {jobData.foreman_phone && (
                <div>
                  <p className="text-sm text-green-700 font-semibold mb-1">Phone Number</p>
                  <p className="text-2xl font-bold text-green-900">{jobData.foreman_phone}</p>
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
                  className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
                  <p className="text-yellow-800 text-sm font-medium text-center">
                    No contact phone number available for this job
                  </p>
                </div>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                isOnStandby ? 'bg-yellow-100' : 'bg-orange-100'
              }`}>
                <Clock className={`w-8 h-8 ${isOnStandby ? 'text-yellow-600' : 'text-orange-600'}`} />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  {isOnStandby ? 'Stop Standby Time' : 'Start Standby Time'}
                </h2>
                <p className="text-sm text-gray-600">
                  {isOnStandby
                    ? 'Stop standby to continue working'
                    : 'Track time when contractor is not ready'}
                </p>
              </div>
            </div>

            {isOnStandby ? (
              <div className="space-y-4">
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6">
                  <p className="text-sm text-yellow-700 font-semibold mb-1">Currently on standby</p>
                  <p className="text-xs text-yellow-600 mb-4">
                    Started: {currentStandbyLog && new Date(currentStandbyLog.started_at).toLocaleString()}
                  </p>
                  <p className="text-sm text-yellow-800">
                    Confirm the end time below. Adjust if you forgot to stop standby at the actual time.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmedEndTime" className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm End Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="confirmedEndTime"
                    name="confirmedEndTime"
                    value={confirmedEndTime}
                    onChange={(e) => setConfirmedEndTime(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:outline-none text-gray-900"
                  />
                  <p className="text-xs text-gray-600 mt-1">
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
                    className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-orange-800 font-medium">
                    Use standby time when the contractor is not ready and you're waiting to begin work.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmedStartTime" className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="confirmedStartTime"
                    name="confirmedStartTime"
                    value={confirmedStartTime}
                    onChange={(e) => setConfirmedStartTime(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Adjust if you forgot to start standby at the actual time
                  </p>
                </div>

                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
                  <p className="text-xs text-yellow-800 font-medium">
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
                    className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
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
