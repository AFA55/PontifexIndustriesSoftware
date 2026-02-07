'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { MapPin, Phone, User, PlayCircle, ArrowLeft } from 'lucide-react';
import Notification from '@/components/Notification';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  description: string;
  foreman_name: string;
  foreman_phone: string;
  status: string;
  arrival_time?: string;
  contact_on_site?: string;
  contact_phone?: string;
}

export default function InRoutePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [equipmentChecklistComplete, setEquipmentChecklistComplete] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [arrivalTime, setArrivalTime] = useState('');
  const [displayTime, setDisplayTime] = useState('');
  const [hasStartedProcess, setHasStartedProcess] = useState(false);

  useEffect(() => {
    checkEquipmentChecklist();
    fetchJobDetails();
    checkWorkflowProgress();

    // Set initial arrival time to current time
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // 24-hour format for input
    const time24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    setArrivalTime(time24);

    // 12-hour format for display
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayTimeString = `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    setDisplayTime(displayTimeString);
  }, [jobId]);

  const checkWorkflowProgress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check if job is already completed
      const { data: jobData } = await supabase
        .from('job_orders')
        .select('status')
        .eq('id', jobId)
        .single();

      if (jobData?.status === 'completed') {
        // Job is completed, redirect to dashboard
        router.push('/dashboard');
        return;
      }

      // Check if user has already started in-process (passed the in_route step)
      const response = await fetch(`/api/workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const workflow = result.data;

          // If they've moved past in_route step, redirect them forward
          if (workflow.current_step && workflow.current_step !== 'in_route' && workflow.current_step !== 'equipment_checklist') {
            // They've already started - redirect to appropriate page
            if (workflow.current_step === 'liability_release') {
              router.push(`/dashboard/job-schedule/${jobId}/liability-release`);
            } else if (workflow.current_step === 'silica_form') {
              router.push(`/dashboard/job-schedule/${jobId}/silica-exposure`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking workflow progress:', error);
    }
  };

  const checkEquipmentChecklist = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Check if equipment checklist is completed
      const response = await fetch(`/api/workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const workflow = result.data;

          // If equipment checklist NOT completed, redirect back
          if (!workflow.equipment_checklist_completed) {
            router.replace(`/dashboard/job-schedule/${jobId}/equipment-checklist`);
            return;
          }

          setEquipmentChecklistComplete(true);
        }
      }
    } catch (error) {
      console.error('Error checking equipment checklist:', error);
    }
  };

  const fetchJobDetails = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/job-orders?id=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          setJob(result.data[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartInProcess = () => {
    // Show confirmation modal instead of immediately submitting
    setShowConfirmModal(true);
    // Mark that user has initiated the process (disable back button)
    setHasStartedProcess(true);
  };

  const handleConfirmArrival = async () => {
    setSubmitting(true);
    setShowConfirmModal(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNotification({ type: 'error', message: 'Session expired. Please log in again.' });
        router.push('/login');
        return;
      }

      // 1. Add jobsite arrival to job history (use displayTime for 12-hour format)
      const historyResponse = await fetch(`/api/job-orders/${jobId}/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          event: 'jobsite_arrival',
          timestamp: new Date().toISOString(),
          time: displayTime
        })
      });

      if (!historyResponse.ok) {
        console.error('Failed to record jobsite arrival in history');
      }

      // 2. Update workflow - mark in_route as complete, liability release is next
      await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          completedStep: 'in_route',
          currentStep: 'liability_release'
        })
      });

      // 3. Update job status to in_progress (use displayTime for 12-hour format)
      const { error: updateError } = await supabase
        .from('job_orders')
        .update({
          status: 'in_progress',
          arrival_time: displayTime
        })
        .eq('id', jobId);

      if (updateError) {
        console.error('Error updating job status:', updateError);
      }

      // 4. Redirect to liability release page (new step before silica form)
      router.push(`/dashboard/job-schedule/${jobId}/liability-release`);

    } catch (error) {
      console.error('Error starting in process:', error);
      setNotification({ type: 'error', message: 'Error recording arrival time. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getDirectionsUrl = (address: string) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!job || !equipmentChecklistComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Loading...</h1>
        </div>
      </div>
    );
  }

  // Show location details ONLY after equipment checklist is complete
  return (
    <>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">In Route</h1>
              <p className="text-blue-100 text-sm">Location revealed - ready to go!</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Job Information */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Job Details</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Customer</p>
              <p className="text-lg font-semibold text-gray-900">{job.customer_name}</p>
            </div>
          </div>
        </div>

        {/* Location Information - NOW VISIBLE */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 backdrop-blur-lg rounded-3xl shadow-2xl border-2 border-green-300 p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center">
              <MapPin className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Location Details</h2>
              <p className="text-sm text-green-700">Equipment checklist completed ✓</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Location Name</p>
              <p className="text-xl font-bold text-gray-900">{job.location}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Full Address</p>
              <p className="text-lg font-semibold text-gray-900 mb-3">{job.address}</p>
              <a
                href={getDirectionsUrl(job.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-lg"
              >
                <MapPin className="w-5 h-5" />
                Get Directions
              </a>
            </div>

            {/* Contact Information */}
            {(job.contact_on_site || job.foreman_name) && (
              <div className="pt-4 border-t border-green-200">
                <p className="text-sm font-semibold text-gray-600 mb-3">Contact Information</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="text-sm text-gray-600">Contact Name</p>
                      <p className="font-semibold text-gray-900">
                        {job.contact_on_site || job.foreman_name || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {(job.contact_phone || job.foreman_phone) && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-600" />
                      <div>
                        <p className="text-sm text-gray-600">Phone Number</p>
                        <a
                          href={`tel:${job.contact_phone || job.foreman_phone}`}
                          className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          {job.contact_phone || job.foreman_phone}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Start In Process Button */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Ready to Start Work?
            </h3>
            <p className="text-gray-600">
              Click below when you arrive at the job site to log your arrival time
            </p>
          </div>

          <button
            onClick={handleStartInProcess}
            disabled={submitting}
            className={`w-full px-8 py-5 rounded-2xl font-bold text-xl transition-all shadow-2xl flex items-center justify-center gap-3 ${
              submitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white transform hover:scale-[1.02]'
            }`}
          >
            {submitting ? (
              <>
                <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full"></div>
                Recording Arrival...
              </>
            ) : (
              <>
                <PlayCircle className="w-7 h-7" />
                Start In Process
              </>
            )}
          </button>

          <p className="text-sm text-gray-500 text-center mt-4">
            This will log your jobsite arrival time and proceed to the liability release form
          </p>
        </div>

        {/* Back Button - Disabled after starting process */}
        <div className="mt-6">
          <button
            onClick={() => !hasStartedProcess && router.push('/dashboard/job-schedule')}
            disabled={hasStartedProcess}
            className={`w-full px-6 py-3 rounded-xl transition-all font-semibold flex items-center justify-center gap-2 ${
              hasStartedProcess
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            {hasStartedProcess ? 'Arrival Confirmed - Continue Forward' : 'Back to Job Schedule'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 transform transition-all">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Confirm Jobsite Arrival Time</h3>
              <p className="text-gray-600 text-sm">
                Please confirm the time you arrived at the jobsite
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Arrival Time
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => {
                    const timeValue = e.target.value;
                    setArrivalTime(timeValue);

                    // Convert 24-hour format to 12-hour AM/PM format for display
                    const [hours, minutes] = timeValue.split(':');
                    const hour = parseInt(hours);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const displayHour = hour % 12 || 12;
                    setDisplayTime(`${displayHour}:${minutes} ${ampm}`);
                  }}
                  className="w-full px-4 py-4 text-2xl font-bold text-center text-blue-600 bg-blue-50 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                />
              </div>
              <p className="text-sm text-gray-600 mt-3 text-center font-medium">
                Selected Time: <span className="text-blue-600">{displayTime}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1 text-center">
                This time will be recorded as your official arrival at the jobsite
              </p>
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-yellow-800 font-medium">
                  This will mark you as "In Process" and record your arrival time at the jobsite.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmArrival}
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-semibold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Recording...' : 'Confirm & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
