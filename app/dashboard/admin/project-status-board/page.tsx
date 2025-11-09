'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// Mock data for active jobs - will be replaced with actual data
const mockJobs = [
  {
    id: '1',
    jobNumber: 'JOB-2024-001',
    clientName: 'ABC Construction',
    projectName: 'Downtown Plaza Core Drilling',
    location: '123 Main St, Downtown',
    address: '123 Main St, Downtown',
    status: 'on-track',
    priority: 'high',
    progress: 75,
    startDate: '2024-11-08',
    endDate: '2024-11-08',
    startTime: '7:00 AM',
    estimatedEnd: '3:00 PM',
    estimatedHours: '8',
    jobTypes: ['CORE DRILLING'],
    contactOnSite: 'James',
    contactPhone: '678-447-2756',
    crew: ['John Smith', 'Mike Johnson'],
    operator: 'John Smith',
    salesman: 'CAMERON AMOS',
    equipment: [
      { name: 'Core Drill #3', type: 'Core Drill', status: 'In Use', hours: 6.2, operator: 'John Smith', condition: 'Good' },
      { name: 'Truck #5', type: 'Vehicle', status: 'In Use', hours: 6.0, operator: 'Mike Johnson', condition: 'Excellent' },
      { name: 'Diamond Bit Set', type: 'Accessory', status: 'In Use', hours: 6.2, operator: 'John Smith', condition: 'Good' }
    ],
    requiredDocuments: ['JSA Form (Job Safety Analysis)', 'Silica Dust/Exposure Control Plan'],
    phase: 'Core Drilling',
    lastUpdate: '10 mins ago',
    notes: 'Making good progress on level 2',
    timeline: {
      totalHours: 8,
      elapsed: 6,
      phases: [
        { name: 'Setup', status: 'completed', duration: 1 },
        { name: 'Core Drilling', status: 'in-progress', duration: 5 },
        { name: 'Cleanup', status: 'pending', duration: 2 }
      ]
    }
  },
  {
    id: '2',
    jobNumber: 'JOB-2024-002',
    clientName: 'XYZ Contractors',
    projectName: 'Parking Structure Sawing',
    location: '456 Oak Ave',
    status: 'needs-attention',
    progress: 45,
    startTime: '8:00 AM',
    estimatedEnd: '5:00 PM',
    crew: ['Bob Williams', 'Tom Davis'],
    operator: 'Bob Williams',
    equipment: [
      { name: 'Slab Saw #1', type: 'Slab Saw', status: 'Maintenance', hours: 4.5, operator: 'Bob Williams', condition: 'Needs Attention' },
      { name: 'Truck #2', type: 'Vehicle', status: 'In Use', hours: 5.0, operator: 'Tom Davis', condition: 'Good' },
      { name: 'Diamond Blade 14"', type: 'Accessory', status: 'In Use', hours: 4.5, operator: 'Bob Williams', condition: 'Fair' }
    ],
    phase: 'Sawing',
    priority: 'medium',
    lastUpdate: '25 mins ago',
    notes: 'Equipment issue resolved, back on track',
    timeline: {
      totalHours: 9,
      elapsed: 5,
      phases: [
        { name: 'Setup', status: 'completed', duration: 2 },
        { name: 'Marking', status: 'completed', duration: 1 },
        { name: 'Sawing', status: 'in-progress', duration: 4 },
        { name: 'Cleanup', status: 'pending', duration: 2 }
      ]
    }
  },
  {
    id: '3',
    jobNumber: 'JOB-2024-003',
    clientName: 'Metro Development',
    projectName: 'Bridge Deck Repair',
    location: '789 Bridge Rd',
    status: 'behind',
    progress: 20,
    startTime: '6:00 AM',
    estimatedEnd: '4:00 PM',
    crew: ['Steve Miller', 'Dave Brown', 'Jim Wilson'],
    operator: 'Steve Miller',
    equipment: [
      { name: 'Wall Saw #2', type: 'Wall Saw', status: 'In Use', hours: 2.8, operator: 'Steve Miller', condition: 'Good' },
      { name: 'Core Drill #1', type: 'Core Drill', status: 'Standby', hours: 0, operator: 'Dave Brown', condition: 'Excellent' },
      { name: 'Truck #3', type: 'Vehicle', status: 'In Use', hours: 3.0, operator: 'Jim Wilson', condition: 'Good' },
      { name: 'Wire Saw Kit', type: 'Accessory', status: 'Standby', hours: 0, operator: 'Steve Miller', condition: 'Excellent' }
    ],
    phase: 'Preparation',
    priority: 'urgent',
    lastUpdate: '5 mins ago',
    notes: 'Weather delay - crew arrived late',
    timeline: {
      totalHours: 10,
      elapsed: 3,
      phases: [
        { name: 'Site Prep', status: 'in-progress', duration: 3 },
        { name: 'Demolition', status: 'pending', duration: 4 },
        { name: 'Installation', status: 'pending', duration: 2 },
        { name: 'Cleanup', status: 'pending', duration: 1 }
      ]
    }
  },
  {
    id: '4',
    jobNumber: 'JOB-2024-004',
    clientName: 'Industrial Corp',
    projectName: 'Factory Floor Cutting',
    location: '321 Industrial Blvd',
    status: 'on-track',
    progress: 90,
    startTime: '7:30 AM',
    estimatedEnd: '2:00 PM',
    crew: ['Jack Anderson', 'Bill Thomas'],
    operator: 'Jack Anderson',
    equipment: [
      { name: 'Slab Saw #3', type: 'Slab Saw', status: 'In Use', hours: 5.2, operator: 'Jack Anderson', condition: 'Excellent' },
      { name: 'Truck #6', type: 'Vehicle', status: 'In Use', hours: 5.5, operator: 'Bill Thomas', condition: 'Good' },
      { name: 'Diamond Blade 18"', type: 'Accessory', status: 'In Use', hours: 5.2, operator: 'Jack Anderson', condition: 'Good' }
    ],
    phase: 'Final Cleanup',
    priority: 'low',
    lastUpdate: '1 hour ago',
    notes: 'Ahead of schedule, finishing up',
    timeline: {
      totalHours: 6.5,
      elapsed: 5.5,
      phases: [
        { name: 'Setup', status: 'completed', duration: 1 },
        { name: 'Cutting', status: 'completed', duration: 4 },
        { name: 'Cleanup', status: 'in-progress', duration: 1.5 }
      ]
    }
  }
];

