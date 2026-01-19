'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, MapPin, Calendar, ArrowRight, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  job_type: string;
  location: string;
  address: string;
  status: string;
  priority: string;
  scheduled_date: string;
  arrival_time: string;
  estimated_hours: number;
  foreman_name: string;
  foreman_phone: string;
  readable_status: string;
  drive_hours: number;
  production_hours: number;
}

export default function MyJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    fetchJobs();
  }, [activeTab]);

  const fetchJobs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const includeCompleted = activeTab === 'completed';
      const response = await fetch(`/api/job-orders?includeCompleted=${includeCompleted}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Filter based on tab
          let filteredJobs = result.data;
          if (activeTab === 'active') {
            filteredJobs = result.data.filter((job: JobOrder) => job.status !== 'completed');
          } else {
            filteredJobs = result.data.filter((job: JobOrder) => job.status === 'completed');
          }
          setJobs(filteredJobs);
        }
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
      case 'assigned':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'in_route':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'in_progress':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700';
      case 'high':
        return 'bg-orange-100 text-orange-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading your jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="p-3 bg-white rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                <span className="text-5xl">📋</span>
                My Job Orders
              </h1>
              <p className="text-gray-600 font-medium mt-1">View and manage your assigned work orders</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'active'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            Active Jobs
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'completed'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            Completed Jobs
          </button>
        </div>

        {/* Jobs Grid */}
        {jobs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              {activeTab === 'active' ? 'No active jobs' : 'No completed jobs'}
            </h3>
            <p className="text-gray-600">
              {activeTab === 'active'
                ? 'New job assignments will appear here'
                : 'Completed jobs will appear here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/my-jobs/${job.id}`}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-gray-500">#{job.job_number}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityColor(job.priority)}`}>
                        {job.priority.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">{job.title}</h3>
                    <p className="text-sm text-gray-600">{job.customer_name}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${getStatusColor(job.status)}`}>
                    {job.readable_status}
                  </span>
                </div>

                {/* Job Type Badge */}
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold">
                    {job.job_type}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-700">{job.location}</p>
                      <p className="text-xs text-gray-500">{job.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">
                      {formatDate(job.scheduled_date)}
                      {job.arrival_time && <span className="text-gray-500"> at {job.arrival_time}</span>}
                    </span>
                  </div>

                  {job.estimated_hours && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        Estimated: {job.estimated_hours} hours
                      </span>
                    </div>
                  )}

                  {job.foreman_name && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        Foreman: {job.foreman_name}
                        {job.foreman_phone && <span className="text-gray-500"> • {job.foreman_phone}</span>}
                      </span>
                    </div>
                  )}
                </div>

                {/* Time Tracking (for completed jobs) */}
                {job.status === 'completed' && (job.drive_hours || job.production_hours) && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {job.drive_hours > 0 && (
                        <div>
                          <p className="text-gray-500 text-xs">Drive Time</p>
                          <p className="font-bold text-gray-800">{job.drive_hours.toFixed(2)} hrs</p>
                        </div>
                      )}
                      {job.production_hours > 0 && (
                        <div>
                          <p className="text-gray-500 text-xs">Production Time</p>
                          <p className="font-bold text-gray-800">{job.production_hours.toFixed(2)} hrs</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Button */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {job.status === 'completed' ? 'View Details' : 'Open Job'}
                    </span>
                    <ArrowRight className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
