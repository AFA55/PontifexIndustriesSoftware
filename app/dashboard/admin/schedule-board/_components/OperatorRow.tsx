'use client';

import { Users, Plus, Briefcase } from 'lucide-react';
import JobCard from './JobCard';
import type { JobCardData } from './JobCard';

interface OperatorRowProps {
  operatorName: string;
  helperName: string | null;
  jobs: JobCardData[];
  colorScheme: {
    border: string;
    bg: string;
    text: string;
    badge: string;
    icon: string;
  };
  canEdit: boolean;
  isAvailable?: boolean;
  onEditJob?: (job: JobCardData) => void;
  onRequestChange?: (job: JobCardData) => void;
  onViewNotes?: (job: JobCardData) => void;
  onAssignJob?: () => void;
}

export default function OperatorRow({
  operatorName,
  helperName,
  jobs,
  colorScheme,
  canEdit,
  isAvailable = false,
  onEditJob,
  onRequestChange,
  onViewNotes,
  onAssignJob,
}: OperatorRowProps) {
  // Show project name when jobs exist, operator name when available
  const hasJobs = jobs.length > 0;
  const headerTitle = hasJobs ? jobs[0].customer_name : operatorName;
  const headerSubtitle = hasJobs
    ? (jobs.length > 1 ? `+ ${jobs.length - 1} more project${jobs.length > 2 ? 's' : ''}` : null)
    : (helperName ? `+ ${helperName} · Available` : 'Available');

  return (
    <div className={`border-l-4 ${colorScheme.border} bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow`}>
      <div className="p-4">
        {/* Row header — project name or operator name if available */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorScheme.bg}`}>
              {hasJobs
                ? <Briefcase className={`w-5 h-5 ${colorScheme.icon}`} />
                : <Users className={`w-5 h-5 ${colorScheme.icon}`} />
              }
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">{headerTitle}</h3>
              {headerSubtitle && (
                <p className="text-xs text-gray-500">{headerSubtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colorScheme.bg} ${colorScheme.text}`}>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
            </span>
            {canEdit && isAvailable && (
              <button
                onClick={onAssignJob}
                className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                title="Assign job to this operator"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Jobs grid */}
        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                colorScheme={colorScheme}
                canEdit={canEdit}
                assignedOperator={operatorName}
                assignedHelper={helperName}
                onEdit={onEditJob}
                onRequestChange={onRequestChange}
                onViewNotes={onViewNotes}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-sm text-gray-400">
              No jobs assigned
              {canEdit && (
                <button
                  onClick={onAssignJob}
                  className="ml-2 text-purple-600 hover:text-purple-800 font-semibold hover:underline"
                >
                  + Assign Job
                </button>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