// Mock data for upcoming jobs
const mockUpcomingJobs = [
  {
    id: '5',
    jobNumber: 'JOB-2024-005',
    clientName: 'Riverside Properties',
    projectName: 'Commercial Building Foundation',
    location: '555 River St, Downtown',
    scheduledDate: '2024-11-09',
    scheduledTime: '7:00 AM',
    estimatedDuration: '10 hours',
    jobTypes: ['CORE DRILLING', 'SAWING'],
    crew: ['John Smith', 'Mike Johnson'],
    operator: 'John Smith',
    salesman: 'CAMERON AMOS',
    priority: 'high',
    requiredDocuments: ['JSA Form (Job Safety Analysis)', 'Silica Dust/Exposure Control Plan'],
    notes: 'Large commercial project - requires early start',
    equipment: [
      { name: 'Core Drill #2', type: 'Core Drill' },
      { name: 'Truck #7', type: 'Vehicle' },
      { name: 'Diamond Bit Set', type: 'Accessory' }
    ]
  },
  {
    id: '6',
    jobNumber: 'JOB-2024-006',
    clientName: 'Tech Campus LLC',
    projectName: 'Data Center Wall Penetrations',
    location: '888 Tech Parkway',
    scheduledDate: '2024-11-09',
    scheduledTime: '9:00 AM',
    estimatedDuration: '6 hours',
    jobTypes: ['CORE DRILLING'],
    crew: ['Bob Williams'],
    operator: 'Bob Williams',
    salesman: 'DAVID CHEN',
    priority: 'medium',
    requiredDocuments: ['JSA Form (Job Safety Analysis)', 'Silica Dust/Exposure Control Plan', 'Security Clearance'],
    notes: 'Requires security clearance - confirmed for tomorrow',
    equipment: [
      { name: 'Core Drill #4', type: 'Core Drill' },
      { name: 'Truck #4', type: 'Vehicle' }
    ]
  },
  {
    id: '7',
    jobNumber: 'JOB-2024-007',
    clientName: 'City Infrastructure',
    projectName: 'Subway Station Expansion',
    location: 'Metro Line 3 - Station 12',
    scheduledDate: '2024-11-10',
    scheduledTime: '6:00 AM',
    estimatedDuration: '12 hours',
    jobTypes: ['WALL SAWING', 'CORE DRILLING'],
    crew: ['Steve Miller', 'Dave Brown', 'Jim Wilson', 'Jack Anderson'],
    operator: 'Steve Miller',
    salesman: 'SARAH MARTINEZ',
    priority: 'urgent',
    requiredDocuments: ['JSA Form (Job Safety Analysis)', 'Silica Dust/Exposure Control Plan', 'Confined Space Entry Permit'],
    notes: 'Night shift starting Sunday - all hands on deck',
    equipment: [
      { name: 'Wall Saw #1', type: 'Wall Saw' },
      { name: 'Core Drill #5', type: 'Core Drill' },
      { name: 'Truck #8', type: 'Vehicle' },
      { name: 'Truck #9', type: 'Vehicle' }
    ]
  }
];

type StatusFilter = 'all' | 'on-track' | 'needs-attention' | 'behind' | 'upcoming';
type ViewMode = 'grid' | 'list' | 'timeline';

