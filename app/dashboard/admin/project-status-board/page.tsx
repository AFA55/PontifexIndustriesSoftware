'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Mock data for active jobs - will be replaced with actual data
const mockJobs = [
  {
    id: '1',
    jobNumber: 'JOB-2024-001',
    clientName: 'ABC Construction',
    projectName: 'Downtown Plaza Core Drilling',
    location: '123 Main St, Downtown',
    status: 'on-track',
    progress: 75,
    startTime: '7:00 AM',
    estimatedEnd: '3:00 PM',
    crew: ['John Smith', 'Mike Johnson'],
    operator: 'John Smith',
    equipment: [
      { name: 'Core Drill #3', type: 'Core Drill', status: 'In Use', hours: 6.2, operator: 'John Smith', condition: 'Good' },
      { name: 'Truck #5', type: 'Vehicle', status: 'In Use', hours: 6.0, operator: 'Mike Johnson', condition: 'Excellent' },
      { name: 'Diamond Bit Set', type: 'Accessory', status: 'In Use', hours: 6.2, operator: 'John Smith', condition: 'Good' }
    ],
    phase: 'Core Drilling',
    priority: 'high',
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

type StatusFilter = 'all' | 'on-track' | 'needs-attention' | 'behind';
type ViewMode = 'grid' | 'list' | 'timeline';

export default function ProjectStatusBoard() {
  const [jobs, setJobs] = useState(mockJobs);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedJob, setSelectedJob] = useState<typeof mockJobs[0] | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Filter jobs based on status and search
  const filteredJobs = jobs.filter(job => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-900 to-red-800 bg-clip-text text-transparent flex items-center gap-2">
                  <span className="text-3xl">📊</span>
                  Project Status Board
                </h1>
                <p className="text-sm text-gray-500">
                  Live monitoring of all active jobs • {currentTime.toLocaleDateString('en-US', {
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
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">{jobs.length}</div>
                <div className="text-xs text-gray-500">Active Jobs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {statusCounts['on-track']}
                </div>
                <div className="text-xs text-gray-500">On Track</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {statusCounts['needs-attention']}
                </div>
                <div className="text-xs text-gray-500">Need Attention</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {statusCounts['behind']}
                </div>
                <div className="text-xs text-gray-500">Behind</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Control Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
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
                      'bg-red-100 text-red-700'
                    }`}>
                      {job.status === 'on-track' ? 'On Track' :
                       job.status === 'needs-attention' ? 'Needs Attention' : 'Behind'}
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

                  {/* Progress Bar */}
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

                  {/* Timeline Phases */}
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

                  {/* Job Info Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-xs text-gray-500">Time</div>
                      <div className="text-sm font-medium text-gray-800">
                        {job.startTime} - {job.estimatedEnd}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Current Phase</div>
                      <div className="text-sm font-medium text-gray-800">{job.phase}</div>
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
                    <button className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm">
                      View Details
                    </button>
                    <button className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors border border-gray-200">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                    <button className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors border border-gray-200">
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
                        <button className="text-blue-600 hover:text-blue-900">View</button>
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
                      'bg-red-100'
                    }`}>
                      <div className={`w-4 h-4 rounded-full ${getStatusColor(job.status)}`}></div>
                    </div>

                    {/* Timeline Content */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-800 text-lg">{job.projectName}</h3>
                          <p className="text-sm text-gray-600">{job.clientName} • {job.location}</p>
                        </div>
                        <div className="text-sm text-gray-500">
                          {job.startTime} - {job.estimatedEnd}
                        </div>
                      </div>

                      {/* Progress Timeline */}
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

                      {/* Notes */}
                      {job.notes && (
                        <div className="mt-3 text-sm text-gray-600 italic">
                          "{job.notes}" - {job.lastUpdate}
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleJobClick(job)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
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
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                <button className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200">
                  <svg className="w-6 h-6 text-blue-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <div className="text-sm font-medium text-blue-900">Call Operator</div>
                </button>
                <button className="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors border border-green-200">
                  <svg className="w-6 h-6 text-green-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="text-sm font-medium text-green-900">Send Message</div>
                </button>
                <button className="p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors border border-yellow-200">
                  <svg className="w-6 h-6 text-yellow-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm font-medium text-yellow-900">Report Issue</div>
                </button>
                <button className="p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                  <svg className="w-6 h-6 text-purple-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <div className="text-sm font-medium text-purple-900">View Analytics</div>
                </button>
                <button
                  onClick={() => setShowEquipmentModal(true)}
                  className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <svg className="w-6 h-6 text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <div className="text-sm font-medium text-gray-700">View Equipment</div>
                </button>
              </div>

              {/* Detailed Information */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Job Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Location:</span>
                      <span className="font-medium">{selectedJob.location}</span>
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
                      <span className="font-medium capitalize">{selectedJob.priority}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Progress:</span>
                      <span className="font-bold">{selectedJob.progress}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Crew Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Operator:</span>
                      <span className="font-medium">{selectedJob.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Crew Members:</span>
                      <span className="font-medium">{selectedJob.crew.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Equipment:</span>
                      <span className="font-medium">{selectedJob.equipment.length} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Phase:</span>
                      <span className="font-medium">{selectedJob.phase}</span>
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
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    Equipment Assignment
                  </h2>
                  <p className="text-gray-600 mt-1">{selectedJob.projectName} • {selectedJob.jobNumber}</p>
                </div>
                <button
                  onClick={() => setShowEquipmentModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{selectedJob.equipment.length}</div>
                  <div className="text-sm text-blue-800">Total Equipment</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {selectedJob.equipment.filter(eq => eq.status === 'In Use').length}
                  </div>
                  <div className="text-sm text-green-800">In Use</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {selectedJob.equipment.filter(eq => eq.status === 'Standby').length}
                  </div>
                  <div className="text-sm text-yellow-800">Standby</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {selectedJob.equipment.filter(eq => eq.status === 'Maintenance').length}
                  </div>
                  <div className="text-sm text-red-800">Maintenance</div>
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
                    <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                      Request Additional Equipment
                    </button>
                    <button className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium">
                      Report Equipment Issue
                    </button>
                    <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                      Update Equipment Status
                    </button>
                    <button className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
                      Print Equipment Report
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowEquipmentModal(false)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}