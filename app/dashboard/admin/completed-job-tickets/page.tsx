'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FileText, Star, Clock, User, MapPin, CheckCircle } from 'lucide-react';

interface CompletedJob {
  id: string;
  job_number: string;
  customer: string;
  customer_name: string;
  job_location: string;
  location: string;
  address: string;
  description: string;
  assigned_to: string;
  scheduled_date: string;
  completion_signed_at: string;
  completion_signer_name: string;
  contact_not_on_site: boolean;
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;
}

export default function CompletedJobTicketsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    checkAuth();
    loadCompletedJobs();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Check admin role from localStorage to avoid RLS recursion
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

  const loadCompletedJobs = async () => {
    try {
      console.log('Loading completed job tickets...');
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

      console.log('Loaded completed jobs:', data?.length || 0);
      setJobs(data || []);
    } catch (error: any) {
      // Only log if there's an actual error message
      if (error?.message) {
        console.error('Failed to load completed jobs:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(job => {
    const query = searchQuery.toLowerCase();
    return (
      job.customer?.toLowerCase().includes(query) ||
      job.customer_name?.toLowerCase().includes(query) ||
      job.job_location?.toLowerCase().includes(query) ||
      job.location?.toLowerCase().includes(query) ||
      job.job_number?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
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
                <h1 className="text-xl font-bold text-gray-800">Completed Job Tickets</h1>
                <p className="text-sm text-gray-600">View all completed jobs with signatures</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              {jobs.length} Completed
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Search Bar */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 mb-6">
          <input
            type="text"
            placeholder="Search by customer, location, job number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <span className="text-3xl font-bold text-gray-900">{jobs.length}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total Completed</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <Star className="w-8 h-8 text-yellow-500" />
              <span className="text-3xl font-bold text-gray-900">
                {jobs.filter(j => j.customer_overall_rating).length > 0
                  ? (jobs.reduce((sum, j) => sum + (j.customer_overall_rating || 0), 0) /
                     jobs.filter(j => j.customer_overall_rating).length).toFixed(1)
                  : '0.0'}
              </span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Average Rating</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <User className="w-8 h-8 text-orange-600" />
              <span className="text-3xl font-bold text-gray-900">
                {jobs.filter(j => j.contact_not_on_site).length}
              </span>
            </div>
            <p className="text-sm text-gray-600 font-medium">No Contact On Site</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <Star className="w-8 h-8 text-green-600 fill-green-600" />
              <span className="text-3xl font-bold text-gray-900">
                {jobs.filter(j => j.customer_overall_rating && j.customer_overall_rating >= 8).length}
              </span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Highly Rated (8+)</p>
          </div>
        </div>

        {/* Jobs List */}
        {filteredJobs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {searchQuery ? 'No jobs found' : 'No Completed Jobs Yet'}
            </h3>
            <p className="text-gray-600">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Completed jobs with customer signatures will appear here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredJobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/admin/completed-job-tickets/${job.id}`}
                className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 hover:border-green-500 p-6 transition-all hover:shadow-xl group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-green-600 transition-colors">
                        {job.customer || job.customer_name}
                      </h3>
                      {job.contact_not_on_site && (
                        <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                          No Contact
                        </span>
                      )}
                      {job.customer_overall_rating && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current" />
                          {job.customer_overall_rating}/10
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs font-semibold mb-1">Job Number</p>
                        <p className="text-gray-900 font-medium">{job.job_number}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-semibold mb-1">Location</p>
                        <p className="text-gray-900 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.job_location || job.location || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-semibold mb-1">Completed Date</p>
                        <p className="text-gray-900 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(job.completion_signed_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-semibold mb-1">Signed By</p>
                        <p className="text-gray-900 font-medium">
                          {job.contact_not_on_site ? 'No Signature' : job.completion_signer_name || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {job.customer_feedback_comments && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Feedback:</span> {job.customer_feedback_comments}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="ml-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <CheckCircle className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end text-green-600 font-semibold text-sm group-hover:translate-x-2 transition-transform">
                  <span>View Details</span>
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