export default function ProjectStatusBoard() {
  const [jobs, setJobs] = useState(mockJobs);
  const [upcomingJobs, setUpcomingJobs] = useState(mockUpcomingJobs);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedJob, setSelectedJob] = useState<typeof mockJobs[0] | null>(null);
  const [selectedUpcomingJob, setSelectedUpcomingJob] = useState<typeof mockUpcomingJobs[0] | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showUpcomingJobModal, setShowUpcomingJobModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // New modal states
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [showTimeTrackingModal, setShowTimeTrackingModal] = useState(false);
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [communicationType, setCommunicationType] = useState<'call' | 'message'>('message');

  // Update form state
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateNotes, setUpdateNotes] = useState('');

  // Photo upload state
  const [jobPhotos, setJobPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [notifications, setNotifications] = useState<Array<{id: string, message: string, type: string, jobId: string}>>([]);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Filter jobs based on status and search
  // Filter active jobs or show upcoming jobs based on filter
  const filteredJobs = statusFilter === 'upcoming'
    ? upcomingJobs.filter(job => {
        const matchesSearch = searchQuery === '' ||
          job.jobNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.projectName.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
      })
    : jobs.filter(job => {
        const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
        const matchesSearch = searchQuery === '' ||
          job.jobNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.projectName.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
      });

  // Get counts for status badges
  const statusCounts = {
    all: jobs.length,
    'on-track': jobs.filter(j => j.status === 'on-track').length,
    'needs-attention': jobs.filter(j => j.status === 'needs-attention').length,
    'behind': jobs.filter(j => j.status === 'behind').length
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track':
        return 'bg-green-500';
      case 'needs-attention':
        return 'bg-yellow-500';
      case 'behind':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'on-track':
        return 'bg-green-50 border-green-200';
      case 'needs-attention':
        return 'bg-yellow-50 border-yellow-200';
      case 'behind':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return '🔴';
      case 'high':
        return '🟡';
      case 'medium':
        return '🔵';
      case 'low':
        return '⚪';
      default:
        return '⚪';
    }
  };

  const handleJobClick = (job: typeof mockJobs[0]) => {
    setSelectedJob(job);
    setShowDetailModal(true);
  };

  // Check for urgent jobs and create notifications
  useEffect(() => {
    const urgentJobs = jobs.filter(job =>
      (job.status === 'behind' || job.priority === 'urgent') &&
      !notifications.find(n => n.jobId === job.id)
    );

    const newNotifications = urgentJobs.map((job, index) => ({
      id: `notif-${job.id}-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      message: `${job.projectName} needs immediate attention!`,
      type: job.status === 'behind' ? 'behind' : 'urgent',
      jobId: job.id
    }));

    if (newNotifications.length > 0) {
      setNotifications(prev => [...prev, ...newNotifications]);
    }
  }, [jobs, notifications]);

  const handleUpdateJob = () => {
    if (!selectedJob) return;

    const updatedJobs = jobs.map(job => {
      if (job.id === selectedJob.id) {
        return {
          ...job,
          status: updateStatus || job.status,
          progress: updateProgress || job.progress,
          notes: updateNotes || job.notes,
          lastUpdate: 'Just now'
        };
      }
      return job;
    });

    setJobs(updatedJobs);
    setShowUpdateModal(false);
    setUpdateStatus('');
    setUpdateProgress(0);
    setUpdateNotes('');

    // Show success message
    alert('Job updated successfully!');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos = Array.from(files).map(file => URL.createObjectURL(file));
      setJobPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const handleCallOperator = (job: typeof mockJobs[0]) => {
    setSelectedJob(job);
    setCommunicationType('call');
    setShowCommunicationModal(true);
  };

  const handleSendMessage = (job: typeof mockJobs[0]) => {
    setSelectedJob(job);
    setCommunicationType('message');
    setShowCommunicationModal(true);
  };

  const handleExportJob = (job: typeof mockJobs[0]) => {
    const jobData = JSON.stringify(job, null, 2);
    const blob = new Blob([jobData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.jobNumber}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintJob = (job: typeof mockJobs[0]) => {
    window.print();
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Global input text color fix */}
      <style jsx global>{`
        input[type="text"],
        input[type="tel"],
        input[type="date"],
        input[type="time"],
        input[type="number"],
        textarea,
        select,
        option {
          color: #111827 !important;
        }
        input::placeholder,
        textarea::placeholder {
          color: #9ca3af !important;
        }
      `}</style>

      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <div className="relative">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard/admin"
                className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                  <span className="text-5xl">📊</span>
                  Project Board
                </h1>
                <p className="text-gray-600 font-medium mt-1">
                  Current and upcoming jobs • {currentTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })} at {currentTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-4">
              <div className="text-center bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 px-6 py-3 shadow-sm">
                <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">{jobs.length}</div>
                <div className="text-xs text-gray-600 font-medium">Active Jobs</div>
              </div>
              <div className="text-center bg-white/70 backdrop-blur-xl rounded-xl border border-green-200 px-6 py-3 shadow-sm">
                <div className="text-3xl font-bold text-green-600">
                  {statusCounts['on-track']}
                </div>
                <div className="text-xs text-gray-600 font-medium">On Track</div>
              </div>
              <div className="text-center bg-white/70 backdrop-blur-xl rounded-xl border border-yellow-200 px-6 py-3 shadow-sm">
                <div className="text-3xl font-bold text-yellow-600">
                  {statusCounts['needs-attention']}
                </div>
                <div className="text-xs text-gray-600 font-medium">Need Attention</div>
              </div>
              <div className="text-center bg-white/70 backdrop-blur-xl rounded-xl border border-red-200 px-6 py-3 shadow-sm">
                <div className="text-3xl font-bold text-red-600">
                  {statusCounts['behind']}
                </div>
                <div className="text-xs text-gray-600 font-medium">Behind</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications Bar */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-red-600 to-orange-600 border-b border-red-700">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="text-white font-bold">{notifications.length} Urgent Alert{notifications.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto">
                {notifications.map(notif => (
                  <div key={notif.id} className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
                    <span className="text-white text-sm font-medium whitespace-nowrap">{notif.message}</span>
                    <button
                      onClick={() => dismissNotification(notif.id)}
                      className="text-white hover:text-white/90"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-6 py-6 relative">
        {/* Quick Actions Bar */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 mb-6 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                onClick={() => setShowAnalyticsModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl hover:from-orange-700 hover:to-red-700 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-bold flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Analytics
              </button>
              <Link
                href="/dashboard/admin/dispatch-scheduling"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-bold flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Dispatch Schedule
              </Link>
            </div>
            <div className="flex gap-2">
              <button className="p-3 bg-white hover:bg-gray-50 rounded-xl transition-all shadow-sm hover:shadow-md hover:scale-105" title="Refresh">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button className="p-3 bg-white hover:bg-gray-50 rounded-xl transition-all shadow-sm hover:shadow-md hover:scale-105" title="Print All">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 mb-6 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs, clients, or locations..."
                  className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  statusFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                All ({statusCounts.all})
              </button>
              <button
                onClick={() => setStatusFilter('on-track')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  statusFilter === 'on-track'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  On Track ({statusCounts['on-track']})
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('needs-attention')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  statusFilter === 'needs-attention'
                    ? 'bg-yellow-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                  Needs Attention ({statusCounts['needs-attention']})
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('behind')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  statusFilter === 'behind'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                  Behind ({statusCounts['behind']})
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('upcoming')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  statusFilter === 'upcoming'
                    ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                  Upcoming ({upcomingJobs.length})
                </span>
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white shadow-md text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Grid View"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-white shadow-md text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="List View"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'timeline'
                    ? 'bg-white shadow-md text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Timeline View"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Jobs Display */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => handleJobClick(job)}
                className={`bg-white rounded-xl border-2 border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-blue-300`}
              >
                {/* Status Bar */}
                <div className={`h-2 ${getStatusColor(job.status)}`}></div>

                {/* Job Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-500">{job.jobNumber}</span>
                        <span>{getPriorityIcon(job.priority)}</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg">{job.projectName}</h3>
                      <p className="text-sm text-gray-600">{job.clientName}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      job.status === 'on-track' ? 'bg-green-100 text-green-700' :
                      job.status === 'needs-attention' ? 'bg-yellow-100 text-yellow-700' :
                      job.status === 'behind' ? 'bg-red-100 text-red-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {job.status === 'on-track' ? 'On Track' :
                       job.status === 'needs-attention' ? 'Needs Attention' :
                       job.status === 'behind' ? 'Behind' : 'Scheduled'}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {job.location}
                  </div>

                  {/* Progress Bar - Only for active jobs */}
                  {job.progress !== undefined && (
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Progress</span>
                        <span className="text-xs font-bold text-gray-800">{job.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getStatusColor(job.status)}`}
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Timeline Phases - Only show for active jobs */}
                  {job.timeline?.phases && (
                    <div className="mb-4 space-y-2">
                      <div className="text-xs font-medium text-gray-600 mb-2">Timeline</div>
                      <div className="flex gap-1">
                        {job.timeline.phases.map((phase, index) => (
                          <div
                            key={index}
                            className={`flex-1 h-6 rounded flex items-center justify-center text-xs font-medium ${
                              phase.status === 'completed' ? 'bg-green-100 text-green-700' :
                              phase.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-400'
                            }`}
                            title={`${phase.name} (${phase.duration}h)`}
                          >
                            {phase.name.substring(0, 3)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show scheduled info for upcoming jobs */}
                  {job.scheduledDate && (
                    <div className="mb-4 bg-purple-50 rounded-lg p-3 border-2 border-purple-200">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs font-bold text-purple-900">Scheduled</span>
                      </div>
                      <div className="text-sm font-medium text-purple-800">
                        {job.scheduledDate} at {job.scheduledTime}
                      </div>
                      <div className="text-xs text-purple-600 mt-1">
                        Est. Duration: {job.estimatedDuration}
                      </div>
                    </div>
                  )}

                  {/* Job Info Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-xs text-gray-500">
                        {job.scheduledTime ? 'Scheduled' : 'Time'}
                      </div>
                      <div className="text-sm font-medium text-gray-800">
                        {job.scheduledTime || `${job.startTime} - ${job.estimatedEnd}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">
                        {job.phase ? 'Current Phase' : 'Duration'}
                      </div>
                      <div className="text-sm font-medium text-gray-800">
                        {job.phase || job.estimatedDuration}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Operator</div>
                      <div className="text-sm font-medium text-gray-800">{job.operator}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Crew Size</div>
                      <div className="text-sm font-medium text-gray-800">{job.crew.length} workers</div>
                    </div>
                  </div>

                  {/* Notes */}
                  {job.notes && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="text-xs text-gray-500 mb-1">Latest Update</div>
                      <div className="text-sm text-gray-700">{job.notes}</div>
                      <div className="text-xs text-gray-400 mt-1">{job.lastUpdate}</div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleJobClick(job)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => {
                        setSelectedJob(job);
                        setShowAnalyticsModal(true);
                      }}
                      className="px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-sm"
                      title="View Analytics"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleSendMessage(job)}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors border border-gray-200"
                      title="Send Message"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleCallOperator(job)}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors border border-gray-200"
                      title="Call Operator"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Details</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crew</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleJobClick(job)}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(job.status)}`}></div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{job.projectName}</div>
                          <div className="text-sm text-gray-500">{job.clientName} • {job.jobNumber}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{job.location}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{job.progress}%</div>
                            <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-full rounded-full ${getStatusColor(job.status)}`}
                                style={{ width: `${job.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{job.operator}</div>
                        <div className="text-sm text-gray-500">{job.crew.length} workers</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {job.startTime} - {job.estimatedEnd}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJobClick(job);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJob(job);
                              setShowAnalyticsModal(true);
                            }}
                            className="text-orange-600 hover:text-orange-900"
                          >
                            Analytics
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Timeline View */}
        {viewMode === 'timeline' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="space-y-6">
              {filteredJobs.map((job) => (
                <div key={job.id} className="relative">
                  <div className="flex items-start gap-4">
                    {/* Status Indicator */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      job.status === 'on-track' ? 'bg-green-100' :
                      job.status === 'needs-attention' ? 'bg-yellow-100' :
                      job.status === 'behind' ? 'bg-red-100' :
                      'bg-purple-100'
                    }`}>
                      <div className={`w-4 h-4 rounded-full ${
                        job.status ? getStatusColor(job.status) : 'bg-purple-500'
                      }`}></div>
                    </div>

                    {/* Timeline Content */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-800 text-lg">{job.projectName}</h3>
                          <p className="text-sm text-gray-600">{job.clientName} • {job.location}</p>
                        </div>
                        <div className="text-sm text-gray-500">
                          {job.scheduledDate ? `Scheduled: ${job.scheduledDate}` : `${job.startTime} - ${job.estimatedEnd}`}
                        </div>
                      </div>

                      {/* Progress Timeline - Only for active jobs */}
                      {job.timeline?.phases ? (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="flex gap-2 mb-3">
                            {job.timeline.phases.map((phase, index) => (
                              <div
                                key={index}
                                className="flex-1"
                              >
                                <div className="text-xs font-medium text-gray-600 mb-1">{phase.name}</div>
                                <div className={`h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                                  phase.status === 'completed' ? 'bg-green-100 text-green-700' :
                                  phase.status === 'in-progress' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                  'bg-gray-200 text-gray-400'
                                }`}>
                                  {phase.duration}h
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between items-center">
                            <div className="text-sm">
                              <span className="text-gray-500">Operator:</span>
                              <span className="font-medium text-gray-800 ml-1">{job.operator}</span>
                            </div>
                            <div className="text-sm">
                              <span className="text-gray-500">Progress:</span>
                              <span className="font-bold text-gray-800 ml-1">{job.progress}%</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Show scheduled info for upcoming jobs */
                        <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-sm font-bold text-purple-900">Scheduled</span>
                            </div>
                            <span className="text-xs text-purple-600 font-medium">Upcoming</span>
                          </div>
                          <div className="text-sm font-bold text-purple-800 mb-1">
                            {job.scheduledDate} at {job.scheduledTime}
                          </div>
                          <div className="text-xs text-purple-600">
                            Est. Duration: {job.estimatedDuration}
                          </div>
                          <div className="mt-2 text-sm">
                            <span className="text-gray-500">Operator:</span>
                            <span className="font-medium text-gray-800 ml-1">{job.operator}</span>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {job.notes && (
                        <div className="mt-3 text-sm text-gray-600 italic">
                          "{job.notes}" - {job.lastUpdate}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleJobClick(job)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedJob(job);
                          setShowAnalyticsModal(true);
                        }}
                        className="p-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all"
                        title="View Analytics"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Job Detail Modal */}
      {showDetailModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{selectedJob.projectName}</h2>
                  <p className="text-gray-600">{selectedJob.jobNumber} • {selectedJob.clientName}</p>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
                <button
                  onClick={() => handleCallOperator(selectedJob)}
                  className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                >
                  <svg className="w-6 h-6 text-blue-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <div className="text-xs font-medium text-blue-900">Call Operator</div>
                </button>
                <button
                  onClick={() => handleSendMessage(selectedJob)}
                  className="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
                >
                  <svg className="w-6 h-6 text-green-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="text-xs font-medium text-green-900">Send Message</div>
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowUpdateModal(true);
                  }}
                  className="p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors border border-orange-200"
                >
                  <svg className="w-6 h-6 text-orange-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <div className="text-xs font-medium text-orange-900">Update Job</div>
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowDocumentsModal(true);
                  }}
                  className="p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200"
                >
                  <svg className="w-6 h-6 text-purple-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="text-xs font-medium text-purple-900">Documents</div>
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowPhotosModal(true);
                  }}
                  className="p-4 bg-pink-50 rounded-lg hover:bg-pink-100 transition-colors border border-pink-200"
                >
                  <svg className="w-6 h-6 text-pink-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="text-xs font-medium text-pink-900">Photos</div>
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowTimeTrackingModal(true);
                  }}
                  className="p-4 bg-cyan-50 rounded-lg hover:bg-cyan-100 transition-colors border border-cyan-200"
                >
                  <svg className="w-6 h-6 text-cyan-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs font-medium text-cyan-900">Time Clock</div>
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowHistoryModal(true);
                  }}
                  className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200"
                >
                  <svg className="w-6 h-6 text-indigo-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs font-medium text-indigo-900">History</div>
                </button>
                <button
                  onClick={() => setShowEquipmentModal(true)}
                  className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <svg className="w-6 h-6 text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <div className="text-xs font-medium text-gray-700">Equipment</div>
                </button>
              </div>

              {/* Detailed Information */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Job Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Location:</span>
                      <span className="font-medium text-gray-800">{selectedJob.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        selectedJob.status === 'on-track' ? 'bg-green-100 text-green-700' :
                        selectedJob.status === 'needs-attention' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {selectedJob.status === 'on-track' ? 'On Track' :
                         selectedJob.status === 'needs-attention' ? 'Needs Attention' : 'Behind'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Priority:</span>
                      <span className="font-medium capitalize text-gray-800">{selectedJob.priority}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Progress:</span>
                      <span className="font-bold text-gray-800">{selectedJob.progress}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Crew Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Operator:</span>
                      <span className="font-medium text-gray-800">{selectedJob.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Crew Members:</span>
                      <span className="font-medium text-gray-800">{selectedJob.crew.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Equipment:</span>
                      <span className="font-medium text-gray-800">{selectedJob.equipment.length} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Phase:</span>
                      <span className="font-medium text-gray-800">{selectedJob.phase}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline Details */}
              <div className="mt-6">
                <h3 className="font-semibold text-gray-800 mb-3">Project Timeline</h3>
                <div className="space-y-3">
                  {selectedJob.timeline.phases.map((phase, index) => (
                    <div key={index} className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        phase.status === 'completed' ? 'bg-green-100' :
                        phase.status === 'in-progress' ? 'bg-blue-100' :
                        'bg-gray-100'
                      }`}>
                        {phase.status === 'completed' ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : phase.status === 'in-progress' ? (
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                        ) : (
                          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{phase.name}</div>
                        <div className="text-sm text-gray-500">Duration: {phase.duration} hours</div>
                      </div>
                      <div className={`text-sm font-medium ${
                        phase.status === 'completed' ? 'text-green-600' :
                        phase.status === 'in-progress' ? 'text-blue-600' :
                        'text-gray-400'
                      }`}>
                        {phase.status === 'completed' ? 'Completed' :
                         phase.status === 'in-progress' ? 'In Progress' : 'Pending'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Modal */}
      {showEquipmentModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                    <span className="text-3xl">🛠️</span>
                    Equipment Assignment
                  </h2>
                  <p className="text-gray-600 mt-1 font-medium">{selectedJob.projectName} • {selectedJob.jobNumber}</p>
                </div>
                <button
                  onClick={() => setShowEquipmentModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Equipment Summary */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 text-center border-2 border-blue-200 shadow-sm">
                  <div className="text-3xl font-bold text-blue-600">{selectedJob.equipment.length}</div>
                  <div className="text-sm text-blue-800 font-medium mt-1">Total Equipment</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-5 text-center border-2 border-green-200 shadow-sm">
                  <div className="text-3xl font-bold text-green-600">
                    {selectedJob.equipment.filter(eq => eq.status === 'In Use').length}
                  </div>
                  <div className="text-sm text-green-800 font-medium mt-1">In Use</div>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-5 text-center border-2 border-yellow-200 shadow-sm">
                  <div className="text-3xl font-bold text-yellow-600">
                    {selectedJob.equipment.filter(eq => eq.status === 'Standby').length}
                  </div>
                  <div className="text-sm text-yellow-800 font-medium mt-1">Standby</div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-5 text-center border-2 border-red-200 shadow-sm">
                  <div className="text-3xl font-bold text-red-600">
                    {selectedJob.equipment.filter(eq => eq.status === 'Maintenance').length}
                  </div>
                  <div className="text-sm text-red-800 font-medium mt-1">Maintenance</div>
                </div>
              </div>

              {/* Equipment List */}
              <div className="bg-gray-50 rounded-xl p-1 mb-6">
                <div className="bg-white rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Equipment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operator</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours Today</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Condition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedJob.equipment.map((equipment, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${
                                equipment.type === 'Vehicle' ? 'bg-blue-100' :
                                equipment.type === 'Core Drill' ? 'bg-orange-100' :
                                equipment.type === 'Slab Saw' ? 'bg-green-100' :
                                equipment.type === 'Wall Saw' ? 'bg-purple-100' :
                                'bg-gray-100'
                              }`}>
                                {equipment.type === 'Vehicle' ? '🚛' :
                                 equipment.type === 'Core Drill' ? '🔧' :
                                 equipment.type === 'Slab Saw' ? '⚡' :
                                 equipment.type === 'Wall Saw' ? '🔩' :
                                 '📦'}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{equipment.name}</div>
                                <div className="text-sm text-gray-500">ID: {equipment.name.replace(/\s/g, '-').toLowerCase()}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900">{equipment.type}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              equipment.status === 'In Use' ? 'bg-green-100 text-green-800' :
                              equipment.status === 'Standby' ? 'bg-yellow-100 text-yellow-800' :
                              equipment.status === 'Maintenance' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {equipment.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {equipment.operator}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {equipment.hours}h
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              equipment.condition === 'Excellent' ? 'bg-green-100 text-green-800' :
                              equipment.condition === 'Good' ? 'bg-blue-100 text-blue-800' :
                              equipment.condition === 'Fair' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {equipment.condition}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Equipment Notes & Actions */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Equipment Notes</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></span>
                        <span className="text-gray-700">Slab Saw #1 scheduled for maintenance after current job</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></span>
                        <span className="text-gray-700">All diamond blades checked and approved for use</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></span>
                        <span className="text-gray-700">Trucks fueled and ready for transport</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Quick Actions</h3>
                  <div className="space-y-3">
                    <button className="w-full px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg text-sm font-bold">
                      Request Additional Equipment
                    </button>
                    <button className="w-full px-5 py-3 bg-gradient-to-r from-orange-600 to-yellow-600 text-white rounded-xl hover:from-orange-700 hover:to-yellow-700 transition-all shadow-md hover:shadow-lg text-sm font-bold">
                      Report Equipment Issue
                    </button>
                    <button className="w-full px-5 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all shadow-md hover:shadow-lg text-sm font-bold">
                      Update Equipment Status
                    </button>
                    <button className="w-full px-5 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all shadow-md hover:shadow-lg text-sm font-bold">
                      Print Equipment Report
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowEquipmentModal(false)}
                  className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all shadow-md hover:shadow-lg font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Job Modal */}
      {showUpdateModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Update Job Status</h2>
                <button
                  onClick={() => setShowUpdateModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Job Status</label>
                <select
                  value={updateStatus || selectedJob.status}
                  onChange={(e) => setUpdateStatus(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                >
                  <option value="on-track">On Track</option>
                  <option value="needs-attention">Needs Attention</option>
                  <option value="behind">Behind</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Progress: {updateProgress || selectedJob.progress}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={updateProgress || selectedJob.progress}
                  onChange={(e) => setUpdateProgress(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Update Notes</label>
                <textarea
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="Add notes about this update..."
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleUpdateJob}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Save Update
                </button>
                <button
                  onClick={() => setShowUpdateModal(false)}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documents Modal */}
      {showDocumentsModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Job Documents</h2>
                <button
                  onClick={() => setShowDocumentsModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-4">
                {selectedJob.requiredDocuments?.map((doc, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200 hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-800">{doc}</h3>
                          <p className="text-sm text-gray-500">Required for this job</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={doc.includes('JSA') ? '/dashboard/tools/jsa-form' : '#'}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          {doc.includes('JSA') ? 'Fill Form' : 'View'}
                        </Link>
                        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800">All documents completed</h3>
                        <p className="text-sm text-gray-600">Job is ready to proceed</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photos Modal */}
      {showPhotosModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Job Progress Photos</h2>
                <button
                  onClick={() => setShowPhotosModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Upload Photos
                </button>
              </div>

              {jobPhotos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {jobPhotos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo}
                        alt={`Job photo ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <button className="px-4 py-2 bg-white text-gray-800 rounded-lg font-medium">
                          View Full Size
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="font-medium">No photos uploaded yet</p>
                  <p className="text-sm">Click the button above to add progress photos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Time Tracking Modal */}
      {showTimeTrackingModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Time Clock & Tracking</h2>
                <button
                  onClick={() => setShowTimeTrackingModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">{selectedJob.timeline.elapsed}h</div>
                  <div className="text-sm text-blue-800">Hours Worked</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{selectedJob.timeline.totalHours - selectedJob.timeline.elapsed}h</div>
                  <div className="text-sm text-green-800">Hours Remaining</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-purple-600">{selectedJob.crew.length}</div>
                  <div className="text-sm text-purple-800">Crew Members</div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-gray-800 text-lg">Crew Time Entries</h3>
                {selectedJob.crew.map((member, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-bold">{member.charAt(0)}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-800">{member}</h4>
                          <p className="text-sm text-gray-500">Clock In: {selectedJob.startTime}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-800">
                          {Math.floor(selectedJob.timeline.elapsed)}h {Math.round((selectedJob.timeline.elapsed % 1) * 60)}m
                        </div>
                        <div className="text-sm text-green-600 font-medium">Currently Working</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Communication Modal */}
      {showCommunicationModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">
                  {communicationType === 'call' ? 'Call Operator' : 'Send Message'}
                </h2>
                <button
                  onClick={() => setShowCommunicationModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {communicationType === 'call' ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-6 text-center">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-800 text-lg mb-2">{selectedJob.operator}</h3>
                    <p className="text-gray-600 mb-4">{selectedJob.contactPhone || 'Phone number not available'}</p>
                    <a
                      href={`tel:${selectedJob.contactPhone || ''}`}
                      className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Start Call
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">To: {selectedJob.operator}</label>
                    <textarea
                      placeholder="Type your message here..."
                      rows={6}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
                    />
                  </div>
                  <button className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
                    Send Message
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Project Analytics Dashboard</h2>
                <button
                  onClick={() => setShowAnalyticsModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-200">
                  <div className="text-3xl font-bold text-blue-600">{jobs.length}</div>
                  <div className="text-sm text-blue-800 font-medium">Active Jobs</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border-2 border-green-200">
                  <div className="text-3xl font-bold text-green-600">
                    {Math.round((statusCounts['on-track'] / jobs.length) * 100)}%
                  </div>
                  <div className="text-sm text-green-800 font-medium">On Track</div>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border-2 border-yellow-200">
                  <div className="text-3xl font-bold text-yellow-600">
                    {Math.round(jobs.reduce((acc, job) => acc + job.progress, 0) / jobs.length)}%
                  </div>
                  <div className="text-sm text-yellow-800 font-medium">Avg Progress</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-200">
                  <div className="text-3xl font-bold text-purple-600">
                    {jobs.reduce((acc, job) => acc + job.crew.length, 0)}
                  </div>
                  <div className="text-sm text-purple-800 font-medium">Total Crew</div>
                </div>
              </div>

              {/* Job Completion Rate Chart */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-gray-800 text-lg mb-4">Job Completion Progress</h3>
                <div className="space-y-3">
                  {jobs.map(job => (
                    <div key={job.id}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-700">{job.projectName}</span>
                        <span className="text-sm font-bold text-gray-800">{job.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-full rounded-full transition-all ${getStatusColor(job.status)}`}
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Distribution */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-bold text-gray-800 text-lg mb-4">Status Distribution</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 border-2 border-green-200">
                    <div className="text-2xl font-bold text-green-600 mb-1">{statusCounts['on-track']}</div>
                    <div className="text-sm text-gray-600">On Track</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-green-500 h-full rounded-full"
                        style={{ width: `${(statusCounts['on-track'] / jobs.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border-2 border-yellow-200">
                    <div className="text-2xl font-bold text-yellow-600 mb-1">{statusCounts['needs-attention']}</div>
                    <div className="text-sm text-gray-600">Needs Attention</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-yellow-500 h-full rounded-full"
                        style={{ width: `${(statusCounts['needs-attention'] / jobs.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border-2 border-red-200">
                    <div className="text-2xl font-bold text-red-600 mb-1">{statusCounts['behind']}</div>
                    <div className="text-sm text-gray-600">Behind</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-red-500 h-full rounded-full"
                        style={{ width: `${(statusCounts['behind'] / jobs.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job History Modal */}
      {showHistoryModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Job History Timeline</h2>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {/* Current phase */}
                <div className="relative pl-8 pb-8 border-l-4 border-blue-500">
                  <div className="absolute -left-3 top-0 w-6 h-6 bg-blue-500 rounded-full border-4 border-white animate-pulse"></div>
                  <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-blue-900">Currently: {selectedJob.phase}</h3>
                      <span className="text-xs text-blue-600 font-medium">IN PROGRESS</span>
                    </div>
                    <p className="text-sm text-blue-700">{selectedJob.notes}</p>
                    <p className="text-xs text-blue-500 mt-2">{selectedJob.lastUpdate}</p>
                  </div>
                </div>

                {/* Completed phases */}
                {selectedJob.timeline.phases
                  .filter(phase => phase.status === 'completed')
                  .map((phase, index) => (
                    <div key={index} className="relative pl-8 pb-8 border-l-4 border-green-300">
                      <div className="absolute -left-3 top-0 w-6 h-6 bg-green-500 rounded-full border-4 border-white flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-green-900">{phase.name} Completed</h3>
                          <span className="text-xs text-green-600 font-medium">COMPLETED</span>
                        </div>
                        <p className="text-sm text-green-700">Duration: {phase.duration} hours</p>
                        <p className="text-xs text-green-500 mt-2">Earlier today</p>
                      </div>
                    </div>
                  ))}

                {/* Job started */}
                <div className="relative pl-8">
                  <div className="absolute -left-3 top-0 w-6 h-6 bg-gray-400 rounded-full border-4 border-white"></div>
                  <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                    <h3 className="font-bold text-gray-900">Job Started</h3>
                    <p className="text-sm text-gray-600">Crew arrived on site at {selectedJob.startTime}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {selectedJob.startDate} {selectedJob.startTime}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}