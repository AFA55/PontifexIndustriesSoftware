'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FileText, Clock, DollarSign, TrendingUp, Star, MapPin, User } from 'lucide-react';

interface CompletedJob {
  id: string;
  job_number: string;
  customer: string;
  customer_name: string;
  job_location: string;
  location: string;
  address: string;
  description: string;
  scope_of_work: string;
  assigned_to: string;
  scheduled_date: string;
  arrival_time: string;
  shop_arrival_time: string;

  // Completion data
  completion_signed_at: string;
  completion_signer_name: string;
  contact_not_on_site: boolean;

  // Liability release
  liability_release_signed_by: string;
  liability_release_signed_at: string;
  liability_release_pdf: string | null;

  // Silica form
  silica_form_completed_at: string | null;
  silica_form_pdf: string | null;

  // Work order agreement
  agreement_pdf: string | null;
  agreement_pdf_generated_at: string | null;

  // Customer ratings
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;
}

interface JobDetails {
  job: CompletedJob;
  operatorName: string;
  workPerformed: any[];
  standbyLogs: any[];
  totalStandbyHours: number;
  totalStandbyCost: number;
  totalJobHours: number;
  laborCost: number;
  documents: any[];
}

export default function CompletedJobsArchivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [selectedJobDetails, setSelectedJobDetails] = useState<JobDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRating, setFilterRating] = useState<number | null>(null);

  useEffect(() => {
    checkAuth();
    loadCompletedJobs();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      router.push('/dashboard');
    }
  };

  const loadCompletedJobs = async () => {
    try {
      console.log('Loading completed jobs...');
      const { data, error } = await supabase
        .from('job_orders')
        .select('*')
        .eq('status', 'completed')
        .not('completion_signed_at', 'is', null)
        .order('completion_signed_at', { ascending: false });

      if (error && error.message) {
        console.error('Error loading completed jobs:', error);
        throw error;
      }

      console.log('Completed jobs loaded:', data?.length || 0, 'jobs');
      console.log('First job:', data?.[0]);
      setJobs(data || []);
    } catch (error: any) {
      // Only log/alert if there's an actual error message
      if (error?.message) {
        console.error('Error loading completed jobs:', error.message);
        alert('Error loading completed jobs. Check console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetails = async (job: CompletedJob) => {
    console.log('Loading details for job:', job.id);
    setLoadingDetails(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session found');
        setLoadingDetails(false);
        return;
      }

      // Get operator name
      console.log('Fetching operator profile for:', job.assigned_to);
      let operatorName = 'Unknown';
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', job.assigned_to)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          operatorName = profile?.full_name || 'Unknown';
        }
      } catch (err) {
        console.error('Profile fetch failed:', err);
      }

      // Get standby logs
      let standbyLogs: any[] = [];
      try {
        const { data, error: standbyError } = await supabase
          .from('standby_logs')
          .select('*')
          .eq('job_order_id', job.id)
          .eq('status', 'completed');

        if (standbyError) {
          console.error('Error fetching standby logs:', standbyError);
        } else {
          standbyLogs = data || [];
        }
      } catch (err) {
        console.error('Standby logs fetch failed:', err);
      }

      // Calculate standby totals
      const totalStandbyHours = standbyLogs.reduce((sum, log) => sum + (log.duration_hours || 0), 0);
      const totalStandbyCost = totalStandbyHours * 189; // $189/hr standby rate

      // Get work performed from localStorage (if available) or fetch from a work_performed table if you have one
      let workPerformed: any[] = [];
      try {
        const savedWork = localStorage.getItem(`work-performed-${job.id}`);
        if (savedWork) {
          const parsed = JSON.parse(savedWork);
          workPerformed = parsed.items || [];
        }
      } catch (e) {
        console.log('No work performed data in localStorage');
      }

      // Calculate total job hours
      const startTime = new Date(job.arrival_time || job.scheduled_date);
      const endTime = new Date(job.completion_signed_at);
      const totalJobHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

      // Calculate labor cost (assuming $75/hr base rate - adjust as needed)
      const laborCost = totalJobHours * 75;

      // Get documents
      let documents: any[] = [];
      try {
        const { data, error: docsError } = await supabase
          .from('pdf_documents')
          .select('*')
          .eq('job_id', job.id)
          .eq('is_latest', true)
          .order('generated_at', { ascending: false });

        if (docsError) {
          console.error('Error fetching documents:', docsError);
        } else {
          documents = data || [];
        }
      } catch (err) {
        console.error('Documents fetch failed:', err);
      }

      console.log('Job details loaded successfully');
      setSelectedJobDetails({
        job,
        operatorName,
        workPerformed,
        standbyLogs,
        totalStandbyHours,
        totalStandbyCost,
        totalJobHours,
        laborCost,
        documents
      });
    } catch (error) {
      console.error('Error loading job details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch =
      job.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.job_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.job_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRating = filterRating === null ||
      (job.customer_overall_rating && job.customer_overall_rating >= filterRating);

    return matchesSearch && matchesRating;
  });

  const getAverageRating = () => {
    const jobsWithRatings = jobs.filter(j => j.customer_overall_rating);
    if (jobsWithRatings.length === 0) return 0;
    const sum = jobsWithRatings.reduce((acc, j) => acc + (j.customer_overall_rating || 0), 0);
    return (sum / jobsWithRatings.length).toFixed(1);
  };

  const getTotalJobsCompleted = () => jobs.length;

  const getJobsWithoutSignature = () => jobs.filter(j => j.contact_not_on_site).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading completed jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/admin" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Completed Jobs Archive</h1>
                <p className="text-sm text-gray-600">Analytics, documents, and performance data</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              {jobs.length} Completed
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Show message if no completed jobs */}
        {jobs.length === 0 && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center mb-6">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Completed Jobs Yet</h3>
            <p className="text-gray-600">
              Completed jobs with customer signatures will appear here once they're finished.
            </p>
          </div>
        )}

        {/* Stats Overview */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <FileText className="w-8 h-8 text-blue-600" />
                <span className="text-3xl font-bold text-gray-900">{getTotalJobsCompleted()}</span>
              </div>
              <p className="text-sm text-gray-600 font-medium">Total Jobs Completed</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Star className="w-8 h-8 text-yellow-500" />
                <span className="text-3xl font-bold text-gray-900">{getAverageRating()}</span>
              </div>
              <p className="text-sm text-gray-600 font-medium">Average Rating</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <User className="w-8 h-8 text-purple-600" />
                <span className="text-3xl font-bold text-gray-900">{getJobsWithoutSignature()}</span>
              </div>
              <p className="text-sm text-gray-600 font-medium">Contact Not On Site</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <span className="text-3xl font-bold text-gray-900">
                  {jobs.filter(j => j.customer_overall_rating && j.customer_overall_rating >= 8).length}
                </span>
              </div>
              <p className="text-sm text-gray-600 font-medium">Highly Rated (8+)</p>
            </div>
          </div>
        )}

        {/* Filters */}
        {jobs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Search by customer, location, job number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <select
                value={filterRating || ''}
                onChange={(e) => setFilterRating(e.target.value ? Number(e.target.value) : null)}
                className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Ratings</option>
                <option value="9">9+ Stars</option>
                <option value="8">8+ Stars</option>
                <option value="7">7+ Stars</option>
                <option value="5">5+ Stars</option>
              </select>
            </div>
          </div>
        )}

        {jobs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Jobs List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Jobs ({filteredJobs.length})</h2>

                <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                {filteredJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => loadJobDetails(job)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedJobDetails?.job.id === job.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-bold text-gray-900">{job.customer || job.customer_name}</div>
                      {job.contact_not_on_site && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                          No Contact
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">{job.job_location || job.location}</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {new Date(job.completion_signed_at).toLocaleDateString()}
                      </span>
                      {job.customer_overall_rating && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-semibold flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current" />
                          {job.customer_overall_rating}/10
                        </span>
                      )}
                    </div>
                  </button>
                ))}

                {filteredJobs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No completed jobs found
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Job Details Panel */}
            <div className="lg:col-span-2">
              {selectedJobDetails ? (
              <div className="space-y-6">
                {/* Job Overview Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Job Details</h2>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Job Number</label>
                      <p className="text-gray-900">{selectedJobDetails.job.job_number}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Customer</label>
                      <p className="text-gray-900">{selectedJobDetails.job.customer || selectedJobDetails.job.customer_name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Location</label>
                      <p className="text-gray-900">{selectedJobDetails.job.job_location || selectedJobDetails.job.location}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Operator</label>
                      <p className="text-gray-900">{selectedJobDetails.operatorName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Scheduled Date</label>
                      <p className="text-gray-900">
                        {new Date(selectedJobDetails.job.scheduled_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Completion Date</label>
                      <p className="text-gray-900">
                        {new Date(selectedJobDetails.job.completion_signed_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Time & Cost Metrics */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-900">Total Time</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-900">
                        {selectedJobDetails.totalJobHours.toFixed(1)}h
                      </p>
                    </div>

                    <div className="bg-yellow-50 rounded-xl p-4 border-2 border-yellow-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-yellow-600" />
                        <span className="text-sm font-semibold text-yellow-900">Standby Time</span>
                      </div>
                      <p className="text-2xl font-bold text-yellow-900">
                        {selectedJobDetails.totalStandbyHours.toFixed(1)}h
                      </p>
                    </div>

                    <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-semibold text-green-900">Labor Cost</span>
                      </div>
                      <p className="text-2xl font-bold text-green-900">
                        ${selectedJobDetails.laborCost.toFixed(0)}
                      </p>
                    </div>
                  </div>

                  {/* Scope Comparison */}
                  <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3">Original Scope vs Work Performed</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-600 mb-2">Original Description:</p>
                        <p className="text-sm text-gray-900">
                          {selectedJobDetails.job.description || selectedJobDetails.job.scope_of_work || 'No description'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-600 mb-2">Work Performed:</p>
                        {selectedJobDetails.workPerformed.length > 0 ? (
                          <ul className="text-sm text-gray-900 space-y-1">
                            {selectedJobDetails.workPerformed.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-green-600 mt-0.5">✓</span>
                                <span>{item.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500 italic">No detailed work log available</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer Ratings */}
                  {(selectedJobDetails.job.customer_overall_rating ||
                    selectedJobDetails.job.customer_cleanliness_rating ||
                    selectedJobDetails.job.customer_communication_rating) && (
                    <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl p-6 border-2 border-green-200">
                      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-500 fill-current" />
                        Customer Feedback
                      </h3>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        {selectedJobDetails.job.customer_overall_rating && (
                          <div className="text-center">
                            <div className="text-3xl font-bold text-green-600">
                              {selectedJobDetails.job.customer_overall_rating}/10
                            </div>
                            <div className="text-xs text-gray-600">Overall</div>
                          </div>
                        )}
                        {selectedJobDetails.job.customer_cleanliness_rating && (
                          <div className="text-center">
                            <div className="text-3xl font-bold text-blue-600">
                              {selectedJobDetails.job.customer_cleanliness_rating}/10
                            </div>
                            <div className="text-xs text-gray-600">Cleanliness</div>
                          </div>
                        )}
                        {selectedJobDetails.job.customer_communication_rating && (
                          <div className="text-center">
                            <div className="text-3xl font-bold text-purple-600">
                              {selectedJobDetails.job.customer_communication_rating}/10
                            </div>
                            <div className="text-xs text-gray-600">Communication</div>
                          </div>
                        )}
                      </div>
                      {selectedJobDetails.job.customer_feedback_comments && (
                        <div className="text-sm text-gray-700 bg-white p-3 rounded-lg">
                          <strong>Comments:</strong> {selectedJobDetails.job.customer_feedback_comments}
                        </div>
                      )}
                      <div className="mt-3 text-xs text-gray-600">
                        {selectedJobDetails.job.contact_not_on_site
                          ? '⚠️ No customer signature - contact not available on site'
                          : `Signed by: ${selectedJobDetails.job.completion_signer_name || 'Unknown'}`
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* Legal Documents Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="w-6 h-6 text-orange-600" />
                    Job Documents & Attachments
                  </h2>

                  <div className="space-y-3">
                    {/* Work Order Agreement PDF */}
                    {selectedJobDetails.job.agreement_pdf && (
                      <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-orange-600 mt-0.5" />
                            <div>
                              <p className="font-bold text-orange-900">Work Order Agreement</p>
                              <p className="text-sm text-orange-700">
                                Signed at start of job - Terms & conditions accepted
                              </p>
                              <p className="text-xs text-orange-600">
                                {selectedJobDetails.job.agreement_pdf_generated_at
                                  ? new Date(selectedJobDetails.job.agreement_pdf_generated_at).toLocaleString()
                                  : 'Generated with job'}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const blob = new Blob(
                                [Uint8Array.from(atob(selectedJobDetails.job.agreement_pdf!), c => c.charCodeAt(0))],
                                { type: 'application/pdf' }
                              );
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `WorkOrderAgreement_${selectedJobDetails.job.job_number}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="px-3 py-1 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Liability Release PDF */}
                    {selectedJobDetails.job.liability_release_signed_at && selectedJobDetails.job.liability_release_pdf && (
                      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-red-600 mt-0.5" />
                            <div>
                              <p className="font-bold text-red-900">Liability Release & Indemnification</p>
                              <p className="text-sm text-red-700">
                                Signed by: {selectedJobDetails.job.liability_release_signed_by}
                              </p>
                              <p className="text-xs text-red-600">
                                {new Date(selectedJobDetails.job.liability_release_signed_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const blob = new Blob(
                                [Uint8Array.from(atob(selectedJobDetails.job.liability_release_pdf!), c => c.charCodeAt(0))],
                                { type: 'application/pdf' }
                              );
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `LiabilityRelease_${selectedJobDetails.job.job_number}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Silica Exposure Control Plan PDF */}
                    {selectedJobDetails.job.silica_form_completed_at && selectedJobDetails.job.silica_form_pdf && (
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <p className="font-bold text-blue-900">Silica Dust/Exposure Control Plan</p>
                              <p className="text-sm text-blue-700">
                                OSHA compliant silica exposure documentation
                              </p>
                              <p className="text-xs text-blue-600">
                                {new Date(selectedJobDetails.job.silica_form_completed_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const blob = new Blob(
                                [Uint8Array.from(atob(selectedJobDetails.job.silica_form_pdf!), c => c.charCodeAt(0))],
                                { type: 'application/pdf' }
                              );
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `SilicaForm_${selectedJobDetails.job.job_number}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Service Completion Agreement */}
                    {selectedJobDetails.job.completion_signed_at && !selectedJobDetails.job.contact_not_on_site && (
                      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-green-600 mt-0.5" />
                            <div>
                              <p className="font-bold text-green-900">Service Completion Signature</p>
                              <p className="text-sm text-green-700">
                                Signed by: {selectedJobDetails.job.completion_signer_name}
                              </p>
                              <p className="text-xs text-green-600">
                                {new Date(selectedJobDetails.job.completion_signed_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                            ✓ Signed
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Show message if no documents available */}
                    {!selectedJobDetails.job.agreement_pdf &&
                     !selectedJobDetails.job.liability_release_pdf &&
                     !selectedJobDetails.job.silica_form_pdf &&
                     !selectedJobDetails.job.completion_signed_at && (
                      <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 text-center">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">No documents available for this job</p>
                        <p className="text-sm text-gray-500 mt-1">Documents are generated during job workflow completion</p>
                      </div>
                    )}

                    {/* Other Storage Documents */}
                    {selectedJobDetails.documents.length > 0 && (
                      <>
                        <div className="border-t-2 border-gray-200 my-4 pt-4">
                          <h3 className="text-sm font-bold text-gray-700 mb-2">Additional Storage Documents</h3>
                        </div>
                        {selectedJobDetails.documents.map((doc) => (
                          <div key={doc.id} className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <FileText className="w-5 h-5 text-purple-600 mt-0.5" />
                                <div>
                                  <p className="font-bold text-purple-900">{doc.document_name}</p>
                                  <p className="text-xs text-purple-600">
                                    Generated: {new Date(doc.generated_at).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition-colors"
                              >
                                View
                              </a>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Select a Job</h3>
                  <p className="text-gray-600">Click on a job from the list to view detailed analytics and documents</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
