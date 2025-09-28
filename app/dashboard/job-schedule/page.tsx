'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, type User } from '@/lib/auth';

// Enhanced job data with equipment checklist
const sampleJobs = [
  {
    id: 1,
    title: "ACTION ELECTRIC COMPANY INC",
    location: "Downtown Construction Site",
    address: "123 Main St, City, State",
    time: "8:00 AM",
    endTime: "4:00 PM",
    duration: "8 hours",
    status: "scheduled",
    priority: "high",
    jobType: "CORE DRILLING",
    description: "Concrete cutting for electrical conduit installation",
    equipment: [
      { id: 1, name: "Core Drill", checked: false },
      { id: 2, name: "Diamond Bits (1\", 1-1/4\")", checked: false },
      { id: 3, name: "250' Water Hose", checked: false },
      { id: 4, name: "Vacuum System", checked: false },
      { id: 5, name: "Safety Gear", checked: false }
    ],
    technician: "ANDRES G.",
    distance: "12.5 miles",
    foreman: "JAMES",
    foremanPhone: "678-447-2756",
    salesman: "CAMERON AMOS"
  },
  {
    id: 2,
    title: "ALAIR HOMES MARIETTA",
    location: "Residential Development",
    address: "286 Oak Avenue, Marietta, GA",
    time: "9:00 AM",
    endTime: "2:00 PM",
    duration: "5 hours",
    status: "scheduled",
    priority: "medium",
    jobType: "WALL CUTTING",
    description: "Foundation wall cutting for basement renovation",
    equipment: [
      { id: 1, name: "Wall Saw", checked: false },
      { id: 2, name: "Diamond Blades", checked: false },
      { id: 3, name: "Dust Collection System", checked: false },
      { id: 4, name: "Safety Equipment", checked: false }
    ],
    technician: "CARLOS M.",
    distance: "8.2 miles",
    foreman: "MIKE",
    foremanPhone: "770-555-0123",
    salesman: "SARAH JONES"
  }
];

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentDateOffset, setCurrentDateOffset] = useState(0);
  const [jobs] = useState(sampleJobs);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role === 'admin') {
      router.push('/admin');
      return;
    }
    setUser(currentUser);
    setLoading(false);
  }, [router]);

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
                <span className="text-white font-bold">{user?.name?.charAt(0) || 'U'}</span>
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
          {currentDateOffset === 0 ? (
            // Show jobs for today
            jobs.map((job, index) => (
              <div
                key={job.id}
                onClick={() => router.push(`/dashboard/job-schedule/${job.id}`)}
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
                              <span className="font-medium">{job.time} - {job.endTime}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span className="font-medium">{job.technician}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">{job.duration}</div>
                        <div className="text-xs text-gray-500 font-medium">{job.distance}</div>
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
                        <p className="text-gray-800 font-medium text-sm">{job.jobType}</p>
                        <p className="text-gray-600 text-xs mt-1">{job.description}</p>
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
                          <p className="text-gray-900 font-bold text-base">{job.foreman}</p>
                          <p className="text-gray-600 text-xs">Salesman: {job.salesman}</p>
                        </div>
                        <a
                          href={`tel:${job.foremanPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-medium transition-all duration-300 shadow-lg hover:scale-105"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="hidden sm:inline">{job.foremanPhone}</span>
                          <span className="sm:hidden">Call</span>
                        </a>
                      </div>
                    </div>



                    {/* Modern Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          alert('Starting route to job site...');
                        }}
                        className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 px-4 rounded-2xl font-medium transition-all duration-300 shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start In Route
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
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
                          router.push(`/dashboard/job-schedule/${job.id}`);
                        }}
                        className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 flex items-center gap-2 font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // No jobs for other days
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