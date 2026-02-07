'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ServiceCompletionAgreement from '@/components/ServiceCompletionAgreement';

export default function CustomerSignaturePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [workPerformed, setWorkPerformed] = useState<string[]>([]);
  const [workPerformedDetails, setWorkPerformedDetails] = useState<any[]>([]);
  const [showAgreement, setShowAgreement] = useState(false);
  const [standbyLogs, setStandbyLogs] = useState<any[]>([]);
  const [totalStandbyHours, setTotalStandbyHours] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [isMultiDayJob, setIsMultiDayJob] = useState<boolean>(false);

  useEffect(() => {
    loadJobData();
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadStandbyLogs = async () => {
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
          const logs = result.data.filter((log: any) => log.status === 'completed');
          setStandbyLogs(logs);

          // Calculate total standby hours
          const total = logs.reduce((sum: number, log: any) => {
            return sum + (log.duration_hours || 0);
          }, 0);
          setTotalStandbyHours(total);
        }
      }
    } catch (e) {
      console.error('Error loading standby logs:', e);
    }
  };

  const loadJobData = async () => {
    try {
      console.log('Loading job:', jobId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Load all job data
      const { data, error: queryError } = await supabase
        .from('job_orders')
        .select('*')
        .eq('id', jobId)
        .single();

      console.log('Query result:', { data, error: queryError });

      if (queryError) {
        setError(`Database error: ${queryError.message}`);
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Job not found in database');
        setLoading(false);
        return;
      }

      // Load work performed from localStorage
      let workPerformedList: string[] = [];
      let workDetails: any[] = [];
      try {
        const savedWork = localStorage.getItem(`work-performed-${jobId}`);
        if (savedWork) {
          const parsed = JSON.parse(savedWork);
          workDetails = parsed.items || [];
          workPerformedList = workDetails.map((item: any) => {
            let desc = item.name;
            if (item.quantity > 1) desc += ` (x${item.quantity})`;
            if (item.notes) desc += ` - ${item.notes}`;
            return desc;
          });
        }
      } catch (e) {
        console.log('No work performed data found in localStorage');
      }

      // Load standby logs
      await loadStandbyLogs();

      // Check if this is a multi-day job by looking at scheduled_duration or checking daily logs
      // A job is considered multi-day if it has existing daily logs (indicating previous days)
      // OR if admin has scheduled it for multiple days
      const { data: dailyLogs } = await supabase
        .from('daily_job_logs')
        .select('id')
        .eq('job_order_id', jobId);

      // If there are daily logs, this job has been running for multiple days
      // OR check if there's a scheduled_duration field > 1
      const hasMultipleDays = (dailyLogs && dailyLogs.length > 0) || (data.scheduled_duration && data.scheduled_duration > 1);
      setIsMultiDayJob(hasMultipleDays);

      setJob(data);
      setWorkPerformed(workPerformedList);
      setWorkPerformedDetails(workDetails);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading job:', err);
      setError(`Error: ${err.message}`);
      setLoading(false);
    }
  };

  const handleSign = async (signatureData: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('Session expired. Please log in again.', 'error');
        setTimeout(() => router.push('/login'), 1500);
        return;
      }

      // Save completion signature and customer feedback, and mark job as completed
      const { error } = await supabase
        .from('job_orders')
        .update({
          completion_signature: signatureData.contactNotOnSite ? null : signatureData.signature,
          completion_signer_name: signatureData.contactNotOnSite ? null : signatureData.customerName,
          completion_signed_at: new Date().toISOString(),
          completion_notes: signatureData.additionalNotes || null,
          contact_not_on_site: signatureData.contactNotOnSite || false,
          customer_cleanliness_rating: signatureData.cleanlinessRating || null,
          customer_communication_rating: signatureData.communicationRating || null,
          customer_overall_rating: signatureData.overallRating || null,
          customer_feedback_comments: signatureData.feedbackComments || null,
          status: 'completed'
        })
        .eq('id', jobId);

      if (error) {
        showNotification('Error saving signature: ' + error.message, 'error');
        throw error;
      }

      // Generate PDF of signed agreement
      try {
        await fetch('/api/service-completion-agreement/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            jobId: jobId,
            jobData: {
              orderId: job.id,
              customer: job.customer || job.customer_name || 'Customer',
              jobLocation: job.job_location || job.location || job.address || 'Job Site',
              workDescription: job.description || job.work_description || job.scope_of_work || 'Concrete cutting services'
            },
            signatureData: signatureData,
            workPerformedDetails: workPerformedDetails
          })
        });
        console.log('PDF generated and saved successfully');
      } catch (e) {
        console.error('PDF generation failed:', e);
      }

      // Update operator ratings if ratings were provided
      if (signatureData.cleanlinessRating || signatureData.communicationRating || signatureData.overallRating) {
        try {
          // Get the assigned operator for this job
          const operatorId = job.assigned_to;

          if (operatorId) {
            await fetch('/api/operator-ratings/update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({
                operatorId: operatorId,
                cleanlinessRating: signatureData.cleanlinessRating,
                communicationRating: signatureData.communicationRating,
                overallRating: signatureData.overallRating
              })
            });
            console.log('Operator ratings updated successfully');
          }
        } catch (e) {
          console.error('Failed to update operator ratings:', e);
          // Don't block completion if rating update fails
        }
      }

      // Update workflow
      try {
        await fetch('/api/workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            jobId: jobId,
            completedStep: 'customer_signature',
            currentStep: 'completed'
          })
        });
      } catch (e) {
        console.log('Workflow update failed, but signature saved');
      }

      showNotification('Service Completion Agreement signed successfully! PDF has been generated and saved.', 'success');
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (error) {
      console.error('Error saving signature:', error);
      throw error;
    }
  };

  // If showing agreement, render the agreement component
  if (showAgreement && job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
        <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAgreement(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">Customer Sign-Off</h1>
                  <p className="text-sm text-gray-600">Service Completion Agreement</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                Job #{jobId}
              </span>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-5xl">
          <ServiceCompletionAgreement
            jobData={{
              orderId: job.id,
              customer: job.customer || job.customer_name || 'Customer',
              jobLocation: job.job_location || job.location || job.address || 'Job Site',
              workDescription: job.description || job.work_description || job.scope_of_work || 'Concrete cutting services',
              workPerformed: workPerformed,
              workPerformedDetails: workPerformedDetails
            }}
            onSign={handleSign}
            onCancel={() => setShowAgreement(false)}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading job data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/job-schedule/${jobId}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Customer Sign-Off</h1>
                <p className="text-sm text-gray-600">Service Completion Agreement</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              Job #{jobId}
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="bg-white rounded-3xl shadow-2xl border-2 border-green-200 p-8">
          {error ? (
            <div className="text-center">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Job</h2>
              <p className="text-red-600 mb-4">{error}</p>
              <p className="text-sm text-gray-500 mb-4">Job ID: {jobId}</p>
              <button
                onClick={() => router.push(`/dashboard/job-schedule/${jobId}`)}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-semibold"
              >
                Back to Job Schedule
              </button>
            </div>
          ) : job ? (
            <div className="text-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Job Data Loaded Successfully!</h2>

              {/* Display job details */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left">
                <h3 className="font-bold text-gray-900 mb-4">Job Details:</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-start py-2 border-b border-gray-200">
                    <span className="font-semibold text-gray-700">Job ID:</span>
                    <span className="text-gray-900">{job.id}</span>
                  </div>
                  <div className="flex justify-between items-start py-2 border-b border-gray-200">
                    <span className="font-semibold text-gray-700">Customer:</span>
                    <span className="text-gray-900">{job.customer || job.customer_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-start py-2 border-b border-gray-200">
                    <span className="font-semibold text-gray-700">Location:</span>
                    <span className="text-gray-900 text-right max-w-xs">
                      {job.job_location || job.location || job.address || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-start py-2">
                    <span className="font-semibold text-gray-700">Description:</span>
                    <span className="text-gray-900 text-right max-w-xs">
                      {job.description || job.work_description || job.scope_of_work || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Display work performed if available */}
              {workPerformedDetails.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-6 mb-6 text-left border-2 border-blue-200">
                  <h3 className="font-bold text-blue-900 mb-4">Work Performed:</h3>
                  <div className="space-y-4">
                    {workPerformedDetails.map((item: any, index) => (
                      <div key={index} className="bg-white rounded-lg p-4 border border-blue-200">
                        <div className="flex items-start gap-3">
                          <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <div className="flex-1">
                            <div className="font-bold text-blue-900 mb-2">
                              {item.name}
                              {item.quantity > 1 && <span className="ml-2 text-sm">(Quantity: {item.quantity})</span>}
                            </div>

                            {/* Core Drilling Details */}
                            {item.details?.holes && (
                              <div className="mt-2 space-y-2">
                                <div className="text-sm font-semibold text-gray-700">Specifications:</div>
                                {item.details.holes.map((hole: any, holeIndex: number) => (
                                  <div key={holeIndex} className="pl-3 text-sm text-gray-700 bg-blue-50 p-2 rounded">
                                    <div className="space-y-1">
                                      <div><strong>Bit Size:</strong> {hole.bitSize} inches | <strong>Depth:</strong> {hole.depthInches}" | <strong>Holes:</strong> {hole.quantity}</div>
                                      {hole.plasticSetup && <div><strong>Setup:</strong> Plastic/Handheld</div>}
                                      {hole.cutSteel && <div><strong>Steel Cut:</strong> Yes{hole.steelEncountered ? ` (${hole.steelEncountered})` : ''}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Sawing Details */}
                            {item.details?.cuts && (
                              <div className="mt-2 space-y-2">
                                <div className="text-sm font-semibold text-gray-700">Specifications:</div>
                                {item.details.cuts.map((cut: any, cutIndex: number) => (
                                  <div key={cutIndex} className="pl-3 text-sm text-gray-700 bg-blue-50 p-2 rounded space-y-1">
                                    <div><strong>Linear Feet:</strong> {cut.linearFeet} LF | <strong>Cut Depth:</strong> {cut.cutDepth} inches</div>
                                    {cut.bladesUsed && cut.bladesUsed.length > 0 && (
                                      <div><strong>Blades Used:</strong> {cut.bladesUsed.join(', ')}</div>
                                    )}
                                    {cut.cutSteel && <div><strong>Steel Cut:</strong> Yes{cut.steelEncountered ? ` (${cut.steelEncountered})` : ''}</div>}
                                    {cut.overcut && <div><strong>Overcut:</strong> Yes</div>}
                                    {cut.chainsawed && (
                                      <div><strong>Chainsawed:</strong> {cut.chainsawAreas} areas @ {cut.chainsawWidthInches}" width</div>
                                    )}
                                    {cut.areas && cut.areas.length > 0 && (
                                      <div>
                                        <strong>Areas Cut:</strong>
                                        {cut.areas.map((area: any, areaIndex: number) => (
                                          <div key={areaIndex} className="ml-4">
                                            • {area.length}' × {area.width}' × {area.depth}" deep (Qty: {area.quantity})
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {item.details.cutType && (
                                  <div className="text-sm text-gray-700 pl-3">
                                    <strong>Cut Type:</strong> {item.details.cutType === 'wet' ? 'Wet Cut' : 'Dry Cut'}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* General Details */}
                            {item.details?.duration && (
                              <div className="mt-2 text-sm text-gray-700">
                                <strong>Duration:</strong> {item.details.duration} hours
                              </div>
                            )}
                            {item.details?.equipment && item.details.equipment.length > 0 && (
                              <div className="mt-2 text-sm text-gray-700">
                                <strong>Equipment:</strong> {item.details.equipment.join(', ')}
                              </div>
                            )}

                            {/* Notes */}
                            {item.notes && (
                              <div className="mt-2 text-sm text-gray-700 bg-gray-100 p-2 rounded">
                                <strong>Notes:</strong> {item.notes}
                              </div>
                            )}
                            {item.details?.notes && (
                              <div className="mt-2 text-sm text-gray-700 bg-gray-100 p-2 rounded">
                                <strong>Additional Notes:</strong> {item.details.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Display standby time if available */}
              {standbyLogs.length > 0 && (
                <div className="bg-yellow-50 rounded-xl p-6 mb-6 text-left border-2 border-yellow-300">
                  <h3 className="font-bold text-yellow-900 mb-4">Standby Time:</h3>
                  <div className="space-y-3">
                    {standbyLogs.map((log: any, index) => {
                      const hours = Math.floor(log.duration_hours);
                      const minutes = Math.round((log.duration_hours - hours) * 60);
                      return (
                        <div key={index} className="bg-white rounded-lg p-4 border border-yellow-300">
                          <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="flex-1">
                              <div className="text-sm text-gray-700 space-y-1">
                                <div>
                                  <strong>Duration:</strong> {hours > 0 && `${hours}h `}{minutes}m
                                </div>
                                <div>
                                  <strong>Started:</strong> {new Date(log.started_at).toLocaleString()}
                                </div>
                                <div>
                                  <strong>Ended:</strong> {new Date(log.ended_at).toLocaleString()}
                                </div>
                                {log.reason && (
                                  <div className="mt-2 bg-yellow-50 p-2 rounded">
                                    <strong>Reason:</strong> {log.reason}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="bg-yellow-100 rounded-lg p-4 border-2 border-yellow-400">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-yellow-900">Total Standby Time:</span>
                        <span className="text-lg font-bold text-yellow-900">
                          {Math.floor(totalStandbyHours)}h {Math.round((totalStandbyHours - Math.floor(totalStandbyHours)) * 60)}m
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-500 mb-8">
                All data loaded successfully. Choose how to complete this workday:
              </p>

              {/* End Day Button - Only show if job is scheduled for multiple days */}
              {isMultiDayJob && (
                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to end the day? The job will continue tomorrow and you will need to start En Route and In Progress again.')) {
                      return;
                    }

                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) {
                        showNotification('Session expired. Please log in again.', 'error');
                        setTimeout(() => router.push('/login'), 1500);
                        return;
                      }

                      // Get current location
                      let latitude: number | null = null;
                      let longitude: number | null = null;
                      try {
                        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                          navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 5000,
                            maximumAge: 0
                          });
                        });
                        latitude = position.coords.latitude;
                        longitude = position.coords.longitude;
                      } catch (e) {
                        console.log('Could not get location:', e);
                      }

                      // Submit daily log
                      const response = await fetch(`/api/job-orders/${jobId}/daily-log`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session.access_token}`
                        },
                        body: JSON.stringify({
                          workPerformed: workPerformedDetails,
                          notes: null,
                          continueNextDay: true,
                          latitude,
                          longitude
                        })
                      });

                      const result = await response.json();

                      if (!response.ok) {
                        throw new Error(result.error || 'Failed to save daily progress');
                      }

                      showNotification('Daily progress saved! Job has been reset for tomorrow.', 'success');

                      // Clear work performed data
                      localStorage.removeItem(`work-performed-${jobId}`);

                      setTimeout(() => router.push('/dashboard'), 2000);
                    } catch (error: any) {
                      console.error('Error saving daily progress:', error);
                      showNotification('Error saving daily progress: ' + error.message, 'error');
                    }
                  }}
                  className="w-full py-5 rounded-xl font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] mb-4"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  End Day & Continue Tomorrow
                </button>
              )}

              {/* Complete Job Button - Get signature and finish */}
              <button
                onClick={() => setShowAgreement(true)}
                className="w-full py-5 rounded-xl font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] mb-4"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Complete Job & Get Signature
              </button>

              <button
                onClick={() => router.push(`/dashboard/job-schedule/${jobId}`)}
                className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-semibold"
              >
                Back to Job Schedule
              </button>
            </div>
          ) : null}
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className="fixed top-4 right-4 z-[60] animate-slide-in">
            <div className={`rounded-2xl shadow-2xl p-4 flex items-center gap-3 min-w-[300px] ${
              notification.type === 'success' ? 'bg-green-500 text-white' :
              notification.type === 'error' ? 'bg-red-500 text-white' :
              'bg-yellow-500 text-white'
            }`}>
              <div className="flex-shrink-0">
                {notification.type === 'success' && (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {notification.type === 'error' && (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {notification.type === 'warning' && (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <p className="font-semibold">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className="ml-auto flex-shrink-0 hover:bg-white/20 rounded-lg p-1 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
