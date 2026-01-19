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

  useEffect(() => {
    loadJobData();
  }, []);

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
        alert('Session expired. Please log in again.');
        router.push('/login');
        return;
      }

      // Save completion signature and customer feedback
      const { error } = await supabase
        .from('job_orders')
        .update({
          completion_signature: signatureData.signature,
          completion_signer_name: signatureData.customerName,
          completion_signed_at: new Date().toISOString(),
          completion_notes: signatureData.additionalNotes || null,
          customer_cleanliness_rating: signatureData.cleanlinessRating || null,
          customer_communication_rating: signatureData.communicationRating || null,
          customer_overall_rating: signatureData.overallRating || null,
          customer_feedback_comments: signatureData.feedbackComments || null
        })
        .eq('id', jobId);

      if (error) {
        alert('Error saving signature: ' + error.message);
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

      alert('Service Completion Agreement signed successfully! PDF has been generated and saved. Thank you for your feedback.');
      router.push('/dashboard');
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

              <p className="text-sm text-gray-500 mb-8">
                All data loaded successfully. Click below to proceed with the Service Completion Agreement.
              </p>

              <button
                onClick={() => setShowAgreement(true)}
                className="w-full py-5 rounded-xl font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] mb-4"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Proceed to Completion Agreement
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
      </div>
    </div>
  );
}
