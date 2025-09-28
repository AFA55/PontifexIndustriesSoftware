'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';

// Enhanced job data structure with real DSM-style information
const jobDetails = {
  1: {
    id: '234893',
    title: 'WHITEHAWK (CAM) / PIEDMONT ATH.',
    customer: 'WHITEHAWK (CAM)',
    jobType: 'CORE DRILLING',
    location: 'PIEDMONT ATHENS',
    address: '1199 PRINCE AVE, ATHENS, GA',
    status: 'scheduled',
    priority: 'high',
    arrivalTime: '7:00 AM',
    estimatedHours: '8.00',
    foreman: 'JAMES',
    foremaneOffice: '678-447-2756',
    salesman: 'CAMERON AMOS',
    technician: 'ANDRES GUERRERO-C',
    description: `CORE DRILLING ON COLUMNS THAT HAVE BEEN SCANNED.

TWO SEPARATE LOCATIONS

6 HOLES ON COLUMN

TAKE 1" AND 1-1/4" DIA BITS

DRILLING 20" DEEP

YOU WILL BE WORKING OUT OF A LIFT AND ON THE ROOF.

MAKE SURE YOU HAVE 250' OF WATER HOSE, PUMP CAN AND SMALL SHIBUYAH DRILL. CLEARANCE IS TIGHT ON SOME OF THEM. TAKE A 6' LADDER FOR THE ROOF CORES AS WELL

TAKE PLASTIC VAC SLURRY AND DO A GOOD CELEAN UP.

THEY HAVE POWER FOR YOU

PARK IN THE SMALL GRAVEL LOT ON THE BACK SIDE OF THE HOSPITAL`,
    requiredDocuments: ['B&D Silica Dust/Exposure Control Plan'],
    equipment: ['Core Drill', 'Diamond Bits', '250\' Water Hose', 'Pump Can', 'Small Shibuyah Drill', '6\' Ladder', 'Plastic Vac Slurry'],
    specialEquipment: ['Lift Access', 'Safety Gear for Roof Work'],
    jobSiteInfo: {
      jobSiteNumber: '',
      po: 'none',
      customerJobNumber: 'none'
    },
    onJobChecklist: [
      'Add Job Photos',
      'Time Card',
      'Work Items',
      'Customer Sign Off'
    ]
  },
  2: {
    id: '234894',
    title: 'ALAIR HOMES MARIETTA',
    customer: 'ALAIR HOMES',
    jobType: 'WALL CUTTING',
    location: 'Residential Development',
    address: '286 Oak Avenue, Marietta, GA',
    status: 'scheduled',
    priority: 'medium',
    arrivalTime: '9:00 AM',
    estimatedHours: '5.00',
    foreman: 'MIKE',
    foremaneOffice: '770-555-0123',
    salesman: 'SARAH JONES',
    technician: 'CARLOS MARTINEZ',
    description: 'Foundation wall cutting for basement renovation. Clean cuts required for electrical and plumbing access.',
    requiredDocuments: ['Safety Plan', 'Dust Control Plan'],
    equipment: ['Wall Saw', 'Diamond Blades', 'Dust Collection'],
    specialEquipment: [],
    jobSiteInfo: {
      jobSiteNumber: 'AH-2024-156',
      po: 'PO-45678',
      customerJobNumber: 'AH-BASEMENT-01'
    },
    onJobChecklist: [
      'Add Job Photos',
      'Time Card',
      'Work Items',
      'Customer Sign Off'
    ]
  }
};

