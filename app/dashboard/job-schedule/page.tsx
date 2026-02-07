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
  const router = useRouter();

  useEffect(() => {
    fetchJobs();
  }, [currentDateOffset]);

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
          // Filter jobs for the selected date and exclude completed jobs
          const filteredJobs = result.data.filter((job: JobOrder) => {
            if (!job.scheduled_date) return false;
            const jobDate = new Date(job.scheduled_date).toISOString().split('T')[0];
            // Exclude completed jobs from operator schedule
            return jobDate === dateStr && job.status !== 'completed';
          });
          setJobs(filteredJobs);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-2xl transition-all duration-300 font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105"
            >
              <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Job Schedule
            </h1>

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
        {/* Date Navigation */}
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

        {/* Simplified Jobs List - Only Job Type and Location */}
        <div className="space-y-4">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => router.push(`/dashboard/job-schedule/${job.id}/preview`)}
                className="block group cursor-pointer"
              >
                <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl shadow-lg hover:shadow-xl border border-gray-200/50 overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:-translate-y-0.5">
                  <div className="p-6">
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      {/* Content */}
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
                          {job.job_type}
                        </h3>
                        <p className="text-gray-600 font-medium flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {job.location}
                        </p>
                      </div>
                      {/* Arrow */}
                      <svg className="w-6 h-6 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
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
