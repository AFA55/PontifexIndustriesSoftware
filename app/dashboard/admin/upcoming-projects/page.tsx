'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Mock data for upcoming projects - next 7 days
const mockUpcomingProjects = [
  {
    id: '1',
    jobNumber: 'JOB-2024-005',
    clientName: 'Metro Transit Authority',
    projectName: 'Subway Platform Core Drilling',
    location: '456 Transit Ave',
    startDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    duration: 2,
    estimatedHours: 16,
    priority: 'high',
    status: 'confirmed',
    crew: ['John Smith', 'Mike Johnson', 'Dave Brown'],
    operator: 'John Smith',
    equipment: [
      { name: 'Core Drill #2', type: 'Core Drill' },
      { name: 'Truck #4', type: 'Vehicle' }
    ],
    notes: 'Night shift work - 11PM to 7AM only',
    phases: ['Site Setup', 'Core Drilling', 'Cleanup'],
    budget: 45000,
    clientContact: 'Sarah Wilson - (555) 123-4567'
  },
  {
    id: '2',
    jobNumber: 'JOB-2024-006',
    clientName: 'Downtown Medical',
    projectName: 'Emergency Wing Wall Sawing',
    location: '789 Medical Center Dr',
    startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    duration: 1,
    estimatedHours: 8,
    priority: 'urgent',
    status: 'confirmed',
    crew: ['Steve Miller', 'Bob Williams'],
    operator: 'Steve Miller',
    equipment: [
      { name: 'Wall Saw #1', type: 'Wall Saw' },
      { name: 'Truck #7', type: 'Vehicle' }
    ],
    notes: 'Hospital environment - strict safety protocols required',
    phases: ['Safety Briefing', 'Wall Sawing', 'Cleanup'],
    budget: 28000,
    clientContact: 'Dr. Michael Chen - (555) 987-6543'
  },
  {
    id: '3',
    jobNumber: 'JOB-2024-007',
    clientName: 'Riverside Construction',
    projectName: 'Bridge Deck Repair',
    location: '123 River Rd Bridge',
    startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    duration: 2,
    estimatedHours: 14,
    priority: 'medium',
    status: 'confirmed',
    crew: ['Jack Anderson', 'Bill Thomas'],
    operator: 'Jack Anderson',
    equipment: [
      { name: 'Slab Saw #2', type: 'Slab Saw' },
      { name: 'Truck #8', type: 'Vehicle' }
    ],
    notes: 'Weather dependent - postpone if rain forecast',
    phases: ['Site Preparation', 'Slab Cutting', 'Cleanup'],
    budget: 32000,
    clientContact: 'Mark Rodriguez - (555) 456-7890'
  },
  {
    id: '4',
    jobNumber: 'JOB-2024-008',
    clientName: 'Industrial Complex LLC',
    projectName: 'Factory Floor Cutting',
    location: '567 Industrial Blvd',
    startDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    duration: 1,
    estimatedHours: 10,
    priority: 'medium',
    status: 'pending_approval',
    crew: ['Tom Wilson', 'Dave Brown'],
    operator: 'Tom Wilson',
    equipment: [
      { name: 'Wall Saw #2', type: 'Wall Saw' },
      { name: 'Truck #5', type: 'Vehicle' }
    ],
    notes: 'Client coordination required for access',
    phases: ['Setup', 'Wall Cutting', 'Cleanup'],
    budget: 22000,
    clientContact: 'Lisa Chen - (555) 321-0987'
  },
  {
    id: '5',
    jobNumber: 'JOB-2024-009',
    clientName: 'City Parks Department',
    projectName: 'Sidewalk Renovation',
    location: '890 Park Avenue',
    startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    duration: 2,
    estimatedHours: 12,
    priority: 'low',
    status: 'confirmed',
    crew: ['Mike Johnson', 'John Smith'],
    operator: 'Mike Johnson',
    equipment: [
      { name: 'Slab Saw #1', type: 'Slab Saw' },
      { name: 'Truck #3', type: 'Vehicle' }
    ],
    notes: 'Public area - minimize disruption during peak hours',
    phases: ['Site Prep', 'Cutting', 'Cleanup'],
    budget: 15000,
    clientContact: 'Robert Green - (555) 654-3210'
  },
  {
    id: '6',
    jobNumber: 'JOB-2024-010',
    clientName: 'Metro Shopping Center',
    projectName: 'Parking Garage Core Drilling',
    location: '456 Commerce St',
    startDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days from now
    endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    duration: 1,
    estimatedHours: 6,
    priority: 'low',
    status: 'tentative',
    crew: ['Steve Miller'],
    operator: 'Steve Miller',
    equipment: [
      { name: 'Core Drill #3', type: 'Core Drill' },
      { name: 'Truck #6', type: 'Vehicle' }
    ],
    notes: 'Schedule around peak shopping hours',
    phases: ['Setup', 'Core Drilling', 'Cleanup'],
    budget: 12000,
    clientContact: 'Amanda White - (555) 789-0123'
  }
];