export default function JobDetail() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobStatus, setJobStatus] = useState<'scheduled' | 'in-route' | 'in-progress' | 'completed'>('scheduled');
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

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Job Not Found</h1>
          <Link href="/dashboard/job-schedule" className="text-blue-600 hover:underline">
            Return to Job Schedule
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500 border-blue-600';
      case 'in-route': return 'bg-yellow-500 border-yellow-600';
      case 'in-progress': return 'bg-orange-500 border-orange-600';
      case 'completed': return 'bg-green-500 border-green-600';
      default: return 'bg-gray-500 border-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'in-route':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'in-progress':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'completed':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b-4 border-red-500 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/job-schedule"
              className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Link>

            <h1 className="text-xl font-bold text-gray-800 text-center flex-1 mx-4">
              Job Order #{job.id}
            </h1>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">{user?.name?.charAt(0) || 'U'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Modern Status Section */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Job Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'scheduled', label: 'Scheduled', icon: '📅' },
              { key: 'in-route', label: 'In Route', icon: '🚗' },
              { key: 'in-progress', label: 'In Progress', icon: '⚙️' },
              { key: 'completed', label: 'Complete', icon: '✅' }
            ].map((status) => (
              <button
                key={status.key}
                onClick={() => setJobStatus(status.key as any)}
                className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                  jobStatus === status.key
                    ? `${getStatusColor(status.key)} text-white shadow-lg scale-105`
                    : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-2xl">{status.icon}</span>
                  <span className="font-medium text-sm">{status.label}</span>
                </div>
                {jobStatus === status.key && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Job Details Card */}
        <div className="bg-white rounded-2xl shadow-xl border-l-8 border-red-500 overflow-hidden">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">{job.title}</h3>
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">{job.address}</span>
                </div>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                job.priority === 'high' ? 'bg-red-100 text-red-800' :
                job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                {job.priority.toUpperCase()} PRIORITY
              </span>
            </div>

            {/* Enhanced Info Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6" />
                    </svg>
                    Job Details
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Job Type:</span>
                      <span className="font-medium">{job.jobType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Customer:</span>
                      <span className="font-medium">{job.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Location:</span>
                      <span className="font-medium">{job.location}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Schedule & Team
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Arrival Time:</span>
                      <span className="font-medium">{job.arrivalTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Est. Hours:</span>
                      <span className="font-medium">{job.estimatedHours}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Technician:</span>
                      <span className="font-medium">{job.technician}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Contacts
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">Foreman:</span>
                      <p className="font-medium">{job.foreman}</p>
                      <a href={`tel:${job.foremaneOffice}`} className="text-blue-600 hover:underline">
                        📞 {job.foremaneOffice}
                      </a>
                    </div>
                    <div>
                      <span className="text-gray-600">Salesman:</span>
                      <p className="font-medium">{job.salesman}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Job Description */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Job Description
          </h3>
          <div className="bg-gray-50 rounded-xl p-4">
            <pre className="whitespace-pre-wrap text-gray-700 font-medium leading-relaxed">
              {job.description}
            </pre>
          </div>
        </div>

        {/* Equipment & Documents */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Required Equipment */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-green-100 p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Required Equipment
            </h3>
            <div className="space-y-3">
              {job.equipment.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-medium text-green-800">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-yellow-100 p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Required Documents
            </h3>
            <div className="space-y-3">
              {job.requiredDocuments.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                  <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <span className="font-medium text-yellow-800">{doc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modern Action Buttons */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-red-100 p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Job Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <button className="flex flex-col items-center gap-3 p-4 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-200 border-2 border-gray-300 hover:border-gray-400">
              <div className="w-12 h-12 bg-gray-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-medium text-gray-800 text-sm">Add Photos</span>
            </button>

            <button className="flex flex-col items-center gap-3 p-4 bg-blue-100 hover:bg-blue-200 rounded-xl transition-all duration-200 border-2 border-blue-300 hover:border-blue-400">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-medium text-blue-800 text-sm">Time Card</span>
            </button>

            <button className="flex flex-col items-center gap-3 p-4 bg-orange-100 hover:bg-orange-200 rounded-xl transition-all duration-200 border-2 border-orange-300 hover:border-orange-400">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <span className="font-medium text-orange-800 text-sm">Work Items</span>
            </button>

            <button className="flex flex-col items-center gap-3 p-4 bg-green-100 hover:bg-green-200 rounded-xl transition-all duration-200 border-2 border-green-300 hover:border-green-400">
              <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <span className="font-medium text-green-800 text-sm">Sign Off</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}