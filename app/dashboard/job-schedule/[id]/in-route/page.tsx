'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Navigation, MapPin, Phone, User, PlayCircle, Edit, Eye, ArrowLeft, Clock } from 'lucide-react';
import WorkflowNavigation from '@/components/WorkflowNavigation';
import QuickAccessButtons from '@/components/QuickAccessButtons';

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
}

export default function InRoutePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inRouteTime, setInRouteTime] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [editedTime, setEditedTime] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showManualTimeEntry, setShowManualTimeEntry] = useState(false);
  const [manualTime, setManualTime] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingTime, setPendingTime] = useState('');

  useEffect(() => {
    fetchJobDetails();
    checkInRouteStatus();
  }, [jobId]);

  const checkInRouteStatus = async () => {
    try {
      // Check workflow API to see if in_route is already completed
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const response = await fetch(`/api/workflow?jobId=${jobId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const workflow = result.data;

            // If in_route is already completed, redirect to next step automatically
            if (workflow.sms_sent && workflow.equipment_checklist_completed) {
              console.log('In Route already completed, redirecting to next step');
              router.push(`/dashboard/job-schedule/${jobId}/silica-exposure`);
              return;
            }
          }
        }
      }

      // Check if in-route time already exists in localStorage
      const savedTime = localStorage.getItem(`in-route-time-${jobId}`);
      if (savedTime) {
        setInRouteTime(savedTime);
        setEditedTime(savedTime);
      }
    } catch (error) {
      console.log('Error checking in-route status:', error);
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

  const handleContinueInRoute = async (confirmedTime?: string) => {
    setSubmitting(true);
    setShowConfirmation(false);

    try {
      // Use confirmed time if provided, otherwise get current time
      const currentTime = confirmedTime || new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired');
        router.push('/login');
        return;
      }

      // 1. Save in-route time to localStorage
      localStorage.setItem(`in-route-time-${jobId}`, currentTime);
      setInRouteTime(currentTime);
      setEditedTime(currentTime);

      // 2. Record in timecard
      await fetch('/api/timecard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          eventType: 'in_route',
          timestamp: new Date().toISOString(),
          time: currentTime
        })
      });

      // 3. Send SMS to contact
      if (job?.foreman_phone) {
        await fetch('/api/send-sms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            to: job.foreman_phone,
            message: `${job.customer_name}: Your B&D Concrete Cutting crew is on the way! Job: ${job.job_number}. We'll arrive shortly.`
          })
        });
      }

      // 4. Update workflow
      await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          completedStep: 'in_route',
          currentStep: 'silica_form',
        })
      });

      // 5. Update job history
      await fetch('/api/job-orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          id: jobId,
          status: 'in-route',
          history: {
            event: 'in_route_started',
            timestamp: new Date().toISOString(),
            time: currentTime
          }
        })
      });

    } catch (error) {
      console.error('Error starting in-route:', error);
      alert('Error recording in-route time. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditTime = async () => {
    if (!editedTime) {
      alert('Please enter a valid time');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Update localStorage
      localStorage.setItem(`in-route-time-${jobId}`, editedTime);
      setInRouteTime(editedTime);

      // Update timecard (do NOT send SMS again)
      await fetch('/api/timecard', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          eventType: 'in_route',
          time: editedTime,
          skipNotification: true // Important: don't send SMS on edit
        })
      });

      setEditingTime(false);
      alert('In-route time updated');
    } catch (error) {
      console.error('Error updating time:', error);
      alert('Error updating time');
    }
  };

  const handleManualTimeEntry = async () => {
    if (!manualTime) {
      alert('Please enter a valid time');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Save to localStorage
      localStorage.setItem(`in-route-time-${jobId}`, manualTime);
      setInRouteTime(manualTime);

      // 2. Record in timecard (WITHOUT sending SMS)
      await fetch('/api/timecard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          eventType: 'in_route',
          timestamp: new Date().toISOString(),
          time: manualTime,
          skipNotification: true // IMPORTANT: Don't send SMS for manual entry
        })
      });

      // 3. Update workflow
      await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          completedStep: 'in_route',
          currentStep: 'silica_form',
        })
      });

      // 4. Update job history
      await fetch('/api/job-orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          id: jobId,
          status: 'in-route',
          history: {
            event: 'in_route_manually_entered',
            timestamp: new Date().toISOString(),
            time: manualTime
          }
        })
      });

      setShowManualTimeEntry(false);
      alert('In-route time recorded (no SMS sent)');
    } catch (error) {
      console.error('Error recording manual time:', error);
      alert('Error recording time. Please try again.');
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

  // If in-route already started, show the time with edit option
  if (inRouteTime && !editingTime) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
        <div className="bg-gradient-to-r from-green-600 to-green-500 text-white sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <Navigation className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">In Route</h1>
                <p className="text-green-100 text-sm">On the way to job site</p>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <WorkflowNavigation jobId={jobId} currentStepId="in_route" />

          {/* Quick Access Buttons */}
          <QuickAccessButtons jobId={jobId} />

          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">In Route Confirmed</h2>
              <p className="text-gray-600">You started traveling at</p>
              <p className="text-5xl font-bold text-green-600 mt-4">{inRouteTime}</p>
            </div>

            <div className="bg-blue-50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Job Details</h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-600">Job:</span> <span className="font-semibold text-gray-900">{job.job_number}</span></p>
                <p><span className="text-gray-600">Customer:</span> <span className="font-semibold text-gray-900">{job.customer_name}</span></p>
                <p><span className="text-gray-600">Location:</span> <span className="font-semibold text-gray-900">{job.location}</span></p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditingTime(true)}
                className="flex-1 px-6 py-3 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 transition-all font-semibold flex items-center justify-center gap-2"
              >
                <Edit className="w-5 h-5" />
                Edit Time
              </button>

              <button
                onClick={() => router.push(`/dashboard/job-schedule/${jobId}/silica-exposure`)}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-xl transition-all font-semibold flex items-center justify-center gap-2"
              >
                Continue to Silica Form
                <PlayCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If editing time
  if (editingTime) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
        <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold">Edit In-Route Time</h1>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Update In-Route Time</h2>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                In-Route Time (HH:MM)
              </label>
              <input
                type="time"
                value={editedTime}
                onChange={(e) => setEditedTime(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900 text-lg"
              />
              <p className="text-xs text-gray-500 mt-1">Note: SMS will NOT be sent again when editing time</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditingTime(false)}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
              >
                Cancel
              </button>

              <button
                onClick={handleEditTime}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl transition-all font-semibold"
              >
                Save Time
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Initial 3-button choice screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Navigation className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Start In Route</h1>
              <p className="text-blue-100 text-sm">Begin traveling to job site</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <WorkflowNavigation jobId={jobId} currentStepId="in_route" />

        {/* Quick Access Buttons */}
        <QuickAccessButtons jobId={jobId} />

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Job Ticket Preview</h2>

              <div className="space-y-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Job Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-600">Job Number:</span> <span className="font-semibold text-gray-900">{job.job_number}</span></p>
                    <p><span className="text-gray-600">Title:</span> <span className="font-semibold text-gray-900">{job.title}</span></p>
                    <p><span className="text-gray-600">Customer:</span> <span className="font-semibold text-gray-900">{job.customer_name}</span></p>
                    <p><span className="text-gray-600">Location:</span> <span className="font-semibold text-gray-900">{job.location}</span></p>
                    <p><span className="text-gray-600">Address:</span> <span className="font-semibold text-gray-900">{job.address}</span></p>
                  </div>
                </div>

                <div className="bg-green-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Contact Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-600">Foreman:</span> <span className="font-semibold text-gray-900">{job.foreman_name}</span></p>
                    <p><span className="text-gray-600">Phone:</span> <span className="font-semibold text-gray-900">{job.foreman_phone}</span></p>
                  </div>
                </div>

                {job.description && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-800 mb-2">Description</h3>
                    <p className="text-sm text-gray-900">{job.description}</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowPreview(false)}
                className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        )}

        {/* Main content - 3 buttons */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Navigation className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Ready to Travel?</h2>
            <p className="text-gray-600">
              Click "Continue to In Route" to notify the customer and start your journey
            </p>
          </div>

          {/* Quick job info */}
          <div className="bg-blue-50 rounded-xl p-6 mb-8">
            <h3 className="font-semibold text-gray-800 mb-3">Job: {job.job_number}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Customer</p>
                <p className="font-semibold text-gray-900">{job.customer_name}</p>
              </div>
              <div>
                <p className="text-gray-600">Location</p>
                <p className="font-semibold text-gray-900">{job.location}</p>
              </div>
            </div>
          </div>

          {/* Warning box */}
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-8">
            <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Important</h4>
            <p className="text-sm text-yellow-800">
              When you click "Continue to In Route", we will send an SMS to <strong>{job.foreman_name}</strong> at{' '}
              <strong>{job.foreman_phone}</strong> notifying them of your ETA.
            </p>
          </div>

          {/* 3 Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => setShowPreview(true)}
              className="w-full px-8 py-4 bg-purple-100 text-purple-700 rounded-2xl hover:bg-purple-200 transition-all font-bold text-lg flex items-center justify-center gap-3"
            >
              <Eye className="w-6 h-6" />
              Preview Ticket Instead
            </button>

            <button
              onClick={() => {
                const now = new Date();
                const currentTime = now.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });
                setPendingTime(currentTime);
                setShowConfirmation(true);
              }}
              disabled={submitting}
              className={`w-full px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-2xl flex items-center justify-center gap-3 ${
                submitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white transform hover:scale-[1.02]'
              }`}
            >
              {submitting ? (
                <>
                  <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full"></div>
                  Starting In Route...
                </>
              ) : (
                <>
                  <PlayCircle className="w-6 h-6" />
                  Continue to In Route
                </>
              )}
            </button>

            <button
              onClick={() => {
                const now = new Date();
                const currentTime = now.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });
                setManualTime(currentTime);
                setShowManualTimeEntry(true);
              }}
              className="w-full px-8 py-4 bg-orange-100 text-orange-700 rounded-2xl hover:bg-orange-200 transition-all font-bold text-lg flex items-center justify-center gap-3"
            >
              <Edit className="w-6 h-6" />
              Edit In Route Time
            </button>

            <button
              onClick={() => router.push('/dashboard/job-schedule')}
              className="w-full px-8 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all font-bold text-lg flex items-center justify-center gap-3"
            >
              <ArrowLeft className="w-6 h-6" />
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirmation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Confirm In Route Time</h2>
              <p className="text-sm text-gray-600 mb-6">
                Please verify the time before sending notification to the customer.
              </p>

              <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-6 text-center">
                <p className="text-sm text-gray-600 mb-2">Starting In Route At:</p>
                <p className="text-5xl font-bold text-blue-600">{pendingTime}</p>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-6">
                <p className="text-sm text-yellow-900">
                  <strong>⚠️ Note:</strong> Clicking "Confirm In Route" will send an SMS to <strong>{job?.foreman_name}</strong> at{' '}
                  <strong>{job?.foreman_phone}</strong> notifying them of your ETA.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleContinueInRoute(pendingTime)}
                  disabled={submitting}
                  className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all ${
                    submitting
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white'
                  }`}
                >
                  {submitting ? 'Processing...' : '✓ Confirm In Route'}
                </button>

                <button
                  onClick={() => {
                    setShowConfirmation(false);
                    setManualTime(pendingTime);
                    setShowManualTimeEntry(true);
                  }}
                  className="w-full px-6 py-4 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 transition-all font-bold text-lg"
                >
                  Edit In Route Time
                </button>

                <button
                  onClick={() => setShowConfirmation(false)}
                  className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Time Entry Modal */}
        {showManualTimeEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Edit In Route Time</h2>
              <p className="text-sm text-gray-600 mb-6">
                Enter the actual time you started traveling. <strong className="text-orange-600">No SMS will be sent.</strong>
              </p>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  In Route Time
                </label>
                <input
                  type="text"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  placeholder="e.g., 2:30 PM"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 text-lg"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Format: H:MM AM/PM (e.g., 2:30 PM or 10:15 AM)
                </p>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-6">
                <p className="text-sm text-yellow-900">
                  <strong>Note:</strong> This will update your timecard but will NOT send an SMS notification to the customer.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowManualTimeEntry(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualTimeEntry}
                  disabled={submitting}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                    submitting
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {submitting ? 'Saving...' : 'Save Time'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
