'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { Calendar, Phone, MessageSquare, MapPin, User, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Job {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  scheduled_date: string;
  arrival_time: string | null;
  status: 'scheduled' | 'assigned' | 'in_route' | 'in_progress' | 'completed' | 'cancelled';
  assigned_to: string | null;
  operator_name: string | null;
  foreman_name: string | null;
  foreman_phone: string | null;
  priority: string;
}

export default function ActiveJobBoard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active'>('active');
  const [upcomingJobs, setUpcomingJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    loadJobs();
  }, []);

  const checkAuth = () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.push('/dashboard');
    }
  };

  const loadJobs = async () => {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Fetch all non-completed, non-cancelled jobs
      const { data: jobs, error } = await supabase
        .from('job_orders')
        .select('*')
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true });

      if (error) {
        console.error('Error loading jobs:', error);
        setLoading(false);
        return;
      }

      // Separate into upcoming (future) and active (today or in progress)
      const upcoming: Job[] = [];
      const active: Job[] = [];

      jobs?.forEach((job) => {
        const jobDate = new Date(job.scheduled_date);
        jobDate.setHours(0, 0, 0, 0);

        // Active jobs: scheduled for today or earlier, or currently in route/progress
        if (
          jobDate <= today ||
          job.status === 'in_route' ||
          job.status === 'in_progress'
        ) {
          active.push(job);
        } else {
          // Upcoming jobs: scheduled for future dates
          upcoming.push(job);
        }
      });

      setUpcomingJobs(upcoming);
      setActiveJobs(active);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (phone: string | null) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleMessage = (phone: string | null) => {
    if (phone) {
      window.location.href = `sms:${phone}`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'assigned':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'in_route':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'in_progress':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled';
      case 'assigned':
        return 'Assigned';
      case 'in_route':
        return 'In Route';
      case 'in_progress':
        return 'In Progress';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading jobs...</p>
        </div>
      </div>
    );
  }

  const jobsToDisplay = activeTab === 'active' ? activeJobs : upcomingJobs;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 border-b border-blue-700">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-6 h-6 text-white" />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                  <Calendar className="w-8 h-8" />
                  Active Job Board
                </h1>
                <p className="text-blue-100 mt-1">
                  Manage current and upcoming projects
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-xl rounded-xl border border-white/30 px-6 py-3">
                <div className="text-3xl font-bold text-white">{activeJobs.length}</div>
                <div className="text-xs text-white/90 font-medium">Active Jobs</div>
              </div>
              <div className="bg-white/20 backdrop-blur-xl rounded-xl border border-white/30 px-6 py-3">
                <div className="text-3xl font-bold text-white">{upcomingJobs.length}</div>
                <div className="text-xs text-white/90 font-medium">Upcoming</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-6 py-4 font-semibold border-b-2 transition-colors ${
                activeTab === 'active'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Active Jobs ({activeJobs.length})
            </button>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-6 py-4 font-semibold border-b-2 transition-colors ${
                activeTab === 'upcoming'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Upcoming Jobs ({upcomingJobs.length})
            </button>
          </div>
        </div>
      </div>

      {/* Job Cards */}
      <div className="container mx-auto px-6 py-8">
        {jobsToDisplay.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              No {activeTab} jobs
            </h3>
            <p className="text-gray-500">
              {activeTab === 'active'
                ? 'All jobs are completed or scheduled for future dates'
                : 'No upcoming jobs scheduled'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobsToDisplay.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all"
              >
                {/* Card Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{job.title}</h3>
                      <p className="text-sm text-blue-600 font-semibold">{job.job_number}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                        job.status
                      )}`}
                    >
                      {getStatusText(job.status)}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">{job.customer_name}</p>
                </div>

                {/* Card Body */}
                <div className="p-6 space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{job.location}</p>
                      <p className="text-xs text-gray-500">{job.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {new Date(job.scheduled_date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                      {job.arrival_time && (
                        <p className="text-xs text-gray-500">
                          Arrival: {job.arrival_time}
                        </p>
                      )}
                    </div>
                  </div>

                  {job.operator_name && (
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Operator:</span> {job.operator_name}
                      </p>
                    </div>
                  )}

                  {job.priority && (
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Priority:</span>{' '}
                        <span className="capitalize">{job.priority}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer - Action Buttons */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleCall(job.foreman_phone)}
                      disabled={!job.foreman_phone}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all ${
                        job.foreman_phone
                          ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Phone className="w-4 h-4" />
                      Call
                    </button>
                    <button
                      onClick={() => handleMessage(job.foreman_phone)}
                      disabled={!job.foreman_phone}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all ${
                        job.foreman_phone
                          ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-md'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Message
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
