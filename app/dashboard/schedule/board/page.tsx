'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Users, Wrench, MapPin, AlertTriangle, Plus } from 'lucide-react';
import { getAllJobs, updateJobStatus, Job } from '@/lib/jobs-service';
import { getAllCrewMembers, CrewMember } from '@/lib/jobs-service';
import Link from 'next/link';

interface ScheduleBoardProps {}

export default function ScheduleBoard({}: ScheduleBoardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [draggedJob, setDraggedJob] = useState<Job | null>(null);
  const [selectedView, setSelectedView] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsResult, crewResult] = await Promise.all([
        getAllJobs(),
        getAllCrewMembers()
      ]);

      if (jobsResult.success) setJobs(jobsResult.data);
      if (crewResult.success) setCrewMembers(crewResult.data);
    } catch (error) {
      console.error('Error loading schedule data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getJobsForDate = (date: string) => {
    return jobs.filter(job => job.scheduled_date === date);
  };

  const getJobsForCrew = (crewMemberId: string, date: string) => {
    return jobs.filter(job =>
      job.scheduled_date === date &&
      job.assigned_crew?.some(crew => crew.id === crewMemberId)
    );
  };

  const handleJobDrop = async (job: Job, newDate: string, crewMemberId?: string) => {
    if (job.scheduled_date === newDate) return;

    try {
      // Update job date
      const updatedJob = { ...job, scheduled_date: newDate };

      // Update in database
      await updateJobStatus(job.id!, job.status!, 'system', `Rescheduled to ${newDate}`);

      // Update local state
      setJobs(prevJobs =>
        prevJobs.map(j => j.id === job.id ? updatedJob : j)
      );
    } catch (error) {
      console.error('Error updating job schedule:', error);
    }
  };

  const getWeekDates = (startDate: string) => {
    const date = new Date(startDate);
    const week = [];

    // Get Monday of the week
    const monday = new Date(date);
    monday.setDate(date.getDate() - date.getDay() + 1);

    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      week.push(day.toISOString().split('T')[0]);
    }

    return week;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'dispatched': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'in_progress': return 'bg-green-100 border-green-300 text-green-800';
      case 'completed': return 'bg-gray-100 border-gray-300 text-gray-800';
      case 'cancelled': return 'bg-red-100 border-red-300 text-red-800';
      case 'on_hold': return 'bg-orange-100 border-orange-300 text-orange-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <AlertTriangle className="w-3 h-3 text-red-500" />;
      case 'high': return <AlertTriangle className="w-3 h-3 text-orange-500" />;
      default: return null;
    }
  };

  const weekDates = getWeekDates(selectedDate);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-6"></div>
          <div className="grid grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Schedule Board</h1>
          <p className="text-gray-600">Drag and drop jobs to reschedule</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mt-4 md:mt-0">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['day', 'week', 'month'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setSelectedView(view)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  selectedView === view
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 7);
                setSelectedDate(newDate.toISOString().split('T')[0]);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              ←
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 7);
                setSelectedDate(newDate.toISOString().split('T')[0]);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              →
            </button>
          </div>

          {/* Add Job Button */}
          <Link
            href="/dashboard/schedule/create"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </Link>
        </div>
      </div>

      {/* Week View Schedule Board */}
      <div className="grid grid-cols-7 gap-4">
        {weekDates.map((date) => {
          const dayJobs = getJobsForDate(date);
          const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
          const dayNumber = new Date(date).getDate();
          const isToday = date === new Date().toISOString().split('T')[0];

          return (
            <div
              key={date}
              className={`min-h-[400px] bg-white border-2 rounded-lg p-4 ${
                isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedJob) {
                  handleJobDrop(draggedJob, date);
                  setDraggedJob(null);
                }
              }}
            >
              {/* Day Header */}
              <div className="mb-4">
                <div className={`text-sm font-medium ${isToday ? 'text-blue-700' : 'text-gray-600'}`}>
                  {dayName}
                </div>
                <div className={`text-lg font-bold ${isToday ? 'text-blue-800' : 'text-gray-900'}`}>
                  {dayNumber}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Job Cards */}
              <div className="space-y-2">
                <AnimatePresence>
                  {dayJobs.map((job) => (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      draggable
                      onDragStart={() => setDraggedJob(job)}
                      onDragEnd={() => setDraggedJob(null)}
                      className={`p-3 rounded-lg border-2 cursor-move hover:shadow-md transition-all ${getStatusColor(job.status || 'scheduled')}`}
                    >
                      {/* Job Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1">
                          {getPriorityIcon(job.priority || 'normal')}
                          <span className="text-xs font-medium">{job.job_number}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span className="text-xs">{job.start_time || '8:00'}</span>
                        </div>
                      </div>

                      {/* Job Title */}
                      <h3 className="font-medium text-sm mb-2 line-clamp-2">{job.title}</h3>

                      {/* Customer */}
                      {job.customer && (
                        <div className="text-xs text-gray-600 mb-2">
                          {job.customer.name}
                        </div>
                      )}

                      {/* Location */}
                      <div className="flex items-center gap-1 mb-2">
                        <MapPin className="w-3 h-3 text-gray-500" />
                        <span className="text-xs text-gray-600 truncate">{job.address}</span>
                      </div>

                      {/* Crew & Equipment */}
                      <div className="flex items-center justify-between">
                        {job.assigned_crew && job.assigned_crew.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-gray-500" />
                            <span className="text-xs text-gray-600">
                              {job.assigned_crew.length}
                            </span>
                          </div>
                        )}

                        {job.assigned_equipment && job.assigned_equipment.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Wrench className="w-3 h-3 text-gray-500" />
                            <span className="text-xs text-gray-600">
                              {job.assigned_equipment.length}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Weather Warning */}
                      {job.weather_dependent && (
                        <div className="mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-yellow-500" />
                          <span className="text-xs text-yellow-600">Weather dependent</span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Drop Zone Indicator */}
              {dayJobs.length === 0 && (
                <div className="h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                  Drop jobs here
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Crew Assignment Panel (Mobile Hidden) */}
      <div className="hidden lg:block mt-6">
        <h2 className="text-lg font-semibold mb-4">Crew Assignments</h2>
        <div className="grid grid-cols-4 gap-4">
          {crewMembers.slice(0, 4).map((crew) => (
            <div key={crew.id} className="bg-white rounded-lg border p-4">
              <h3 className="font-medium mb-2">{crew.name}</h3>
              <div className="text-sm text-gray-600 mb-2">{crew.role}</div>
              <div className="space-y-1">
                {weekDates.map((date) => {
                  const crewJobs = getJobsForCrew(crew.id!, date);
                  return (
                    <div key={date} className="text-xs">
                      <span className="text-gray-500">
                        {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}:
                      </span>
                      <span className="ml-1">
                        {crewJobs.length > 0 ? `${crewJobs.length} job${crewJobs.length !== 1 ? 's' : ''}` : 'Available'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white rounded-lg border p-4">
        <h3 className="font-medium mb-3">Status Legend</h3>
        <div className="flex flex-wrap gap-4">
          {[
            { status: 'scheduled', label: 'Scheduled' },
            { status: 'dispatched', label: 'Dispatched' },
            { status: 'in_progress', label: 'In Progress' },
            { status: 'completed', label: 'Completed' },
            { status: 'on_hold', label: 'On Hold' },
            { status: 'cancelled', label: 'Cancelled' }
          ].map(({ status, label }) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded border-2 ${getStatusColor(status)}`}></div>
              <span className="text-sm text-gray-700">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}