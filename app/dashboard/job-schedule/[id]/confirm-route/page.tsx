'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Clock, ArrowLeft, MapPin, User, Phone, Navigation, PlayCircle } from 'lucide-react';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  foreman_name: string;
  foreman_phone: string;
  arrival_time?: string;
}

export default function ConfirmRoutePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [inRouteTime, setInRouteTime] = useState('');
  const [originalTime, setOriginalTime] = useState('');
  const [operatorName, setOperatorName] = useState('');

  useEffect(() => {
    checkWorkflowStatus();
    fetchJobDetails();
    fetchOperatorName();

    // Set current time in HH:MM format for time input
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    setInRouteTime(currentTime);
    setOriginalTime(currentTime);
  }, [jobId]);

  const checkWorkflowStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check workflow to see what's been completed
      const response = await fetch(`/api/workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const workflow = result.data;

          // Get the saved in-route time from job status
          const jobResponse = await fetch(`/api/job-orders?id=${jobId}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          let jobData = null;
          if (jobResponse.ok) {
            const jobResult = await jobResponse.json();
            if (jobResult.success && jobResult.data.length > 0) {
              jobData = jobResult.data[0];
            }
          }

          // If they've moved past in_route to in_progress, redirect to next step
          if (workflow.current_step === 'silica_form' || jobData?.status === 'in_progress') {
            console.log('Already in progress, redirecting to silica form');
            router.push(`/dashboard/job-schedule/${jobId}/silica-exposure`);
            return;
          }

          // If in_route SMS has been sent, they already confirmed time
          // Show them the location/contact page (step 2)
          if (workflow.sms_sent) {
            console.log('In-route already confirmed, showing location/contact page');
            setTimeConfirmed(true);

            // If we have route_started_at timestamp, format it for display
            if (jobData?.route_started_at) {
              const routeTime = new Date(jobData.route_started_at);
              const formattedTime = routeTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
              setInRouteTime(formattedTime);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking workflow status:', error);
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

  const fetchOperatorName = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get name from session metadata or localStorage (avoids RLS issues with profiles table)
      const name = session.user.user_metadata?.full_name
        || session.user.user_metadata?.name
        || (() => { try { const u = JSON.parse(localStorage.getItem('pontifex-user') || '{}'); return u.full_name; } catch { return null; } })()
        || 'Pontifex Team';
      setOperatorName(name);
    } catch (error) {
      console.error('Error fetching operator name:', error);
      setOperatorName('Pontifex Team');
    }
  };

  const calculateTimeDifference = () => {
    // Parse times (HH:MM format) and calculate difference in minutes
    const [origHours, origMinutes] = originalTime.split(':').map(Number);
    const [editHours, editMinutes] = inRouteTime.split(':').map(Number);

    const origTotalMinutes = origHours * 60 + origMinutes;
    const editTotalMinutes = editHours * 60 + editMinutes;

    return Math.abs(editTotalMinutes - origTotalMinutes);
  };

  const formatTimeForDisplay = (time24: string) => {
    // Convert HH:MM (24-hour) to 12-hour format with AM/PM
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const handleConfirmTime = async () => {
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired');
        router.push('/login');
        return;
      }

      const timeDiffMinutes = calculateTimeDifference();
      const shouldSendSMS = timeDiffMinutes <= 15;

      // Update job status to "in_route"
      const statusResponse = await fetch(`/api/job-orders/${jobId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: 'in_route'
        })
      });

      if (!statusResponse.ok) {
        const errorData = await statusResponse.json();

        // Check if there's an active job conflict
        if (statusResponse.status === 409 && errorData.activeJob) {
          alert(
            `⚠️ Cannot Start Job\n\n${errorData.error}\n\n` +
            `Active Job: #${errorData.activeJob.job_number}\n` +
            `Location: ${errorData.activeJob.location}\n` +
            `Status: ${errorData.activeJob.status}\n\n` +
            `Please complete your current job before starting a new one.`
          );
          router.push('/dashboard/job-schedule');
          return;
        }

        throw new Error(errorData.error || 'Failed to update job status');
      }

      // Send SMS only if time difference is 15 minutes or less
      if (shouldSendSMS && job?.foreman_phone && operatorName) {
        const contactName = job.foreman_name || 'there';
        const smsMessage = `Hey ${contactName}, this is ${operatorName} from Pontifex Industries. We are en route to your location for ${job.title}. We'll contact you when we arrive.`;

        await fetch('/api/send-sms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            to: job.foreman_phone,
            message: smsMessage
          })
        });
      }

      // Update workflow - mark SMS as sent (or not sent if time was edited too much)
      await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          completedStep: 'in_route',
          currentStep: 'in_route',
          smsSent: shouldSendSMS, // Track whether SMS was actually sent
        })
      });

      // Mark time as confirmed and show location/contact page
      setTimeConfirmed(true);
    } catch (error) {
      console.error('Error confirming route:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
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

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Job Not Found</h1>
          <button
            onClick={() => router.push('/dashboard/job-schedule')}
            className="text-blue-600 hover:underline"
          >
            Return to Job Schedule
          </button>
        </div>
      </div>
    );
  }

  // STEP 2: After time confirmed, show location/contact info with "Start In Process" button
  if (timeConfirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
        <div className="bg-gradient-to-r from-green-600 to-green-500 text-white sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 py-5">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => router.push('/dashboard/job-schedule')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all duration-300 text-sm font-medium flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <div className="flex items-center gap-3 flex-1 justify-center">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <Navigation className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">In Route</h1>
                  <p className="text-green-100 text-sm">Started at {formatTimeForDisplay(inRouteTime)}</p>
                </div>
              </div>
              <div className="w-20 flex-shrink-0"></div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Job Site Address */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-3xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                <MapPin className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 uppercase tracking-wider mb-2">Job Site Address</h3>
                <p className="text-2xl font-bold text-gray-900 mb-2">{job.location}</p>
                <p className="text-lg text-gray-700 mb-4">{job.address}</p>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-lg"
                >
                  <Navigation className="w-5 h-5" />
                  Get Directions
                </a>
              </div>
            </div>
          </div>

          {/* Jobsite Arrival Time */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-3xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Clock className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-purple-900 uppercase tracking-wider mb-2">Scheduled Arrival Time</h3>
                <p className="text-4xl font-bold text-gray-900">{job.arrival_time || 'TBD'}</p>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 rounded-3xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                <User className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-orange-900 uppercase tracking-wider mb-3">On-Site Contact</h3>
                <p className="text-2xl font-bold text-gray-900 mb-2">{job.foreman_name || 'N/A'}</p>
                {job.foreman_phone && (
                  <a
                    href={`tel:${job.foreman_phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-all shadow-lg text-lg"
                  >
                    <Phone className="w-5 h-5" />
                    {job.foreman_phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Start In Process Button */}
          <button
            onClick={async () => {
              if (confirm('Have you arrived at the job site? This will mark you as "In Progress" and start tracking work time.')) {
                setSubmitting(true);
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) return;

                  // Update job status to in_progress
                  const response = await fetch(`/api/job-orders/${jobId}/status`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                      status: 'in_progress'
                    })
                  });

                  if (response.ok) {
                    alert('✅ Job status updated to "In Progress". Work time tracking started!');
                    router.push(`/dashboard/job-schedule/${jobId}/silica-exposure`);
                  } else {
                    const error = await response.json();
                    alert(`Failed to update status: ${error.error || 'Unknown error'}`);
                  }
                } catch (error) {
                  console.error('Error updating to in progress:', error);
                  alert('Error updating job status. Please try again.');
                } finally {
                  setSubmitting(false);
                }
              }
            }}
            disabled={submitting}
            className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white rounded-2xl transition-all font-bold text-lg flex items-center justify-center gap-3 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlayCircle className="w-6 h-6" />
            {submitting ? 'Starting...' : 'Start In Process (Arrived at Job Site)'}
          </button>
        </div>
      </div>
    );
  }

  // STEP 1: Show time confirmation screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard/job-schedule')}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-all duration-300 font-medium border border-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>

            <h1 className="text-xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
              Confirm In-Route Time
            </h1>

            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-8 mb-6">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Confirm Your In-Route Time</h2>
            <p className="text-gray-600">Please verify the time you started traveling to the job site</p>
          </div>

          {/* Current Time Display and Edit */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-3xl p-6 mb-6">
            <label className="block text-sm font-semibold text-blue-900 uppercase tracking-wider mb-3">In-Route Time</label>
            <input
              type="time"
              value={inRouteTime}
              onChange={(e) => setInRouteTime(e.target.value)}
              className="w-full text-4xl font-bold text-gray-900 bg-white border-2 border-blue-300 rounded-2xl px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-blue-700 text-sm mt-3 text-center">
              Edit if you forgot to start in-route at the correct time
            </p>
          </div>

          {/* Warning if time edited by more than 15 minutes */}
          {calculateTimeDifference() > 15 && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="font-bold text-yellow-900 mb-1">Note</h4>
                  <p className="text-yellow-800 text-sm">
                    Time has been adjusted by more than 15 minutes. SMS notification will NOT be sent to the contact.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={handleConfirmTime}
            disabled={submitting || !inRouteTime}
            className={`w-full px-6 py-4 rounded-2xl font-bold text-center transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 ${
              submitting || !inRouteTime
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white cursor-pointer'
            }`}
          >
            {submitting ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                Confirming...
              </>
            ) : (
              <>
                <Navigation className="w-5 h-5" />
                Confirm & Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
