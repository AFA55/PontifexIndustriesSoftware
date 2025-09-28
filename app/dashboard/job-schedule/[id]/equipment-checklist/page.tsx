'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';

// Job data with equipment
const jobDetails = {
  1: {
    id: '234893',
    title: 'WHITEHAWK (CAM) / PIEDMONT ATH.',
    customer: 'WHITEHAWK (CAM)',
    location: 'PIEDMONT ATHENS',
    address: '1199 PRINCE AVE, ATHENS, GA',
    time: '7:00 AM',
    equipment: [
      { id: 1, name: 'Core Drill', required: true, checked: false },
      { id: 2, name: 'Diamond Bits (1", 1-1/4")', required: true, checked: false },
      { id: 3, name: '250\' Water Hose', required: true, checked: false },
      { id: 4, name: 'Pump Can', required: true, checked: false },
      { id: 5, name: 'Small Shibuyah Drill', required: true, checked: false },
      { id: 6, name: '6\' Ladder', required: true, checked: false },
      { id: 7, name: 'Plastic Vac Slurry', required: true, checked: false },
      { id: 8, name: 'Safety Gear', required: true, checked: false },
      { id: 9, name: 'Lift Access Equipment', required: false, checked: false }
    ]
  },
  2: {
    id: '234894',
    title: 'ALAIR HOMES MARIETTA',
    customer: 'ALAIR HOMES',
    location: 'Residential Development',
    address: '286 Oak Avenue, Marietta, GA',
    time: '9:00 AM',
    equipment: [
      { id: 1, name: 'Wall Saw', required: true, checked: false },
      { id: 2, name: 'Diamond Blades', required: true, checked: false },
      { id: 3, name: 'Dust Collection System', required: true, checked: false },
      { id: 4, name: 'Safety Equipment', required: true, checked: false },
      { id: 5, name: 'Water Supply Hose', required: true, checked: false },
      { id: 6, name: 'Measuring Tools', required: false, checked: false }
    ]
  }
};

export default function EquipmentChecklist() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [allRequiredChecked, setAllRequiredChecked] = useState(false);
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const job = jobDetails[jobId as keyof typeof jobDetails];

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

    // Load equipment for this job
    if (job) {
      // Check localStorage for saved checklist state
      const savedState = localStorage.getItem(`equipment-checklist-${jobId}`);
      if (savedState) {
        setEquipment(JSON.parse(savedState));
      } else {
        setEquipment(job.equipment);
      }
    }

    setLoading(false);
  }, [router, jobId, job]);

  useEffect(() => {
    // Check if all required equipment is checked
    const allRequired = equipment.filter(item => item.required).every(item => item.checked);
    setAllRequiredChecked(allRequired);

    // Save state to localStorage
    if (equipment.length > 0) {
      localStorage.setItem(`equipment-checklist-${jobId}`, JSON.stringify(equipment));
    }
  }, [equipment, jobId]);

  const toggleEquipment = (equipmentId: number) => {
    setEquipment(prevEquipment =>
      prevEquipment.map(item =>
        item.id === equipmentId
          ? { ...item, checked: !item.checked }
          : item
      )
    );
  };

  const handleStartRoute = () => {
    if (allRequiredChecked) {
      // Mark job as in-route
      localStorage.setItem(`job-status-${jobId}`, 'in-route');
      alert('Starting route to job site...');
      router.push('/dashboard/job-schedule');
    }
  };

  const getDirectionsUrl = (address: string) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
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

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/job-schedule"
              className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-2xl transition-all duration-300 font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105"
            >
              <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Back</span>
            </Link>

            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Equipment Checklist
            </h1>

            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold">{user?.name?.charAt(0) || 'U'}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Job Info Card */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{job.title}</h2>
              <div className="space-y-1">
                <p className="text-gray-600 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {job.location}
                </p>
                <p className="text-blue-600 text-sm font-medium ml-7 hover:underline cursor-pointer"
                   onClick={() => window.open(getDirectionsUrl(job.address), '_blank')}>
                  📍 {job.address}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Start Time</div>
              <div className="text-2xl font-bold text-gray-900">{job.time}</div>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800">Checklist Progress</h3>
            <span className="text-sm font-medium text-gray-600">
              {equipment.filter(e => e.checked).length} of {equipment.length} items checked
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-300"
              style={{ width: `${(equipment.filter(e => e.checked).length / equipment.length) * 100}%` }}
            />
          </div>
          {!allRequiredChecked && (
            <p className="text-sm text-orange-600 mt-2 font-medium">
              ⚠️ All required equipment must be checked before starting route
            </p>
          )}
        </div>

        {/* Equipment Checklist */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Required Equipment
          </h3>

          <div className="space-y-3">
            {equipment.map((item) => (
              <label
                key={item.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                  item.checked
                    ? 'bg-green-50 border-green-300 shadow-sm'
                    : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleEquipment(item.id)}
                  className="w-6 h-6 text-green-500 rounded-lg border-gray-300 focus:ring-green-500 focus:ring-2"
                />
                <div className="flex-1">
                  <span className={`font-medium text-lg ${
                    item.checked ? 'text-green-700' : 'text-gray-800'
                  }`}>
                    {item.name}
                  </span>
                  {item.required && (
                    <span className="ml-2 text-xs font-bold text-red-500">REQUIRED</span>
                  )}
                </div>
                {item.checked && (
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleStartRoute}
            disabled={!allRequiredChecked}
            className={`flex-1 py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 ${
              allRequiredChecked
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:scale-105 cursor-pointer'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {allRequiredChecked ? 'Start In Route' : 'Complete Checklist First'}
          </button>

          <Link
            href={`/dashboard/job-schedule/${jobId}`}
            className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl font-bold text-lg transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Job Details
          </Link>
        </div>

        {/* Safety Reminder */}
        <div className="mt-6 bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-yellow-800 mb-1">Safety First</h4>
              <p className="text-sm text-yellow-700">
                Please ensure all required safety equipment is present and in good condition before proceeding to the job site.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}