'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { verifyShopLocation } from '@/lib/geolocation';
import { supabase } from '@/lib/supabase';

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
      'Work Performed',
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
      'Work Performed',
      'Customer Sign Off'
    ]
  }
};

export default function JobDetail() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobStatus, setJobStatus] = useState<'scheduled' | 'in-route' | 'in-progress' | 'completed'>('scheduled');
  const [documentStatus, setDocumentStatus] = useState<{[key: string]: boolean}>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showEquipmentCheckModal, setShowEquipmentCheckModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'scheduled' | 'in-route' | 'in-progress' | 'completed' | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<any>(null);
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const job = jobDetails[jobId as unknown as keyof typeof jobDetails];

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

    // Check document completion status
    const checkDocumentStatus = () => {
      const silicaCompleted = localStorage.getItem(`silica-plan-${params.id}`) === 'completed';
      const workPerformedCompleted = localStorage.getItem(`work-performed-${params.id}`) !== null;
      setDocumentStatus({
        silica: silicaCompleted,
        workPerformed: workPerformedCompleted
      });
    };

    checkDocumentStatus();
    fetchWorkflowStatus();

    // Listen for storage changes
    window.addEventListener('storage', checkDocumentStatus);
    return () => window.removeEventListener('storage', checkDocumentStatus);
  }, [router, params.id]);

  // Fetch workflow status to determine button state
  const fetchWorkflowStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/workflow?jobId=${job.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setWorkflowStatus(result.data);
        }
      }
    } catch (error) {
      console.log('Error fetching workflow status:', error);
    }
  };

  // Send SMS to foreman
  const sendForemanSMS = async (message: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          to: job.foremaneOffice,
          message: message,
        }),
      });
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  };

  // Update job status and operator status
  const updateJobStatus = async (newStatus: 'scheduled' | 'in-route' | 'in-progress' | 'completed') => {
    // Check if equipment checklist is needed for "in-route" status
    if (newStatus === 'in-route' && jobStatus === 'scheduled') {
      setPendingStatus(newStatus);
      setShowEquipmentCheckModal(true);
      return;
    }

    setStatusLoading(true);
    setStatusMessage(null);

    try {
      // Map job status to operator status
      let operatorStatus: string;
      switch (newStatus) {
        case 'in-route':
          operatorStatus = 'en_route';
          break;
        case 'in-progress':
          operatorStatus = 'in_progress';
          break;
        case 'completed':
          operatorStatus = 'job_completed';
          break;
        default:
          operatorStatus = 'clocked_in';
      }

      // Get location
      const verification = await verifyShopLocation();

      // Get session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setStatusMessage({
          type: 'error',
          text: 'Session expired. Please log in again.',
        });
        setStatusLoading(false);
        return;
      }

      // Update operator status in database
      const response = await fetch('/api/operator/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: operatorStatus,
          latitude: verification.location?.latitude,
          longitude: verification.location?.longitude,
          accuracy: verification.location?.accuracy,
          jobId: job.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to update status',
        });
        setStatusLoading(false);
        return;
      }

      // Update local job status
      setJobStatus(newStatus);
      setStatusMessage({
        type: 'success',
        text: `Status updated to: ${newStatus.replace('-', ' ').toUpperCase()}`,
      });

      // Send SMS to foreman when going "in-route"
      if (newStatus === 'in-route') {
        const locationStr = verification.location
          ? `Current location: ${verification.location.latitude.toFixed(6)}, ${verification.location.longitude.toFixed(6)}`
          : 'Location unavailable';

        const smsMessage = `This is ${user?.name} with B&D Concrete Cutting. Just wanted to let you know we are in route to ${job.address}. ${locationStr}`;
        await sendForemanSMS(smsMessage);
      }

      // Hide message after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      console.error('Error updating status:', error);
      setStatusMessage({
        type: 'error',
        text: error.message || 'An error occurred while updating status',
      });
    } finally {
      setStatusLoading(false);
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
        {/* Status Message */}
        {statusMessage && (
          <div className={`${
            statusMessage.type === 'success'
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          } border-2 rounded-2xl p-6 shadow-lg animate-fade-in`}>
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 ${
                statusMessage.type === 'success' ? 'bg-green-200' : 'bg-red-200'
              } rounded-full flex items-center justify-center`}>
                {statusMessage.type === 'success' ? (
                  <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <p className={`${
                statusMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
              } font-bold text-lg`}>
                {statusMessage.text}
              </p>
            </div>
          </div>
        )}

        {/* Modern Status Section */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Job Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'scheduled', label: 'Scheduled', icon: '📅' },
              { key: 'in-route', label: 'In Route', icon: '🚗' },
              { key: 'in-progress', label: 'In Progress', icon: '⚙️' },
              { key: 'completed', label: 'Complete', icon: '✅' }
            ].map((status) => {
              // Check if required documents are completed for "in-progress" status
              const requiresDocuments = status.key === 'in-progress';
              const hasRequiredDocs = job.requiredDocuments.length > 0;
              const allDocsCompleted = hasRequiredDocs ? documentStatus.silica : true;
              const isDisabled = requiresDocuments && hasRequiredDocs && !allDocsCompleted;

              return (
                <button
                  key={status.key}
                  onClick={() => {
                    if (isDisabled) {
                      alert('Please complete all required documents before marking job as "In Progress"');
                      return;
                    }
                    updateJobStatus(status.key as any);
                  }}
                className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                  isDisabled
                    ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-60'
                    : statusLoading
                    ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-wait opacity-70'
                    : jobStatus === status.key
                    ? `${getStatusColor(status.key)} text-white shadow-lg scale-105`
                    : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                }`}
                disabled={isDisabled || statusLoading}
              >
                <div className="flex flex-col items-center gap-2">
                  {statusLoading ? (
                    <>
                      <div className="animate-spin w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full"></div>
                      <span className="font-medium text-xs">Updating...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">{status.icon}</span>
                      <span className="font-medium text-sm">{status.label}</span>
                      {isDisabled && (
                        <span className="text-xs text-red-500 font-medium">
                          📋 Docs Required
                        </span>
                      )}
                    </>
                  )}
                </div>
                {jobStatus === status.key && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
              );
            })}
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
                      <span className="text-gray-700 font-semibold">Job Type:</span>
                      <span className="font-bold text-gray-900">{job.jobType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 font-semibold">Customer:</span>
                      <span className="font-bold text-gray-900">{job.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 font-semibold">Location:</span>
                      <span className="font-bold text-gray-900">{job.location}</span>
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
                      <span className="text-gray-700 font-semibold">Arrival Time:</span>
                      <span className="font-bold text-gray-900">{job.arrivalTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 font-semibold">Est. Hours:</span>
                      <span className="font-bold text-gray-900">{job.estimatedHours}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 font-semibold">Technician:</span>
                      <span className="font-bold text-gray-900">{job.technician}</span>
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
                      <span className="text-gray-700 font-semibold">Foreman:</span>
                      <p className="font-bold text-gray-900">{job.foreman}</p>
                      <a href={`tel:${job.foremaneOffice}`} className="text-blue-600 hover:underline font-semibold">
                        📞 {job.foremaneOffice}
                      </a>
                    </div>
                    <div>
                      <span className="text-gray-700 font-semibold">Salesman:</span>
                      <p className="font-bold text-gray-900">{job.salesman}</p>
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
              {job.requiredDocuments.map((doc, idx) => {
                // Check if this is the Silica Dust Control Plan
                const isSilicaPlan = doc.includes('Silica Dust') || doc.includes('B&D Silica');
                const isCompleted = isSilicaPlan && documentStatus.silica;

                if (isSilicaPlan) {
                  if (isCompleted) {
                    // Show completed state in green
                    return (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <span className="font-semibold text-green-800">{doc}</span>
                            <p className="text-sm text-green-600">✅ COMPLETED</p>
                          </div>
                        </div>
                        <Link
                          href={`/dashboard/job-schedule/${params.id}/silica-exposure`}
                          className="px-4 py-2 bg-green-200 text-green-800 rounded-lg hover:bg-green-300 font-medium text-sm transition-colors"
                        >
                          View Document
                        </Link>
                      </div>
                    );
                  } else {
                    // Show incomplete state - needs to be filled out
                    return (
                      <Link
                        key={idx}
                        href={`/dashboard/job-schedule/${params.id}/silica-exposure`}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-200 hover:border-blue-300 rounded-xl transition-all duration-200 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500 group-hover:bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div>
                            <span className="font-semibold text-blue-800 group-hover:text-blue-900">{doc}</span>
                            <p className="text-sm text-blue-600 group-hover:text-blue-700">⚠️ OSHA Compliance Required</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-blue-600 group-hover:text-blue-700">
                          <span className="text-sm font-medium">Fill Out Form</span>
                          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </div>
                      </Link>
                    );
                  }
                } else {
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                      <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                      <span className="font-medium text-yellow-800">{doc}</span>
                    </div>
                  );
                }
              })}
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

            <Link
              href={`/dashboard/job-schedule/${params.id}/work-performed`}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl transition-all duration-200 border-2 relative ${
                documentStatus.workPerformed
                  ? 'bg-green-100 hover:bg-green-200 border-green-300 hover:border-green-400'
                  : 'bg-orange-100 hover:bg-orange-200 border-orange-300 hover:border-orange-400'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                documentStatus.workPerformed ? 'bg-green-600' : 'bg-orange-600'
              }`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <span className={`font-medium text-sm ${
                documentStatus.workPerformed ? 'text-green-800' : 'text-orange-800'
              }`}>
                Work Performed
                {documentStatus.workPerformed && <span className="block text-xs text-green-600">✅ Completed</span>}
              </span>
              {documentStatus.workPerformed && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </Link>

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

      {/* Equipment Checklist Confirmation Modal */}
      {showEquipmentCheckModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Equipment Checklist Confirmation</h2>
            <p className="text-gray-700 mb-6">
              Before heading to the job site, please confirm that you have reviewed the equipment checklist and have all necessary equipment:
            </p>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
              <h3 className="font-bold text-blue-900 mb-2">Required Equipment:</h3>
              <ul className="space-y-1">
                {job?.equipment.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-blue-800">
                    <span className="text-blue-600">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-gray-800 font-semibold mb-6">
              Have you verified that you have all the required equipment?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEquipmentCheckModal(false);
                  if (pendingStatus) {
                    updateJobStatus(pendingStatus);
                  }
                }}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors"
              >
                ✅ Yes, I'm Ready
              </button>
              <button
                onClick={() => {
                  setShowEquipmentCheckModal(false);
                  setPendingStatus(null);
                }}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
              >
                ❌ No, I Need to Check
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}