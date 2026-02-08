'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  User,
  Clock,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  X,
  FileText,
  Camera,
  Timer,
  ClipboardList,
  Star,
  Users,
  Briefcase,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
} from 'lucide-react';

// ─── Shared types, hooks, services ──────────────────────────────────────────
import type { JobOrder, JobUpdatePayload } from '@/types/job';
import type { OperatorOption } from '@/types/operator';
import { WORKFLOW_STEPS, getWorkflowProgress } from '@/types/workflow';
import { useAuth } from '@/hooks/useAuth';
import { useJobs } from '@/hooks/useJobs';

type TabType = 'upcoming' | 'active' | 'completed';

// ─── Helpers (pure formatting, no state) ────────────────────────────────────

const formatDate = (dateStr: string) => {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

const formatTime = (time: string | null) => {
  if (!time) return 'Not set';
  const parts = time.split(':');
  if (parts.length < 2) return time;
  const hour = parseInt(parts[0]);
  const min = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${min} ${ampm}`;
};

const formatDateTime = (dt: string | null) => {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'assigned': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'in_route': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'in_progress': return 'bg-green-100 text-green-700 border-green-200';
    case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getStatusText = (status: string) => {
  return status.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'bg-red-100 text-red-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'low': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const renderStars = (rating: number | null): React.ReactNode => {
  if (!rating) return <span className="text-gray-400 text-sm">No rating</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-4 h-4 ${i <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
        />
      ))}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function JobBoardPage() {
  // Auth — redirects if not admin
  const { loading: authLoading } = useAuth({ requireRole: 'admin' });

  // Jobs data — handles fetching, categorization, search, date filtering, updates
  const {
    upcoming,
    active,
    completed,
    filteredJobs,
    operators,
    loading: jobsLoading,
    searchQuery,
    setSearchQuery,
    filterDate,
    setFilterDate,
    updateJob: handleUpdateJob,
  } = useJobs();

  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterByDate, setFilterByDate] = useState(false);

  // Detail & Edit modals
  const [detailJob, setDetailJob] = useState<JobOrder | null>(null);
  const [editJob, setEditJob] = useState<JobOrder | null>(null);
  const [saving, setSaving] = useState(false);

  // Expanded completed job cards
  const [expandedCompletedId, setExpandedCompletedId] = useState<string | null>(null);

  // ─── Date-aware filtering ────────────────────────────────────────────────

  // Sync the date filter between local date picker and hook
  const handleDateFilterToggle = useCallback(() => {
    if (filterByDate) {
      // Turning off → clear the hook's date filter
      setFilterByDate(false);
      setFilterDate(null);
    } else {
      // Turning on → set the hook's date filter to selectedDate
      setFilterByDate(true);
      setFilterDate(selectedDate);
    }
  }, [filterByDate, selectedDate, setFilterDate]);

  const handleDateChange = useCallback((newDate: string) => {
    setSelectedDate(newDate);
    if (filterByDate) setFilterDate(newDate);
  }, [filterByDate, setFilterDate]);

  const goToPrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    handleDateChange(d.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    handleDateChange(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    handleDateChange(new Date().toISOString().split('T')[0]);
  };

  // ─── Filtered lists ─────────────────────────────────────────────────────

  const upcomingJobs = filteredJobs('upcoming');
  const activeJobs = filteredJobs('active');
  const completedJobs = filteredJobs('completed');

  const currentJobs = activeTab === 'upcoming' ? upcomingJobs :
                      activeTab === 'active' ? activeJobs : completedJobs;

  // ─── Update Job Handler ─────────────────────────────────────────────────

  const handleSaveEdit = async () => {
    if (!editJob) return;
    setSaving(true);
    try {
      // Find operator name for the new assignment
      let operatorName = editJob.operator_name;
      if (editJob.assigned_to) {
        const op = operators.find(o => o.id === editJob.assigned_to);
        if (op) operatorName = op.full_name;
      }

      const updates: JobUpdatePayload = {
        scheduled_date: editJob.scheduled_date,
        end_date: editJob.end_date || null,
        arrival_time: editJob.arrival_time,
        shop_arrival_time: editJob.shop_arrival_time,
        estimated_hours: editJob.estimated_hours,
        assigned_to: editJob.assigned_to || null,
        operator_name: operatorName,
      };

      const success = await handleUpdateJob(editJob.id, updates);
      if (success) setEditJob(null);
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading State ────────────────────────────────────────────────────

  const loading = authLoading || jobsLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading Job Board...</p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 border-b border-blue-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/admin" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="w-6 h-6 text-white" />
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                  <Briefcase className="w-7 h-7" />
                  Job Board
                </h1>
                <p className="text-blue-100 text-sm mt-0.5">Track and manage all job tickets</p>
              </div>
            </div>

            {/* Stats badges */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur rounded-xl border border-white/30 px-5 py-2.5 text-center">
                <div className="text-2xl font-bold text-white">{upcoming.length}</div>
                <div className="text-[11px] text-white/80 font-medium">Upcoming</div>
              </div>
              <div className="bg-white/20 backdrop-blur rounded-xl border border-white/30 px-5 py-2.5 text-center">
                <div className="text-2xl font-bold text-white">{active.length}</div>
                <div className="text-[11px] text-white/80 font-medium">Active</div>
              </div>
              <div className="bg-white/20 backdrop-blur rounded-xl border border-white/30 px-5 py-2.5 text-center">
                <div className="text-2xl font-bold text-white">{completed.length}</div>
                <div className="text-[11px] text-white/80 font-medium">Completed</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1">
            {[
              { key: 'upcoming' as TabType, label: 'Upcoming Jobs', count: upcomingJobs.length },
              { key: 'active' as TabType, label: 'Active Jobs', count: activeJobs.length },
              { key: 'completed' as TabType, label: 'Completed Jobs', count: completedJobs.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 sm:px-6 py-3.5 font-semibold text-sm border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Search + Calendar Controls ──────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs, customers, operators..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Calendar toggle + date picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDateFilterToggle}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                filterByDate
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filter by Date
            </button>

            {filterByDate && (
              <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg">
                <button onClick={goToPrevDay} className="p-2 hover:bg-gray-100 rounded-l-lg">
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => handleDateChange(e.target.value)}
                  className="px-2 py-2 text-sm border-0 focus:ring-0 w-[140px]"
                />
                <button onClick={goToNextDay} className="p-2 hover:bg-gray-100">
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  onClick={goToToday}
                  className="px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-r-lg border-l border-gray-300"
                >
                  Today
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Job Cards Grid ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        {currentJobs.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-500 mb-2">
              No {activeTab} jobs {filterByDate ? `for ${formatDate(selectedDate)}` : ''}
            </h3>
            <p className="text-gray-400 text-sm">
              {activeTab === 'active'
                ? 'Jobs move here when an operator starts their route.'
                : activeTab === 'completed'
                ? 'Completed job tickets will appear here.'
                : 'Create jobs from the Schedule Board.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {currentJobs.map(job => (
              <div key={job.id}>
                {activeTab === 'completed'
                  ? <CompletedJobCard
                      job={job}
                      expanded={expandedCompletedId === job.id}
                      onToggle={() => setExpandedCompletedId(expandedCompletedId === job.id ? null : job.id)}
                    />
                  : <JobCard
                      job={job}
                      isActive={activeTab === 'active'}
                      onViewDetails={() => setDetailJob(job)}
                      onEditJob={() => setEditJob({ ...job })}
                    />
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── View Details Modal ──────────────────────────────────────────── */}
      {detailJob && (
        <DetailModal
          job={detailJob}
          onClose={() => setDetailJob(null)}
        />
      )}

      {/* ── Edit Job Modal ──────────────────────────────────────────────── */}
      {editJob && (
        <EditModal
          job={editJob}
          operators={operators}
          saving={saving}
          onChange={setEditJob}
          onSave={handleSaveEdit}
          onClose={() => setEditJob(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Job Card (Upcoming / Active) ────────────────────────────────────────────

function JobCard({
  job,
  isActive,
  onViewDetails,
  onEditJob,
}: {
  job: JobOrder;
  isActive: boolean;
  onViewDetails: () => void;
  onEditJob: () => void;
}) {
  const progress = getWorkflowProgress(job);

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all flex flex-col">
      {/* Card Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{job.title}</h3>
            <p className="text-sm text-blue-600 font-semibold">{job.job_number}</p>
          </div>
          <span className={`ml-2 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getStatusColor(job.status)}`}>
            {getStatusText(job.status)}
          </span>
        </div>
        <p className="text-sm text-gray-600 font-medium">{job.customer_name}</p>
      </div>

      {/* Card Body */}
      <div className="p-5 space-y-2.5 flex-1">
        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{job.location}</p>
            <p className="text-xs text-gray-500 truncate">{job.address}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-800">{formatDate(job.scheduled_date)}</p>
            {job.end_date && job.end_date !== job.scheduled_date && (
              <p className="text-xs text-gray-500">through {formatDate(job.end_date)}</p>
            )}
          </div>
        </div>

        {job.arrival_time && (
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <p className="text-sm text-gray-700">Arrival: {formatTime(job.arrival_time)}</p>
          </div>
        )}

        {job.operator_name && (
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <p className="text-sm text-gray-700">{job.operator_name}</p>
          </div>
        )}

        {job.priority && (
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${getPriorityColor(job.priority)}`}>
              {job.priority}
            </span>
          </div>
        )}
      </div>

      {/* Workflow Progress (Active only) */}
      {isActive && (
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase">Progress</h4>
            <span className="text-xs font-semibold text-blue-600">{progress.completedCount}/{progress.totalSteps}</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
          {/* Step dots */}
          <div className="flex items-center justify-between">
            {progress.steps.map((step) => (
              <div key={step.key} className="group relative flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 ${
                  step.completed
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300'
                }`} />
                {/* Tooltip */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {step.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card Footer */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onViewDetails}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Details
          </button>
          <button
            onClick={onEditJob}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            Update Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Completed Job Card ─────────────────────────────────────────────────────

function CompletedJobCard({
  job,
  expanded,
  onToggle,
}: {
  job: JobOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  const progress = getWorkflowProgress(job);

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all">
      {/* Summary Row */}
      <button onClick={onToggle} className="w-full text-left p-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{job.title}</h3>
            <p className="text-sm text-blue-600 font-semibold">{job.job_number}</p>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
              Completed
            </span>
            {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <User className="w-3.5 h-3.5" />
            {job.customer_name}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {job.location}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(job.scheduled_date)}
          </span>
        </div>

        {/* Mini progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${progress.percentComplete}%` }} />
          </div>
          <span className="text-xs text-gray-500 font-medium">{progress.completedCount}/{progress.totalSteps}</span>
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200 p-5 space-y-5">
          {/* Workflow Timeline */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Workflow Timeline
            </h4>
            <div className="space-y-2">
              {progress.steps.map(step => (
                <div key={step.key} className="flex items-center gap-3">
                  {step.completed
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  }
                  <span className={`text-sm ${step.completed ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Time Clock */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Time Clock
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-gray-500 text-xs">Route Started</p>
                <p className="font-medium text-gray-800">{formatDateTime(job.route_started_at)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-gray-500 text-xs">Work Started</p>
                <p className="font-medium text-gray-800">{formatDateTime(job.work_started_at)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-gray-500 text-xs">Work Completed</p>
                <p className="font-medium text-gray-800">{formatDateTime(job.work_completed_at)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-gray-500 text-xs">Ticket Signed</p>
                <p className="font-medium text-gray-800">{formatDateTime(job.completion_signed_at)}</p>
              </div>
            </div>
          </div>

          {/* Crew Info */}
          {job.operator_name && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Crew Information
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-500 text-xs">Operator</p>
                  <p className="font-medium text-gray-800">{job.operator_name || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-500 text-xs">Foreman</p>
                  <p className="font-medium text-gray-800">{job.foreman_name || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Documents */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Documents
            </h4>
            <div className="flex flex-wrap gap-2">
              {job.liability_release_pdf && (
                <a href={job.liability_release_pdf} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Liability Release PDF
                </a>
              )}
              {job.silica_form_pdf && (
                <a href={job.silica_form_pdf} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Silica Form PDF
                </a>
              )}
              {job.agreement_pdf && (
                <a href={job.agreement_pdf} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Work Order Agreement
                </a>
              )}
              {!job.liability_release_pdf && !job.silica_form_pdf && !job.agreement_pdf && (
                <p className="text-sm text-gray-400">No documents attached</p>
              )}
            </div>
          </div>

          {/* Photos */}
          {job.photo_urls && job.photo_urls.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Photos ({job.photo_urls.length})
              </h4>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {job.photo_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 w-20 h-20 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Surveys / Ratings */}
          {(job.customer_overall_rating || job.job_difficulty_rating) && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <Star className="w-4 h-4" />
                Surveys & Ratings
              </h4>
              <div className="space-y-2">
                {job.customer_overall_rating && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                    <span className="text-sm text-gray-600">Customer Overall</span>
                    {renderStars(job.customer_overall_rating)}
                  </div>
                )}
                {job.customer_cleanliness_rating && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                    <span className="text-sm text-gray-600">Cleanliness</span>
                    {renderStars(job.customer_cleanliness_rating)}
                  </div>
                )}
                {job.customer_communication_rating && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                    <span className="text-sm text-gray-600">Communication</span>
                    {renderStars(job.customer_communication_rating)}
                  </div>
                )}
                {job.customer_feedback_comments && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500 mb-1">Customer Comments</p>
                    <p className="text-sm text-gray-800">{job.customer_feedback_comments}</p>
                  </div>
                )}
                {job.job_difficulty_rating && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                    <span className="text-sm text-gray-600">Job Difficulty (Operator)</span>
                    {renderStars(job.job_difficulty_rating)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Work Performed */}
          {job.work_performed && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                Work Performed
              </h4>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {job.work_performed}
              </div>
            </div>
          )}

          {/* Job Description */}
          {job.description && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Job Description</h4>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{job.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── View Details Modal ─────────────────────────────────────────────────────

function DetailModal({
  job,
  onClose,
}: {
  job: JobOrder;
  onClose: () => void;
}) {
  const progress = getWorkflowProgress(job);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-8">
        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
            <p className="text-sm text-blue-600 font-semibold mt-0.5">{job.job_number}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(job.status)}`}>
              {getStatusText(job.status)}
            </span>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <InfoField icon={<User className="w-4 h-4" />} label="Customer" value={job.customer_name} />
            <InfoField icon={<MapPin className="w-4 h-4" />} label="Location" value={job.location} />
            <InfoField icon={<Calendar className="w-4 h-4" />} label="Scheduled" value={formatDate(job.scheduled_date)} />
            {job.end_date && job.end_date !== job.scheduled_date && (
              <InfoField icon={<Calendar className="w-4 h-4" />} label="End Date" value={formatDate(job.end_date)} />
            )}
            <InfoField icon={<Clock className="w-4 h-4" />} label="Arrival Time" value={formatTime(job.arrival_time)} />
            <InfoField icon={<User className="w-4 h-4" />} label="Operator" value={job.operator_name || 'Unassigned'} />
            <InfoField icon={<User className="w-4 h-4" />} label="Foreman" value={job.foreman_name || '-'} />
            <InfoField icon={<Briefcase className="w-4 h-4" />} label="Job Type" value={job.job_type || '-'} />
            {job.estimated_hours && (
              <InfoField icon={<Clock className="w-4 h-4" />} label="Est. Hours" value={`${job.estimated_hours}h`} />
            )}
          </div>

          {/* Address */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Full Address</p>
            <p className="text-sm text-gray-800">{job.address}</p>
          </div>

          {/* Description */}
          {job.description && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          {/* Equipment */}
          {job.equipment_needed && job.equipment_needed.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Equipment Needed</p>
              <div className="flex flex-wrap gap-1.5">
                {job.equipment_needed.map((eq, i) => (
                  <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">{eq}</span>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Progress */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Workflow Progress</p>
            <div className="space-y-2">
              {progress.steps.map(step => (
                <div key={step.key} className="flex items-center gap-3">
                  {step.completed
                    ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  }
                  <span className={`text-sm ${step.completed ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Timestamps */}
          {(job.route_started_at || job.work_started_at || job.work_completed_at || job.completion_signed_at) && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Timestamps</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {job.route_started_at && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-gray-500 text-xs">Route Started</p>
                    <p className="font-medium text-gray-800">{formatDateTime(job.route_started_at)}</p>
                  </div>
                )}
                {job.work_started_at && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-gray-500 text-xs">Work Started</p>
                    <p className="font-medium text-gray-800">{formatDateTime(job.work_started_at)}</p>
                  </div>
                )}
                {job.work_completed_at && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-gray-500 text-xs">Work Completed</p>
                    <p className="font-medium text-gray-800">{formatDateTime(job.work_completed_at)}</p>
                  </div>
                )}
                {job.completion_signed_at && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-gray-500 text-xs">Ticket Signed</p>
                    <p className="font-medium text-gray-800">{formatDateTime(job.completion_signed_at)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Info Field Helper ──────────────────────────────────────────────────────

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  );
}

// ─── Edit Job Modal ─────────────────────────────────────────────────────────

function EditModal({
  job,
  operators,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  job: JobOrder;
  operators: OperatorOption[];
  saving: boolean;
  onChange: (j: JobOrder) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Update Job</h2>
            <p className="text-sm text-gray-500">{job.job_number} - {job.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Operator */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
            <select
              value={job.assigned_to || ''}
              onChange={e => onChange({ ...job, assigned_to: e.target.value || null })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Unassigned</option>
              {operators.map(op => (
                <option key={op.id} value={op.id}>{op.full_name}</option>
              ))}
            </select>
          </div>

          {/* Scheduled Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={job.scheduled_date || ''}
              onChange={e => onChange({ ...job, scheduled_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date (for multi-day jobs)</label>
            <input
              type="date"
              value={job.end_date || ''}
              onChange={e => onChange({ ...job, end_date: e.target.value || null })}
              min={job.scheduled_date}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Arrival Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arrival Time</label>
            <input
              type="time"
              value={job.arrival_time || ''}
              onChange={e => onChange({ ...job, arrival_time: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Shop Arrival Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shop Arrival Time</label>
            <input
              type="time"
              value={job.shop_arrival_time || ''}
              onChange={e => onChange({ ...job, shop_arrival_time: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Estimated Hours */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={job.estimated_hours || ''}
              onChange={e => onChange({ ...job, estimated_hours: e.target.value ? parseFloat(e.target.value) : null })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. 4"
            />
          </div>

          {/* Link to full edit in schedule */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700 mb-1">Need to edit more details?</p>
            <Link
              href={`/dashboard/admin/schedule-board`}
              className="text-sm text-blue-600 font-semibold hover:underline"
            >
              Open in Schedule Board &rarr;
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
