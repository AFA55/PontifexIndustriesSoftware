'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  job_type: string;
  location: string;
  address: string;
  description: string;
  status: string;
  priority: string;
  scheduled_date: string;
  arrival_time: string;
  estimated_hours: number;
  foreman_name: string;
  foreman_phone: string;
  salesman_name: string;
  equipment_needed: string[];
}

// Get current date
const getCurrentDate = () => {
  const today = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  return today.toLocaleDateString('en-US', options);
};

// Navigation for different days
const getDateNavigation = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
};

export default function JobSchedule() {
  const [loading, setLoading] = useState(true);
  const [currentDateOffset, setCurrentDateOffset] = useState(0);
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<string | null>(null);
  const [workflowStatuses, setWorkflowStatuses] = useState<{[jobId: string]: any}>({});
  const router = useRouter();

  useEffect(() => {
    fetchJobs();
    fetchActiveJob();
  }, [currentDateOffset]);

  // Fetch workflow status for a specific job
  const fetchWorkflowStatus = async (jobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const response = await fetch(`/api/workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          return result.data;
        }
      }
    } catch (error) {
      console.log('Error fetching workflow status for job:', jobId, error);
    }
    return null;
  };

  // Check if job workflow has been started
  const hasWorkflowStarted = (jobId: string) => {
    const workflow = workflowStatuses[jobId];
    if (!workflow) return false;

    // Consider workflow started if any step beyond equipment_checklist is completed
    return workflow.equipment_checklist_completed ||
           workflow.sms_sent ||
           workflow.silica_form_completed ||
           workflow.work_performed_completed ||
           workflow.pictures_submitted ||
           workflow.customer_signature_received;
  };

  // Get the current workflow step for a job
  const getCurrentWorkflowStep = (jobId: string): { name: string; color: string; icon: string } | null => {
    const workflow = workflowStatuses[jobId];
    if (!workflow) return null;

    // Find the current step based on completion status
    if (workflow.job_completed) {
      return { name: 'Completed', color: 'from-green-500 to-green-600', icon: 'check' };
    } else if (workflow.customer_signature_received) {
      return { name: 'Job Complete', color: 'from-green-500 to-green-600', icon: 'check' };
    } else if (workflow.pictures_submitted) {
      return { name: 'Customer Signature', color: 'from-purple-500 to-purple-600', icon: 'signature' };
    } else if (workflow.work_performed_completed) {
      return { name: 'Pictures', color: 'from-pink-500 to-pink-600', icon: 'camera' };
    } else if (workflow.silica_form_completed) {
      return { name: 'Work Performed', color: 'from-orange-500 to-orange-600', icon: 'work' };
    } else if (workflow.sms_sent) {
      return { name: 'Silica Form', color: 'from-yellow-500 to-yellow-600', icon: 'form' };
    } else if (workflow.equipment_checklist_completed) {
      return { name: 'In Route', color: 'from-blue-500 to-blue-600', icon: 'route' };
    } else {
      return { name: 'Equipment Checklist', color: 'from-gray-500 to-gray-600', icon: 'checklist' };
    }
  };

  const fetchActiveJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check operator_status_history for current active job
      const { data: activeStatus, error } = await supabase
        .from('operator_status_history')
        .select('job_order_id, status, route_started_at, work_started_at')
        .eq('operator_id', session.user.id)
        .in('status', ['in_route', 'in_progress'])
        .order('route_started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeStatus && !error) {
        setActiveJobId(activeStatus.job_order_id);
        setActiveJobStatus(activeStatus.status);
        console.log('Active job found:', activeStatus.job_order_id, 'Status:', activeStatus.status);
      } else {
        setActiveJobId(null);
        setActiveJobStatus(null);
      }
    } catch (error) {
      console.error('Error fetching active job:', error);
    }
  };

  // Determine the correct page to redirect to based on workflow progress
  const getWorkflowRedirectUrl = async (jobId: string, status: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session, redirecting to start-route');
        return `/dashboard/job-schedule/${jobId}/start-route`;
      }

      // Try to fetch workflow progress, but don't let it block navigation
      try {
        console.log('Fetching workflow for job:', jobId);
        const response = await fetch(`/api/workflow?jobId=${jobId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Workflow response:', result);

          if (result.success && result.data) {
            const workflow = result.data;

            // Log workflow state
            console.log('Workflow state:', {
              equipment_checklist: workflow.equipment_checklist_completed,
              sms_sent: workflow.sms_sent,
              silica_form: workflow.silica_form_completed,
              work_performed: workflow.work_performed_completed
            });

            // Find the first incomplete step to resume from
            if (!workflow.equipment_checklist_completed) {
              console.log('Redirecting to start-route (equipment checklist not completed)');
              return `/dashboard/job-schedule/${jobId}/start-route`;
            } else if (!workflow.sms_sent) {
              console.log('Redirecting to in-route (SMS not sent)');
              return `/dashboard/job-schedule/${jobId}/in-route`;
            } else if (!workflow.silica_form_completed) {
              console.log('Redirecting to silica-exposure (silica form not completed)');
              return `/dashboard/job-schedule/${jobId}/silica-exposure`;
            } else if (!workflow.work_performed_completed) {
              console.log('Redirecting to work-performed (work not completed)');
              return `/dashboard/job-schedule/${jobId}/work-performed`;
            } else if (!workflow.pictures_submitted) {
              console.log('Redirecting to pictures');
              return `/dashboard/job-schedule/${jobId}/pictures`;
            } else if (!workflow.customer_signature_received) {
              console.log('Redirecting to customer-signature');
              return `/dashboard/job-schedule/${jobId}/customer-signature`;
            } else {
              console.log('All steps completed, redirecting to complete');
              return `/dashboard/job-schedule/${jobId}/complete`;
            }
          }
        } else {
          console.error('Workflow API returned error:', response.status, await response.text());
        }
      } catch (workflowError) {
        console.error('Workflow tracking error:', workflowError);
        // Continue to fallback logic below
      }
    } catch (error) {
      console.error('Error in workflow redirect:', error);
    }

    // Fallback based on status if workflow fetch fails
    console.log('Using fallback navigation, status:', status);
    if (status === 'in_route') {
      return `/dashboard/job-schedule/${jobId}/in-route`;
    } else if (status === 'in_progress') {
      return `/dashboard/job-schedule/${jobId}/silica-exposure`;
    }

    return `/dashboard/job-schedule/${jobId}/start-route`;
  };

  const fetchJobs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Get the date for the current offset
      const targetDate = getDateNavigation(currentDateOffset);
      const dateStr = targetDate.toISOString().split('T')[0];

      const response = await fetch(`/api/job-orders`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Filter jobs for the selected date
          const filteredJobs = result.data.filter((job: JobOrder) => {
            if (!job.scheduled_date) return false;
            const jobDate = new Date(job.scheduled_date).toISOString().split('T')[0];
            return jobDate === dateStr;
          });
          setJobs(filteredJobs);

          // Fetch workflow status for each job
          const workflows: {[jobId: string]: any} = {};
          await Promise.all(
            filteredJobs.map(async (job: JobOrder) => {
              const workflow = await fetchWorkflowStatus(job.id);
              if (workflow) {
                workflows[job.id] = workflow;
              }
            })
          );
          setWorkflowStatuses(workflows);
        }
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
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

  const currentDisplayDate = getDateNavigation(currentDateOffset);
  const dateString = currentDisplayDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const getDirectionsUrl = (address: string) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Modern Glass Morphism Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Back Button with Gradient */}
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-2xl transition-all duration-300 font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105"
            >
              <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            {/* Title with Gradient */}
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Job Schedule
            </h1>

            {/* User Avatar with Status Indicator */}
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold">J</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Modern Date Navigation with Glass Effect */}
        <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 mb-8 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentDateOffset(currentDateOffset - 1)}
                className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-gray-100 to-gray-50 hover:from-gray-200 hover:to-gray-100 rounded-2xl transition-all duration-300 font-medium border border-gray-300/50"
              >
                <svg className="w-5 h-5 text-gray-700 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-gray-700">Previous</span>
              </button>

              <div className="text-center">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {dateString}
                    </h2>
                    <p className="text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                      {currentDateOffset === 0 ? "Today's Schedule" :
                       currentDateOffset === 1 ? "Tomorrow" :
                       currentDateOffset === -1 ? "Yesterday" :
                       `${Math.abs(currentDateOffset)} days ${currentDateOffset > 0 ? 'ahead' : 'ago'}`}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCurrentDateOffset(currentDateOffset + 1)}
                className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-gray-100 to-gray-50 hover:from-gray-200 hover:to-gray-100 rounded-2xl transition-all duration-300 font-medium border border-gray-300/50"
              >
                <span className="text-gray-700">Next</span>
                <svg className="w-5 h-5 text-gray-700 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Modern Jobs List with Glass Cards */}
        <div className="space-y-6">
          {jobs.length > 0 ? (
            // Show jobs if any exist for this date
            jobs.map((job, index) => (
              <div
                key={job.id}
                onClick={async () => {
                  // Always check workflow state before navigating
                  const redirectUrl = await getWorkflowRedirectUrl(job.id, job.status);
                  router.push(redirectUrl);
                }}
                className="block group cursor-pointer"
              >
                <div className="relative bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl hover:shadow-2xl border border-gray-200/50 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
                  {/* Priority Indicator Bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    job.priority === 'high' ? 'bg-gradient-to-b from-red-500 to-red-600' :
                    job.priority === 'medium' ? 'bg-gradient-to-b from-yellow-500 to-yellow-600' :
                    'bg-gradient-to-b from-green-500 to-green-600'
                  }`}></div>

                  <div className="p-6">
                    {/* Modern Header with Status */}
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-start gap-4">
                        {/* Dynamic Status Icon */}
                        <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                          job.status === 'scheduled' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                          job.status === 'in-progress' ? 'bg-gradient-to-br from-orange-500 to-orange-600' :
                          'bg-gradient-to-br from-green-500 to-green-600'
                        }`}>
                          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          {/* Pulse Animation for Active Jobs */}
                          {job.status === 'in-progress' && (
                            <div className="absolute inset-0 rounded-2xl bg-orange-400 animate-ping opacity-20"></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                              {job.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">{job.arrival_time || 'TBD'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                              <span className="font-medium">#{job.job_number}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">{job.estimated_hours || 0} hrs</div>
                        <div className="text-xs text-gray-500 font-medium">Estimated</div>
                      </div>
                    </div>

                    {/* Enhanced Info Cards */}
                    <div className="grid md:grid-cols-2 gap-4 mb-5">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Location
                          </h4>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              window.open(getDirectionsUrl(job.address), '_blank');
                            }}
                            className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                            title="Get Directions"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-gray-800 font-medium text-sm mb-1">{job.location}</p>
                        <p className="text-blue-600 text-xs font-medium hover:underline cursor-pointer"
                           onClick={(e) => {
                             e.preventDefault();
                             window.open(getDirectionsUrl(job.address), '_blank');
                           }}>
                          📍 {job.address}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          Job Type
                        </h4>
                        <p className="text-gray-800 font-medium text-sm">{job.job_type}</p>
                        <p className="text-gray-600 text-xs mt-1 line-clamp-2">{job.description || 'No description'}</p>
                      </div>
                    </div>

                    {/* Contact Information */}
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-2xl p-4 mb-5">
                      <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        Job Site Contact
                      </h4>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-gray-600 text-xs mb-1">Foreman</p>
                          <p className="text-gray-900 font-bold text-base">{job.foreman_name || 'N/A'}</p>
                          <p className="text-gray-600 text-xs">Salesman: {job.salesman_name || 'N/A'}</p>
                        </div>
                        {job.foreman_phone && (
                          <a
                            href={`tel:${job.foreman_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-medium transition-all duration-300 shadow-lg hover:scale-105"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span className="hidden sm:inline">{job.foreman_phone}</span>
                            <span className="sm:hidden">Call</span>
                          </a>
                        )}
                      </div>
                    </div>



                    {/* Active Job Warning Banner */}
                    {activeJobId && activeJobId !== job.id && (
                      <div className="mb-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-2xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-gray-900">You have an active job</p>
                            <p className="text-sm text-gray-700">Complete or cancel your current job before starting a new one</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Active Job - Continue Button */}
                    {activeJobId && activeJobId === job.id && (
                      <div className="mb-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-2xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-400 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="absolute inset-0 rounded-xl bg-green-400 animate-ping opacity-30"></div>
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-gray-900">Active Job</p>
                            <p className="text-sm text-gray-700">
                              Status: <span className="font-semibold">{activeJobStatus === 'in_route' ? 'In Route' : 'In Progress'}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Workflow Progress Indicator */}
                    {(() => {
                      const currentStep = getCurrentWorkflowStep(job.id);
                      if (currentStep) {
                        return (
                          <div className="mb-4 bg-gradient-to-r from-slate-50 to-gray-50 border-2 border-gray-300 rounded-2xl p-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 bg-gradient-to-br ${currentStep.color} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg`}>
                                {currentStep.icon === 'check' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                {currentStep.icon === 'signature' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                )}
                                {currentStep.icon === 'camera' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  </svg>
                                )}
                                {currentStep.icon === 'work' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                  </svg>
                                )}
                                {currentStep.icon === 'form' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                )}
                                {currentStep.icon === 'route' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                  </svg>
                                )}
                                {currentStep.icon === 'checklist' && (
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Workflow Step</p>
                                <p className="text-base font-bold text-gray-900">{currentStep.name}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                <span className="text-xs font-medium text-blue-600">In Progress</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Modern Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (activeJobId && activeJobId !== job.id) {
                            alert('You already have an active job. Please complete or cancel it before starting a new one.');
                            return;
                          }
                          // ALWAYS check workflow state for this job
                          const redirectUrl = await getWorkflowRedirectUrl(job.id, job.status);
                          router.push(redirectUrl);
                        }}
                        disabled={!!(activeJobId && activeJobId !== job.id)}
                        className={`flex-1 py-3 px-4 rounded-2xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          activeJobId && activeJobId !== job.id
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : activeJobId === job.id || hasWorkflowStarted(job.id)
                            ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/30'
                            : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {activeJobId === job.id || hasWorkflowStarted(job.id)
                          ? 'Continue Process'
                          : 'Start Route'
                        }
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('🎯 EQUIPMENT BUTTON CLICKED - Job:', job.job_number, 'ID:', job.id);
                          router.push(`/dashboard/job-schedule/${job.id}/equipment-checklist`);
                        }}
                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 px-4 rounded-2xl font-medium transition-all duration-300 shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/30 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Equipment Checklist
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('🎯 PREVIEW BUTTON CLICKED - Job:', job.job_number, 'ID:', job.id);
                          router.push(`/dashboard/job-schedule/${job.id}/preview`);
                        }}
                        className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 flex items-center gap-2 font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Preview Ticket
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // No jobs scheduled for this date
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Jobs Scheduled</h3>
              <p className="text-gray-500">You have no jobs scheduled for {dateString.toLowerCase()}.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}