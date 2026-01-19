'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface CompletedJob {
  id: string;
  customer: string;
  job_location: string;
  completion_signed_at: string;
  completion_signer_name: string;
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;
}

interface JobDocument {
  id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  generated_at: string;
  file_size_bytes: number;
}

export default function CompletedJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<CompletedJob | null>(null);
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

    // Check if user is admin
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
      const { data, error } = await supabase
        .from('job_orders')
        .select('*')
        .not('completion_signed_at', 'is', null)
        .order('completion_signed_at', { ascending: false });

      if (error) throw error;

      setJobs(data || []);
    } catch (error) {
      console.error('Error loading completed jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (jobId: string) => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('pdf_documents')
        .select('*')
        .eq('job_id', jobId)
        .eq('is_latest', true)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleJobClick = async (job: CompletedJob) => {
    setSelectedJob(job);
    await loadDocuments(job.id);
  };

  const filteredJobs = jobs.filter(job =>
    job.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.job_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.completion_signer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'service_completion_agreement':
        return '📋';
      case 'silica_form':
        return '🛡️';
      case 'jha_form':
        return '⚠️';
      default:
        return '📄';
    }
  };

  const getDocumentLabel = (type: string) => {
    switch (type) {
      case 'service_completion_agreement':
        return 'Service Completion Agreement';
      case 'silica_form':
        return 'Silica Dust Control Plan';
      case 'jha_form':
        return 'Job Hazard Analysis';
      default:
        return type;
    }
  };

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
                <p className="text-sm text-gray-600">View all signed jobs and documents</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              {jobs.length} Completed
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Jobs List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by customer, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => handleJobClick(job)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedJob?.id === job.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-bold text-gray-900 mb-1">{job.customer}</div>
                    <div className="text-sm text-gray-600 mb-2">{job.job_location}</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {new Date(job.completion_signed_at).toLocaleDateString()}
                      </span>
                      {job.customer_overall_rating && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                          ⭐ {job.customer_overall_rating}/10
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

          {/* Job Details & Documents */}
          <div className="lg:col-span-2">
            {selectedJob ? (
              <div className="space-y-6">
                {/* Job Info Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Job Details</h2>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Job ID</label>
                      <p className="text-gray-900">{selectedJob.id}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Customer</label>
                      <p className="text-gray-900">{selectedJob.customer}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Location</label>
                      <p className="text-gray-900">{selectedJob.job_location}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Signed By</label>
                      <p className="text-gray-900">{selectedJob.completion_signer_name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Completion Date</label>
                      <p className="text-gray-900">
                        {new Date(selectedJob.completion_signed_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Customer Ratings */}
                  {(selectedJob.customer_overall_rating || selectedJob.customer_cleanliness_rating || selectedJob.customer_communication_rating) && (
                    <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl p-4 border-2 border-green-200">
                      <h3 className="font-bold text-gray-900 mb-3">Customer Feedback</h3>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        {selectedJob.customer_overall_rating && (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{selectedJob.customer_overall_rating}/10</div>
                            <div className="text-xs text-gray-600">Overall</div>
                          </div>
                        )}
                        {selectedJob.customer_cleanliness_rating && (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{selectedJob.customer_cleanliness_rating}/10</div>
                            <div className="text-xs text-gray-600">Cleanliness</div>
                          </div>
                        )}
                        {selectedJob.customer_communication_rating && (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">{selectedJob.customer_communication_rating}/10</div>
                            <div className="text-xs text-gray-600">Communication</div>
                          </div>
                        )}
                      </div>
                      {selectedJob.customer_feedback_comments && (
                        <div className="text-sm text-gray-700 bg-white p-3 rounded-lg">
                          <strong>Comments:</strong> {selectedJob.customer_feedback_comments}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Documents Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Documents</h2>

                  {loadingDocs ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600">Loading documents...</p>
                    </div>
                  ) : documents.length > 0 ? (
                    <div className="space-y-3">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="text-3xl">{getDocumentIcon(doc.document_type)}</div>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">{getDocumentLabel(doc.document_type)}</div>
                              <div className="text-xs text-gray-500">
                                {new Date(doc.generated_at).toLocaleString()} • {formatFileSize(doc.file_size_bytes)}
                              </div>
                            </div>
                          </div>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View PDF
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No documents found for this job
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
                <svg className="w-24 h-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 text-lg">Select a job to view details and documents</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
