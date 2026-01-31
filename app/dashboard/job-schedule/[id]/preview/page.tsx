'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, MapPin, Wrench, FileText } from 'lucide-react';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  job_type: string;
  location: string;
  address: string;
  description: string;
  equipment_needed: string[];
  scheduled_date: string;
  arrival_time: string;
  shop_arrival_time?: string;
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

export default function PreviewTicketPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowChecked, setWorkflowChecked] = useState(false);

  useEffect(() => {
    checkWorkflowAndRedirect();
    fetchJobDetails();
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
            console.log('Workflow already past preview, redirecting...');

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
    } finally {
      setWorkflowChecked(true);
    }
  };

  const fetchJobDetails = async () => {
    try {
      // Clear previous job data to prevent showing stale data
      setJob(null);
      setLoading(true);

      console.log('🔍 PREVIEW PAGE - Fetching job with ID:', jobId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Force fresh data with cache busting timestamp
      const timestamp = new Date().getTime();
      console.log('📡 PREVIEW PAGE - Making API call to:', `/api/job-orders?id=${jobId}&t=${timestamp}`);
      const response = await fetch(`/api/job-orders?id=${jobId}&t=${timestamp}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ PREVIEW PAGE - API Response:', result);
        if (result.success && result.data.length > 0) {
          console.log('📋 PREVIEW PAGE - Setting job data:', result.data[0].job_number, result.data[0].title);
          setJob(result.data[0]);
        } else {
          console.error('❌ PREVIEW PAGE - No job data returned');
        }
      } else {
        console.error('❌ PREVIEW PAGE - API call failed:', response.status);
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    } finally {
      setLoading(false);
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
          <p className="text-gray-600 font-medium">Loading ticket preview...</p>
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

            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Ticket Preview
            </h1>

            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Job Header */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 text-white">
            <h2 className="text-3xl font-bold mb-2">{job.title}</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 font-medium">{job.customer_name}</p>
                <p className="text-blue-200 text-sm mt-1">Job #{job.job_number}</p>
              </div>
              <div className="text-right">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2">
                  <div className="text-blue-100 text-xs mb-1">Job Type</div>
                  <div className="text-white font-bold">{job.job_type}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Job Location */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <MapPin className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Job Location</h3>
              <p className="text-gray-900 font-semibold text-lg mb-1">{job.location}</p>
              <p className="text-gray-600 mb-3">{job.address}</p>
              <a
                href={getDirectionsUrl(job.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Get Directions
              </a>
            </div>
          </div>

          {/* Arrival Times */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {job.shop_arrival_time && (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="text-green-700 font-semibold text-sm">🏭 Shop Arrival</div>
                    <div className="text-green-900 font-bold text-xl">{job.shop_arrival_time}</div>
                  </div>
                </div>
              </div>
            )}
            {job.arrival_time && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="text-blue-700 font-semibold text-sm">🏗️ Job Site Arrival</div>
                    <div className="text-blue-900 font-bold text-xl">{job.arrival_time}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Job Description */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Job Description</h3>
              {job.description ? (
                <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6">
                  <pre className="whitespace-pre-wrap text-gray-700 font-medium leading-relaxed">
                    {job.description}
                  </pre>
                </div>
              ) : (
                <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6 text-center">
                  <p className="text-gray-500 italic">No description provided</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Equipment Checklist */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Wrench className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Equipment Checklist</h3>
              {job.equipment_needed && job.equipment_needed.length > 0 ? (
                <div className="space-y-3">
                  {job.equipment_needed.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-200 rounded-xl hover:bg-green-100 transition-colors"
                    >
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="font-semibold text-green-800 text-lg">{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6 text-center">
                  <p className="text-gray-500 italic">No equipment specified</p>
                </div>
              )}
            </div>
          </div>

          {job.equipment_needed && job.equipment_needed.length > 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 mt-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="font-bold text-yellow-900 mb-1">Important Reminder</h4>
                  <p className="text-yellow-800 text-sm">
                    Please verify you have ALL equipment before clicking "In Route". Missing equipment may require a change order or delay the job.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href="/dashboard/job-schedule"
            className="flex-1 px-6 py-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-2xl font-bold text-center transition-all shadow-lg hover:shadow-xl"
          >
            Back to Schedule
          </Link>
          <Link
            href={`/dashboard/job-schedule/${jobId}/start-route`}
            className="flex-1 px-6 py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white rounded-2xl font-bold text-center transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start In Route
          </Link>
        </div>
      </div>
    </div>
  );
}