type ViewMode = 'calendar' | 'list';

export default function UpcomingProjectsBoard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedProject, setSelectedProject] = useState<typeof mockUpcomingProjects[0] | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<typeof mockUpcomingProjects[0] | null>(null);
  const [projects, setProjects] = useState(mockUpcomingProjects);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Get next 7 days starting from today
  const getNext7Days = () => {
    const days = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date);
    }

    return days;
  };

  // Get projects for a specific date
  const getProjectsForDate = (date: Date) => {
    return projects.filter(project => {
      const projectStart = new Date(project.startDate);
      const projectEnd = new Date(project.endDate);
      return date >= projectStart && date <= projectEnd;
    });
  };

  // Navigate 7-day view
  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const handleProjectClick = (project: typeof mockUpcomingProjects[0]) => {
    setSelectedProject(project);
    setShowProjectModal(true);
  };

  const handleEditProject = (project: typeof mockUpcomingProjects[0]) => {
    setEditingProject({...project});
    setShowEditModal(true);
    setShowProjectModal(false);
  };

  const handleSaveProject = () => {
    if (editingProject) {
      setProjects(projects.map(p =>
        p.id === editingProject.id ? editingProject : p
      ));
      setShowEditModal(false);
      setEditingProject(null);
      // Update selected project if it's currently being viewed
      if (selectedProject && selectedProject.id === editingProject.id) {
        setSelectedProject(editingProject);
      }
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setEditingProject(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500';
      case 'pending_approval':
        return 'bg-yellow-500';
      case 'tentative':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'medium':
        return 'text-blue-600 bg-blue-100';
      case 'low':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const weekDays = getNext7Days();

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
                  <span className="text-3xl">📅</span>
                  Upcoming Projects Board
                </h1>
                <p className="text-sm text-gray-500">
                  Schedule and manage upcoming projects
                </p>
              </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'calendar'
                      ? 'bg-white shadow-md text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Calendar View"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* 7-Day View */}
        {viewMode === 'calendar' && (
          <>
            {/* 7-Day Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">
                  Next 7 Days - Starting {new Date().toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateWeek('prev')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => navigateWeek('next')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* 7-Day Grid */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {weekDays.map((day, index) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const dayProjects = getProjectsForDate(day);
                  const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNumber = day.getDate();
                  const monthName = day.toLocaleDateString('en-US', { month: 'short' });

                  return (
                    <div
                      key={index}
                      className={`bg-white min-h-[300px] p-4 ${
                        isToday ? 'ring-2 ring-blue-500 ring-inset' : ''
                      }`}
                    >
                      {/* Day Header */}
                      <div className="text-center mb-4">
                        <div className={`text-sm font-medium ${
                          isToday ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {dayName}
                        </div>
                        <div className={`text-2xl font-bold ${
                          isToday ? 'text-blue-600' : 'text-gray-800'
                        }`}>
                          {dayNumber}
                        </div>
                        <div className={`text-xs ${
                          isToday ? 'text-blue-500' : 'text-gray-400'
                        }`}>
                          {monthName}
                        </div>
                      </div>

                      {/* Projects for this day */}
                      <div className="space-y-2">
                        {dayProjects.length === 0 ? (
                          <div className="text-center text-gray-400 text-sm py-8">
                            No jobs scheduled
                          </div>
                        ) : (
                          dayProjects.map((project, projectIndex) => (
                            <div
                              key={projectIndex}
                              onClick={() => handleProjectClick(project)}
                              className={`p-3 rounded-lg cursor-pointer hover:shadow-md transition-all border-l-4 ${
                                project.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
                                project.priority === 'high' ? 'border-l-orange-500 bg-orange-50' :
                                project.priority === 'medium' ? 'border-l-blue-500 bg-blue-50' :
                                'border-l-gray-500 bg-gray-50'
                              }`}
                            >
                              <div className="font-semibold text-sm text-gray-800 mb-1">
                                {project.jobNumber}
                              </div>
                              <div className="text-xs text-gray-600 mb-1">
                                {project.clientName}
                              </div>
                              <div className="text-xs text-gray-500 mb-2 truncate">
                                {project.projectName}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                  project.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                  project.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {project.status === 'pending_approval' ? 'Pending' : 'Confirmed'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {project.estimatedHours}h
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {project.operator}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleProjectClick(project)}>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{project.projectName}</div>
                          <div className="text-sm text-gray-500">{project.jobNumber}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{project.clientName}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {project.startDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{project.duration} days</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          project.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          project.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {project.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(project.priority)}`}>
                          {project.priority.toUpperCase()}
                        </span>
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
      </div>

      {/* Project Detail Modal */}
      {showProjectModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{selectedProject.projectName}</h2>
                  <p className="text-gray-600">{selectedProject.jobNumber} • {selectedProject.clientName}</p>
                </div>
                <button
                  onClick={() => setShowProjectModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Project Overview */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Project Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Location:</span>
                      <span className="font-medium">{selectedProject.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Start Date:</span>
                      <span className="font-medium">
                        {selectedProject.startDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">End Date:</span>
                      <span className="font-medium">
                        {selectedProject.endDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duration:</span>
                      <span className="font-medium">{selectedProject.duration} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Estimated Hours:</span>
                      <span className="font-medium">{selectedProject.estimatedHours}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Budget:</span>
                      <span className="font-medium">${selectedProject.budget.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Team & Resources</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Operator:</span>
                      <span className="font-medium">{selectedProject.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Crew Size:</span>
                      <span className="font-medium">{selectedProject.crew.length} workers</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Equipment:</span>
                      <span className="font-medium">{selectedProject.equipment.length} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Client Contact:</span>
                      <span className="font-medium text-sm">{selectedProject.clientContact}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        selectedProject.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        selectedProject.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {selectedProject.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Priority:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityColor(selectedProject.priority)}`}>
                        {selectedProject.priority.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Phases */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-3">Project Phases</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {selectedProject.phases.map((phase, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-sm font-medium text-gray-700">{phase}</div>
                      <div className="text-xs text-gray-500 mt-1">Phase {index + 1}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipment List */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-3">Assigned Equipment</h3>
                <div className="grid grid-cols-3 gap-3">
                  {selectedProject.equipment.map((equipment, index) => (
                    <div key={index} className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <div className="text-sm font-medium text-blue-900">{equipment.name}</div>
                      <div className="text-xs text-blue-700">{equipment.type}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selectedProject.notes && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-800 mb-3">Special Notes</h3>
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <p className="text-yellow-800">{selectedProject.notes}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => handleEditProject(selectedProject)}
                  className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Edit Project
                </button>
                <button className="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                  Confirm Schedule
                </button>
                <button className="p-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium">
                  Request Changes
                </button>
                <button className="p-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
                  Print Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditModal && editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Edit Project</h2>
                  <p className="text-gray-600">{editingProject.jobNumber} • {editingProject.clientName}</p>
                </div>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Project Information</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
                    <input
                      type="text"
                      value={editingProject.projectName}
                      onChange={(e) => setEditingProject({...editingProject, projectName: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Client Name</label>
                    <input
                      type="text"
                      value={editingProject.clientName}
                      onChange={(e) => setEditingProject({...editingProject, clientName: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                    <input
                      type="text"
                      value={editingProject.location}
                      onChange={(e) => setEditingProject({...editingProject, location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                      <input
                        type="date"
                        value={editingProject.startDate.toISOString().split('T')[0]}
                        onChange={(e) => setEditingProject({...editingProject, startDate: new Date(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                      <input
                        type="date"
                        value={editingProject.endDate.toISOString().split('T')[0]}
                        onChange={(e) => setEditingProject({...editingProject, endDate: new Date(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Hours</label>
                      <input
                        type="number"
                        value={editingProject.estimatedHours}
                        onChange={(e) => setEditingProject({...editingProject, estimatedHours: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Budget</label>
                      <input
                        type="number"
                        value={editingProject.budget}
                        onChange={(e) => setEditingProject({...editingProject, budget: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column - Status & Team */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Status & Team</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                      <select
                        value={editingProject.priority}
                        onChange={(e) => setEditingProject({...editingProject, priority: e.target.value as any})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <select
                        value={editingProject.status}
                        onChange={(e) => setEditingProject({...editingProject, status: e.target.value as any})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="tentative">Tentative</option>
                        <option value="pending_approval">Pending Approval</option>
                        <option value="confirmed">Confirmed</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Lead Operator</label>
                    <input
                      type="text"
                      value={editingProject.operator}
                      onChange={(e) => setEditingProject({...editingProject, operator: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Crew Members (comma separated)</label>
                    <input
                      type="text"
                      value={editingProject.crew.join(', ')}
                      onChange={(e) => setEditingProject({...editingProject, crew: e.target.value.split(', ').filter(name => name.trim())})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Client Contact</label>
                    <input
                      type="text"
                      value={editingProject.clientContact}
                      onChange={(e) => setEditingProject({...editingProject, clientContact: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Special Notes</label>
                    <textarea
                      value={editingProject.notes}
                      onChange={(e) => setEditingProject({...editingProject, notes: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Equipment Section */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Equipment</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {editingProject.equipment.map((equipment, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-3 border">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={equipment.name}
                            onChange={(e) => {
                              const newEquipment = [...editingProject.equipment];
                              newEquipment[index] = {...equipment, name: e.target.value};
                              setEditingProject({...editingProject, equipment: newEquipment});
                            }}
                            className="w-full text-sm font-medium bg-transparent border-none outline-none"
                          />
                          <input
                            type="text"
                            value={equipment.type}
                            onChange={(e) => {
                              const newEquipment = [...editingProject.equipment];
                              newEquipment[index] = {...equipment, type: e.target.value};
                              setEditingProject({...editingProject, equipment: newEquipment});
                            }}
                            className="w-full text-xs text-gray-600 bg-transparent border-none outline-none mt-1"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newEquipment = editingProject.equipment.filter((_, i) => i !== index);
                            setEditingProject({...editingProject, equipment: newEquipment});
                          }}
                          className="ml-2 p-1 text-red-600 hover:bg-red-100 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newEquipment = [...editingProject.equipment, {name: '', type: ''}];
                      setEditingProject({...editingProject, equipment: newEquipment});
                    }}
                    className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-3 text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Equipment
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex justify-end gap-4">
                <button
                  onClick={handleCancelEdit}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProject}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}