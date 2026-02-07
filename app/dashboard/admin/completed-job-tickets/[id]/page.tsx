'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  FileText, Star, Clock, DollarSign, User, MapPin, Trash2,
  CheckCircle, Calendar, TrendingUp, AlertCircle, Download, Eye, X
} from 'lucide-react';

interface JobData {
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
  completion_signed_at: string;
  completion_signer_name: string;
  contact_not_on_site: boolean;
  liability_release_signed_by: string;
  liability_release_signed_at: string;
  liability_release_pdf_url: string;
  work_order_pdf_url: string;
  silica_plan_pdf_url: string;
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;
  job_difficulty_rating: number | null;
  job_access_rating: number | null;
  job_difficulty_notes: string | null;
  job_access_notes: string | null;
  feedback_submitted_at: string | null;
  feedback_submitted_by: string | null;
  operator_notes: string | null;
  admin_operator_rating: number | null;
  admin_feedback: string | null;
}

export default function CompletedJobDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [job, setJob] = useState<JobData | null>(null);
  const [operatorName, setOperatorName] = useState('Unknown');
  const [workPerformed, setWorkPerformed] = useState<any[]>([]);
  const [standbyLogs, setStandbyLogs] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState('');
  const [currentPdfTitle, setCurrentPdfTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    checkAuth();
    loadJobDetails();
  }, [jobId]);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const userStr = localStorage.getItem('pontifex-user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role !== 'admin') {
          router.push('/dashboard');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const loadJobDetails = async () => {
    try {
      const { data: jobData, error: jobError } = await supabase
        .from('job_orders')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;
      setJob(jobData);

      if (jobData.assigned_to) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', jobData.assigned_to)
            .single();

          if (profile) {
            setOperatorName(profile.full_name);
          }
        } catch (err) {
          console.log('Could not load operator name');
        }
      }

      const { data: standbyData } = await supabase
        .from('standby_logs')
        .select('*')
        .eq('job_order_id', jobId)
        .eq('status', 'completed');

      setStandbyLogs(standbyData || []);

      const savedWork = localStorage.getItem(`work-performed-${jobId}`);
      if (savedWork) {
        const parsed = JSON.parse(savedWork);
        setWorkPerformed(parsed.items || []);
      }

      const { data: docsData } = await supabase
        .from('pdf_documents')
        .select('*')
        .eq('job_id', jobId)
        .eq('is_latest', true)
        .order('generated_at', { ascending: false });

      setDocuments(docsData || []);

      const { data: dailyLogsData } = await supabase
        .from('daily_job_logs')
        .select('*')
        .eq('job_order_id', jobId)
        .order('log_date', { ascending: true });

      setDailyLogs(dailyLogsData || []);

    } catch (error) {
      console.error('Error loading job details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!job) return;

    setDeleting(true);
    try {
      // Delete from job_orders table
      const { error } = await supabase
        .from('job_orders')
        .delete()
        .eq('id', jobId);

      if (error) throw error;

      // Clear localStorage
      localStorage.removeItem(`work-performed-${jobId}`);

      // Redirect back to completed jobs list
      router.push('/dashboard/admin/completed-job-tickets');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
      setDeleting(false);
    }
  };

  const openPdfViewer = (url: string, title: string) => {
    setCurrentPdfUrl(url);
    setCurrentPdfTitle(title);
    setPdfViewerOpen(true);
  };

  const calculateTotalTime = () => {
    if (!job) return 0;
    const startTime = job.arrival_time || job.scheduled_date;
    if (!startTime || !job.completion_signed_at) return 0;

    const start = new Date(startTime);
    const end = new Date(job.completion_signed_at);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return 0;

    return diffMs / (1000 * 60 * 60);
  };

  const calculateStandbyHours = () => {
    return standbyLogs.reduce((sum, log) => sum + (log.duration_hours || 0), 0);
  };

  const calculateLaborCost = () => {
    const totalHours = calculateTotalTime();
    return totalHours * 75;
  };

  const calculateStandbyCost = () => {
    const standbyHours = calculateStandbyHours();
    return standbyHours * 189;
  };

  const renderStars = (rating: number | null, maxRating: number = 5) => {
    if (!rating) return null;
    const stars = [];
    const normalizedRating = maxRating === 10 ? rating / 2 : rating;

    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`w-5 h-5 ${i < Math.floor(normalizedRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      );
    }
    return <div className="flex gap-1">{stars}</div>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h2>
          <Link href="/dashboard/admin/completed-job-tickets" className="text-blue-600 hover:underline">
            Back to Completed Jobs
          </Link>
        </div>
      </div>
    );
  }

  const totalTime = calculateTotalTime();
  const standbyHours = calculateStandbyHours();
  const laborCost = calculateLaborCost();
  const standbyCost = calculateStandbyCost();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin/completed-job-tickets"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{job.customer || job.customer_name}</h1>
                <p className="text-sm text-gray-600">{job.job_number}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Completed
              </span>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Job
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Delete Completed Job?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete job <strong>{job.job_number}</strong>? This action cannot be undone and will remove all associated data.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {pdfViewerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">{currentPdfTitle}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={currentPdfUrl}
                  download
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <button
                  onClick={() => setPdfViewerOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={currentPdfUrl}
                className="w-full h-full"
                title={currentPdfTitle}
              />
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Time & Cost Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-semibold text-gray-600">Total Time</span>
            </div>
            <p className="text-3xl font-bold text-blue-600">{totalTime.toFixed(1)}h</p>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-yellow-600" />
              <span className="text-sm font-semibold text-gray-600">Standby Time</span>
            </div>
            <p className="text-3xl font-bold text-yellow-600">{standbyHours.toFixed(1)}h</p>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              <span className="text-sm font-semibold text-gray-600">Labor Cost</span>
            </div>
            <p className="text-3xl font-bold text-green-600">${laborCost.toFixed(0)}</p>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-purple-600" />
              <span className="text-sm font-semibold text-gray-600">Standby Cost</span>
            </div>
            <p className="text-3xl font-bold text-purple-600">${standbyCost.toFixed(0)}</p>
          </div>
        </div>

        {/* Job Overview */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Job Overview
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Customer</label>
              <p className="text-gray-900 font-semibold">{job.customer || job.customer_name}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Job Number</label>
              <p className="text-gray-900 font-semibold">{job.job_number}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Location</label>
              <p className="text-gray-900 font-semibold flex items-center gap-1">
                <MapPin className="w-4 h-4 text-gray-500" />
                {job.job_location || job.location}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Operator</label>
              <p className="text-gray-900 font-semibold">{operatorName}</p>
            </div>
          </div>
        </div>

        {/* Work Performed & Original Scope */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Work Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-3">Original Scope</h3>
              <p className="text-gray-700 whitespace-pre-wrap text-sm">
                {job.description || job.scope_of_work || 'No description provided'}
              </p>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h3 className="font-bold text-gray-900 mb-3">Work Performed</h3>
              {workPerformed.length > 0 ? (
                <ul className="space-y-2">
                  {workPerformed.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>
                        {item.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 italic text-sm">No detailed work log available</p>
              )}
            </div>
          </div>
        </div>

        {/* Ratings Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Operator Job Survey */}
          {(job.job_difficulty_rating || job.job_access_rating) && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-orange-500" />
                  Operator Job Survey
                </h2>
                {job.feedback_submitted_at && (
                  <span className="text-xs text-gray-500">
                    {new Date(job.feedback_submitted_at).toLocaleString()}
                  </span>
                )}
              </div>

              {job.feedback_submitted_by && (
                <div className="mb-4 text-sm text-gray-600">
                  <strong>Submitted by:</strong> {job.feedback_submitted_by}
                </div>
              )}

              <div className="space-y-4">
                {job.job_difficulty_rating && (
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-700 uppercase">Job Difficulty</span>
                      <span className="text-lg font-bold text-orange-600">{job.job_difficulty_rating}/5</span>
                    </div>
                    {renderStars(job.job_difficulty_rating, 5)}
                    {job.job_difficulty_notes && (
                      <div className="mt-3 pt-3 border-t border-orange-300">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Notes:</p>
                        <p className="text-sm text-gray-700">{job.job_difficulty_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {job.job_access_rating && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-700 uppercase">Site Access</span>
                      <span className="text-lg font-bold text-blue-600">{job.job_access_rating}/5</span>
                    </div>
                    {renderStars(job.job_access_rating, 5)}
                    {job.job_access_notes && (
                      <div className="mt-3 pt-3 border-t border-blue-300">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Notes:</p>
                        <p className="text-sm text-gray-700">{job.job_access_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {job.operator_notes && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Additional Operator Notes:</p>
                    <p className="text-sm text-gray-700">{job.operator_notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Ratings */}
          {job.admin_operator_rating && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Admin Operator Rating
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600">Performance Rating</span>
                    <span className="text-lg font-bold text-blue-600">{job.admin_operator_rating}/5</span>
                  </div>
                  {renderStars(job.admin_operator_rating, 5)}
                </div>

                {job.admin_feedback && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Admin Feedback:</p>
                    <p className="text-sm text-gray-700">{job.admin_feedback}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customer Performance Survey */}
          {(job.customer_overall_rating || job.customer_cleanliness_rating || job.customer_communication_rating) && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 md:col-span-2">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                Customer Performance Survey
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Survey completed by: <strong>{job.completion_signer_name || 'Customer'}</strong>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                {job.customer_overall_rating && (
                  <div className="text-center bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-4xl font-bold text-green-600 mb-2">
                      {job.customer_overall_rating}/10
                    </div>
                    <div className="text-sm text-gray-600 font-semibold">Overall Rating</div>
                  </div>
                )}
                {job.customer_cleanliness_rating && (
                  <div className="text-center bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-4xl font-bold text-blue-600 mb-2">
                      {job.customer_cleanliness_rating}/10
                    </div>
                    <div className="text-sm text-gray-600 font-semibold">Cleanliness</div>
                  </div>
                )}
                {job.customer_communication_rating && (
                  <div className="text-center bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="text-4xl font-bold text-purple-600 mb-2">
                      {job.customer_communication_rating}/10
                    </div>
                    <div className="text-sm text-gray-600 font-semibold">Communication</div>
                  </div>
                )}
              </div>

              {job.customer_feedback_comments && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Customer Comments:</p>
                  <p className="text-sm text-gray-700">{job.customer_feedback_comments}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legal Documents & PDFs */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-600" />
            Legal Documents & PDFs
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Liability Release PDF */}
            {job.liability_release_pdf_url && (
              <div className="bg-red-50 rounded-lg p-4 border-2 border-red-200">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="w-5 h-5 text-red-600" />
                  <h3 className="font-bold text-red-900">Liability Release</h3>
                </div>
                <p className="text-xs text-red-700 mb-3">
                  Signed by: {job.liability_release_signed_by}<br />
                  {job.liability_release_signed_at && new Date(job.liability_release_signed_at).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openPdfViewer(job.liability_release_pdf_url, 'Liability Release')}
                    className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                  <a
                    href={job.liability_release_pdf_url}
                    download
                    className="px-3 py-2 bg-white hover:bg-gray-50 text-red-600 border border-red-600 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}

            {/* Work Order Agreement PDF */}
            {job.work_order_pdf_url && (
              <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="w-5 h-5 text-green-600" />
                  <h3 className="font-bold text-green-900">Work Order Agreement</h3>
                </div>
                <p className="text-xs text-green-700 mb-3">
                  Signed by: {job.completion_signer_name}<br />
                  {job.completion_signed_at && new Date(job.completion_signed_at).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openPdfViewer(job.work_order_pdf_url, 'Work Order Agreement')}
                    className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                  <a
                    href={job.work_order_pdf_url}
                    download
                    className="px-3 py-2 bg-white hover:bg-gray-50 text-green-600 border border-green-600 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}

            {/* Silica Exposure Plan PDF */}
            {job.silica_plan_pdf_url && (
              <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-blue-900">Silica Exposure Plan</h3>
                </div>
                <p className="text-xs text-blue-700 mb-3">
                  OSHA compliance document
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openPdfViewer(job.silica_plan_pdf_url, 'Silica Exposure Control Plan')}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                  <a
                    href={job.silica_plan_pdf_url}
                    download
                    className="px-3 py-2 bg-white hover:bg-gray-50 text-blue-600 border border-blue-600 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}

            {/* Other Documents */}
            {documents.map((doc) => (
              <div key={doc.id} className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <h3 className="font-bold text-purple-900">{doc.document_name}</h3>
                </div>
                <p className="text-xs text-purple-700 mb-3">
                  Generated: {new Date(doc.generated_at).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openPdfViewer(doc.file_url, doc.document_name)}
                    className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                  <a
                    href={doc.file_url}
                    download
                    className="px-3 py-2 bg-white hover:bg-gray-50 text-purple-600 border border-purple-600 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {!job.liability_release_pdf_url && !job.work_order_pdf_url && !job.silica_plan_pdf_url && documents.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No PDF documents available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
