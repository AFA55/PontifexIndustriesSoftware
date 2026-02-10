'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SHOP_LOCATION, calculateDistance } from '@/lib/geolocation';
import { ArrowLeft, CheckCircle, Navigation, Clock } from 'lucide-react';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  job_type: string;
  location: string;
  address: string;
  equipment_needed: string[];
  foreman_name: string;
  foreman_phone: string;
}

interface WorkflowStatus {
  equipment_checklist_completed: boolean;
  sms_sent: boolean;
  silica_form_completed: boolean;
  work_performed_completed: boolean;
  pictures_submitted: boolean;
  customer_signature_received: boolean;
  current_step: string;
}

export default function StartRoutePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [eta, setEta] = useState<{ distance: number; driveTime: number; arrivalTime: string } | null>(null);
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});
  const [operatorName, setOperatorName] = useState<string>('');
  const [showTimeConfirmModal, setShowTimeConfirmModal] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [departureTime24, setDepartureTime24] = useState('');
  const [displayDepartureTime, setDisplayDepartureTime] = useState('');

  useEffect(() => {
    checkWorkflowAndRedirect();
    fetchJobDetails();
    fetchOperatorName();
    updateWorkflowStep();
  }, [jobId]);

  // Check workflow status and redirect if already past this step
  const checkWorkflowAndRedirect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const workflow: WorkflowStatus = result.data;

          // If equipment checklist is completed, redirect to the appropriate step
          if (workflow.equipment_checklist_completed) {
            console.log('Equipment checklist already completed, redirecting...');

            if (!workflow.sms_sent) {
              router.replace(`/dashboard/job-schedule/${jobId}/in-route`);
              return;
            } else if (!workflow.silica_form_completed) {
              router.replace(`/dashboard/job-schedule/${jobId}/silica-exposure`);
              return;
            } else if (!workflow.work_performed_completed) {
              router.replace(`/dashboard/job-schedule/${jobId}/work-performed`);
              return;
            } else if (!workflow.pictures_submitted) {
              router.replace(`/dashboard/job-schedule/${jobId}/pictures`);
              return;
            } else if (!workflow.customer_signature_received) {
              router.replace(`/dashboard/job-schedule/${jobId}/customer-signature`);
              return;
            } else {
              router.replace(`/dashboard/job-schedule/${jobId}/complete-job`);
              return;
            }
          }
        }
      }
    } catch (error) {
      console.log('Workflow check error (non-blocking):', error);
    }
  };

  const updateWorkflowStep = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Update workflow to indicate we're on the equipment_checklist step
      // Fire and forget - don't await to avoid blocking page load
      fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          currentStep: 'equipment_checklist',
        })
      }).catch(err => {
        // Silently fail - workflow tracking is optional
        console.log('Workflow tracking unavailable:', err);
      });
    } catch (error) {
      // Silently fail - workflow tracking is optional
      console.log('Workflow tracking error:', error);
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
          const jobData = result.data[0];
          setJob(jobData);
          calculateETA(jobData.address);
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

  const calculateETA = async (address: string) => {
    try {
      // Use geocoding to get coordinates from address
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData && geocodeData.length > 0) {
        const jobLat = parseFloat(geocodeData[0].lat);
        const jobLon = parseFloat(geocodeData[0].lon);

        // Calculate distance in meters
        const distanceMeters = calculateDistance(
          SHOP_LOCATION.latitude,
          SHOP_LOCATION.longitude,
          jobLat,
          jobLon
        );

        // Convert to miles
        const distanceMiles = distanceMeters / 1609.34;

        // Estimate drive time (assuming average speed of 45 mph in traffic)
        const driveTimeMinutes = (distanceMiles / 45) * 60;

        // Add fixed 35-minute buffer (shop prep + loading time)
        const bufferMinutes = 35;

        const totalMinutes = driveTimeMinutes + bufferMinutes;

        // Calculate arrival time
        const now = new Date();
        const arrivalDate = new Date(now.getTime() + totalMinutes * 60000);
        const arrivalTimeString = arrivalDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        setEta({
          distance: distanceMiles,
          driveTime: Math.ceil(totalMinutes),
          arrivalTime: arrivalTimeString
        });
      }
    } catch (error) {
      console.error('Error calculating ETA:', error);
      // Set default ETA if calculation fails
      setEta({
        distance: 0,
        driveTime: 30,
        arrivalTime: 'TBD'
      });
    }
  };

  const toggleEquipmentItem = (item: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  const allEquipmentChecked = () => {
    if (!job?.equipment_needed || job.equipment_needed.length === 0) {
      return true; // If no equipment, consider it checked
    }
    return job.equipment_needed.every(item => checkedItems[item] === true);
  };

  const handleStartRoute = async () => {
    if (!allEquipmentChecked()) {
      alert('Please check off all equipment items to confirm you have loaded everything.');
      return;
    }

    if (!checklistConfirmed) {
      alert('Please confirm that you have reviewed and completed the equipment checklist.');
      return;
    }

    // Set initial time values
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // 24-hour format for input
    const time24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    setDepartureTime24(time24);

    // 12-hour format for display
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayTimeString = `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    setDisplayDepartureTime(displayTimeString);
    setCurrentTime(displayTimeString);

    setShowTimeConfirmModal(true);
  };

  const handleConfirmTime = async () => {
    setShowTimeConfirmModal(false);
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        router.push('/login');
        return;
      }

      // Mark equipment checklist as completed and move to in_route step
      await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          completedStep: 'equipment_checklist',
          currentStep: 'in_route',
        })
      });

      // Update job status to "in_route" with departure time
      const statusResponse = await fetch(`/api/job-orders/${jobId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: 'in_route',
          departure_time: displayDepartureTime
        })
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to update job status');
      }

      // Send SMS to point of contact with ETA
      if (job?.foreman_phone && eta && operatorName) {
        const contactName = job.foreman_name || 'there';
        const smsMessage = `Hey ${contactName}, this is ${operatorName} just wanted to let you know we are ${eta.driveTime} minutes away. We will contact you again once we arrive.`;

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

      // Redirect to in-route page
      router.push(`/dashboard/job-schedule/${jobId}/in-route`);
    } catch (error) {
      console.error('Error starting route:', error);
      alert('An error occurred while starting your route. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Preparing route...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Job Not Found</h1>
          <Link href="/dashboard/job-schedule" className="text-blue-600 hover:underline">
            Return to Job Schedule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/job-schedule"
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-all duration-300 font-medium border border-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </Link>

            <h1 className="text-xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
              Start In Route
            </h1>

            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
              <Navigation className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* ETA Card */}
        {eta && (
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl shadow-2xl p-8 mb-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-8 h-8" />
              <h2 className="text-2xl font-bold">Estimated Arrival</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
                <div className="text-blue-100 text-sm mb-1">Distance</div>
                <div className="text-3xl font-bold">{eta.distance.toFixed(1)} mi</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
                <div className="text-blue-100 text-sm mb-1">Drive Time</div>
                <div className="text-3xl font-bold">{eta.driveTime} min</div>
              </div>
            </div>
            <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <div className="text-blue-100 text-sm mb-1">Estimated Arrival Time</div>
              <div className="text-4xl font-bold">{eta.arrivalTime}</div>
              <div className="text-blue-100 text-sm mt-2">
                (includes buffer time for traffic)
              </div>
            </div>
          </div>
        )}

        {/* Job Info */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3">Job Information</h3>
          <div className="space-y-2">
            <p className="text-gray-600"><span className="font-semibold">Job:</span> {job.title}</p>
            <p className="text-gray-600"><span className="font-semibold">Customer:</span> {job.customer_name}</p>
            <p className="text-gray-600"><span className="font-semibold">Location:</span> {job.address}</p>
            <p className="text-gray-600">
              <span className="font-semibold">Point of Contact On-Site:</span> {job.foreman_name || 'N/A'}
              {job.foreman_phone && ` - ${job.foreman_phone}`}
            </p>
          </div>
        </div>

        {/* Equipment Checklist Confirmation */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Equipment Checklist</h3>
              <p className="text-gray-600 mb-4">
                Before proceeding, please confirm you have verified all required equipment:
              </p>
            </div>
          </div>

          {job.equipment_needed && job.equipment_needed.length > 0 ? (
            <div className="space-y-2 mb-6">
              {job.equipment_needed.map((item, idx) => {
                const isChecked = checkedItems[item] === true;
                return (
                  <div
                    key={idx}
                    onClick={() => toggleEquipmentItem(item)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${
                      isChecked
                        ? 'bg-green-50 border-green-500'
                        : 'bg-gray-50 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                      isChecked ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      {isChecked ? (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <span className={`font-medium ${isChecked ? 'text-green-900' : 'text-gray-700'}`}>{item}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6">
              <p className="text-gray-600 italic">No equipment specified for this job</p>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div
            onClick={() => {
              if (allEquipmentChecked()) {
                setChecklistConfirmed(!checklistConfirmed);
              } else {
                alert('Please check off all equipment items first before confirming.');
              }
            }}
            className={`border-2 rounded-2xl p-6 transition-all ${
              allEquipmentChecked()
                ? checklistConfirmed
                  ? 'bg-green-50 border-green-400 cursor-pointer'
                  : 'bg-red-50 border-red-300 hover:border-red-400 cursor-pointer'
                : 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                checklistConfirmed
                  ? 'bg-green-500'
                  : 'bg-red-400'
              }`}>
                {checklistConfirmed ? (
                  <CheckCircle className="w-6 h-6 text-white" />
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h4 className={`font-bold mb-1 ${
                  checklistConfirmed ? 'text-green-800' :
                  allEquipmentChecked() ? 'text-red-800' : 'text-gray-600'
                }`}>
                  {checklistConfirmed ? 'Checklist Confirmed ✓' :
                   allEquipmentChecked() ? 'Checklist Confirmation Required' :
                   'Check All Equipment Items First'}
                </h4>
                <p className={`text-sm ${
                  checklistConfirmed ? 'text-green-700' :
                  allEquipmentChecked() ? 'text-red-700' : 'text-gray-600'
                }`}>
                  {checklistConfirmed
                    ? 'You have confirmed that all equipment has been loaded and you are ready to depart.'
                    : allEquipmentChecked()
                    ? 'Click here to confirm you have reviewed and completed the equipment checklist.'
                    : 'Please check off all equipment items above, then click here to confirm.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-6 mb-6">
          <h4 className="font-bold text-yellow-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            What Happens Next
          </h4>
          <ul className="space-y-2 text-yellow-800 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 font-bold">1.</span>
              <span>Your job status will be updated to "In Route"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 font-bold">2.</span>
              <span>An SMS will be sent to the Point of Contact On-Site with your ETA</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 font-bold">3.</span>
              <span>The office will be notified that you have departed</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 font-bold">4.</span>
              <span>If equipment is missing, contact the office immediately for a change order</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href="/dashboard/job-schedule"
            className="flex-1 px-6 py-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-2xl font-bold text-center transition-all shadow-lg hover:shadow-xl"
          >
            Cancel
          </Link>
          <button
            onClick={handleStartRoute}
            disabled={!checklistConfirmed || !allEquipmentChecked() || submitting}
            className={`flex-1 px-6 py-4 rounded-2xl font-bold text-center transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 ${
              checklistConfirmed && allEquipmentChecked() && !submitting
                ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white cursor-pointer'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                Starting Route...
              </>
            ) : !allEquipmentChecked() ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Check All Equipment First ({Object.values(checkedItems).filter(Boolean).length}/{job?.equipment_needed?.length || 0})
              </>
            ) : (
              <>
                <Navigation className="w-5 h-5" />
                Confirm & Start Route
              </>
            )}
          </button>
        </div>
      </div>

      {/* Time Confirmation Modal */}
      {showTimeConfirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in duration-200">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Confirm Route Start Time</h3>
              <p className="text-gray-600">Please confirm the time you are leaving the shop</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Departure Time
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={departureTime24}
                  onChange={(e) => {
                    const timeValue = e.target.value;
                    setDepartureTime24(timeValue);

                    // Convert 24-hour format to 12-hour AM/PM format for display
                    const [hours, minutes] = timeValue.split(':');
                    const hour = parseInt(hours);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const displayHour = hour % 12 || 12;
                    const formatted = `${displayHour}:${minutes} ${ampm}`;
                    setDisplayDepartureTime(formatted);
                    setCurrentTime(formatted);
                  }}
                  className="w-full px-4 py-4 text-2xl font-bold text-center text-blue-600 bg-blue-50 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                />
              </div>
              <p className="text-sm text-gray-600 mt-3 text-center font-medium">
                Selected Time: <span className="text-blue-600">{displayDepartureTime}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1 text-center">
                This time will be recorded as your official departure from the shop
              </p>
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-yellow-800">
                  This time will be recorded as your official departure from the shop. An SMS will be sent to the point of contact.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTimeConfirmModal(false);
                  setSubmitting(false);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTime}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                Confirm & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
