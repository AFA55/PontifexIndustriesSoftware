'use client';

import { useMemo } from 'react';
import { Users, Briefcase } from 'lucide-react';
import DroppableOperatorRow from './DroppableOperatorRow';
import DraggableJobCard from './DraggableJobCard';
import JobCard from './JobCard';
import type { JobCardData } from './JobCard';

interface OperatorInfo {
  id: string;
  name: string;
  skillLevel: number | null;
}

interface OperatorRowViewProps {
  operatorJobs: Record<number, JobCardData[]>;
  unassignedJobs: JobCardData[];
  rowAssignments: { operator: string | null; helper: string | null }[];
  operatorIdMap: Record<string, string>;
  operatorSkillMap: Record<string, number | null>;
  allOperatorsList: string[];
  timeOffMap: Record<string, { type: string; notes: string | null }>;
  canDrag: boolean;
  canEdit: boolean;
  onEditJob?: (job: JobCardData, rowIndex: number | null) => void;
  onRequestChange?: (job: JobCardData) => void;
  onViewNotes?: (job: JobCardData) => void;
  onPreviewJob?: (job: JobCardData) => void;
}

const TIME_OFF_LABELS: Record<string, string> = {
  pto: 'PTO',
  unpaid: 'Unpaid',
  worked_last_night: 'Worked Last Night',
  sick: 'Sick',
  other: 'Other',
};

const OPERATOR_COLORS = [
  { border: 'border-purple-500', bg: 'bg-purple-100', text: 'text-purple-700', badge: 'bg-purple-500', icon: 'text-purple-600' },
  { border: 'border-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500', icon: 'text-blue-600' },
  { border: 'border-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-500', icon: 'text-emerald-600' },
  { border: 'border-rose-500', bg: 'bg-rose-100', text: 'text-rose-700', badge: 'bg-rose-500', icon: 'text-rose-600' },
  { border: 'border-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700', badge: 'bg-indigo-500', icon: 'text-indigo-600' },
  { border: 'border-cyan-500', bg: 'bg-cyan-100', text: 'text-cyan-700', badge: 'bg-cyan-500', icon: 'text-cyan-600' },
  { border: 'border-amber-600', bg: 'bg-amber-100', text: 'text-amber-700', badge: 'bg-amber-600', icon: 'text-amber-600' },
  { border: 'border-pink-500', bg: 'bg-pink-100', text: 'text-pink-700', badge: 'bg-pink-500', icon: 'text-pink-600' },
];

export default function OperatorRowView({
  operatorJobs,
  unassignedJobs,
  rowAssignments,
  operatorIdMap,
  operatorSkillMap,
  allOperatorsList,
  timeOffMap,
  canDrag,
  canEdit,
  onEditJob,
  onRequestChange,
  onViewNotes,
  onPreviewJob,
}: OperatorRowViewProps) {
  // Build operator list — show ALL operators, not just those with jobs
  const operators = useMemo(() => {
    // First, build a map of operators who have row assignments with jobs
    const assignedOps = new Map<string, { rowIndex: number; jobs: JobCardData[]; helper: string | null }>();
    for (let i = 0; i < rowAssignments.length; i++) {
      const assignment = rowAssignments[i];
      if (assignment.operator) {
        assignedOps.set(assignment.operator, {
          rowIndex: i,
          jobs: operatorJobs[i] || [],
          helper: assignment.helper,
        });
      }
    }

    // Build full list from allOperatorsList
    const ops: (OperatorInfo & { rowIndex: number; jobs: JobCardData[]; helper: string | null; timeOff?: { type: string; notes: string | null } })[] = [];
    const seenNames = new Set<string>();

    // First add operators with assignments (they have row indices)
    for (const [name, data] of assignedOps) {
      const opId = operatorIdMap[name] || `row-${data.rowIndex}`;
      seenNames.add(name);
      ops.push({
        id: opId,
        name,
        skillLevel: operatorSkillMap[name] ?? null,
        rowIndex: data.rowIndex,
        jobs: data.jobs,
        helper: data.helper,
        timeOff: operatorIdMap[name] ? timeOffMap[operatorIdMap[name]] : undefined,
      });
    }

    // Then add remaining operators from the full list
    for (const name of allOperatorsList) {
      if (seenNames.has(name)) continue;
      const opId = operatorIdMap[name] || `op-${name}`;
      ops.push({
        id: opId,
        name,
        skillLevel: operatorSkillMap[name] ?? null,
        rowIndex: -1, // not assigned to a row
        jobs: [],
        helper: null,
        timeOff: operatorIdMap[name] ? timeOffMap[operatorIdMap[name]] : undefined,
      });
    }

    return ops;
  }, [rowAssignments, operatorJobs, operatorIdMap, operatorSkillMap, allOperatorsList, timeOffMap]);

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-3">
      {/* Unassigned row */}
      <DroppableOperatorRow operatorId="unassigned" operatorName="Unassigned">
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-orange-400 hover:shadow-md transition-all">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Unassigned</h3>
                <p className="text-[10px] text-gray-500">Jobs awaiting operator assignment</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                {unassignedJobs.length} {unassignedJobs.length === 1 ? 'job' : 'jobs'}
              </span>
            </div>

            {unassignedJobs.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {unassignedJobs.map((job) => (
                  <div key={job.id} className="flex-shrink-0 w-64">
                    <DraggableJobCard job={job} canDrag={canDrag} onClick={() => onPreviewJob?.(job)}>
                      <JobCard
                        job={job}
                        colorScheme={{ border: 'border-orange-400', bg: 'bg-orange-100', text: 'text-orange-700', badge: 'bg-orange-500' }}
                        canEdit={canEdit}
                        onEdit={onEditJob ? (j) => onEditJob(j, null) : undefined}
                        onRequestChange={onRequestChange}
                        onViewNotes={onViewNotes}
                      />
                    </DraggableJobCard>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-3 rounded-lg border-2 border-dashed border-orange-200 bg-orange-50/30">
                <p className="text-sm text-orange-400 font-medium">No unassigned jobs</p>
              </div>
            )}
          </div>
        </div>
      </DroppableOperatorRow>

      {/* Operator rows */}
      {operators.map((op, idx) => {
        const colorScheme = OPERATOR_COLORS[idx % OPERATOR_COLORS.length];
        return (
          <DroppableOperatorRow key={op.id} operatorId={op.id} operatorName={op.name}>
            <div className={`bg-white rounded-xl shadow-sm border-l-4 ${colorScheme.border} hover:shadow-md transition-all`}>
              <div className="p-4">
                {/* Operator header */}
                <div className="flex items-center gap-3 mb-3">
                  {/* Avatar / initials */}
                  <div className={`w-10 h-10 rounded-xl ${colorScheme.bg} flex items-center justify-center`}>
                    <span className={`text-sm font-bold ${colorScheme.text}`}>
                      {getInitials(op.name)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 text-sm truncate">{op.name}</h3>
                      {/* Skill badge */}
                      {op.skillLevel !== null && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          op.skillLevel >= 7
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : op.skillLevel >= 4
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                        }`}>
                          Skill {op.skillLevel}
                        </span>
                      )}
                    </div>
                    {op.helper && (
                      <p className="text-[10px] text-gray-500">+ {op.helper}</p>
                    )}
                  </div>

                  {(op as any).timeOff ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-600">
                      {TIME_OFF_LABELS[(op as any).timeOff.type] || (op as any).timeOff.type}
                    </span>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      op.jobs.length > 0
                        ? `${colorScheme.bg} ${colorScheme.text}`
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {op.jobs.length > 0
                        ? `${op.jobs.length} ${op.jobs.length === 1 ? 'job' : 'jobs'}`
                        : 'Available'}
                    </span>
                  )}
                </div>

                {/* Time-off block */}
                {(op as any).timeOff ? (
                  <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">&#128564;</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold">{TIME_OFF_LABELS[(op as any).timeOff.type] || (op as any).timeOff.type}</span>
                      {(op as any).timeOff.notes && <p className="text-xs text-gray-500 mt-0.5">{(op as any).timeOff.notes}</p>}
                    </div>
                  </div>
                ) : op.jobs.length > 0 ? (
                  /* Jobs — horizontal scrolling */
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {op.jobs.map((job) => (
                      <div key={job.id} className="flex-shrink-0 w-64">
                        <DraggableJobCard job={job} canDrag={canDrag} onClick={() => onPreviewJob?.(job)}>
                          <JobCard
                            job={job}
                            colorScheme={colorScheme}
                            canEdit={canEdit}
                            assignedOperator={op.name}
                            assignedHelper={op.helper}
                            onEdit={onEditJob ? (j) => onEditJob(j, op.rowIndex) : undefined}
                            onRequestChange={onRequestChange}
                            onViewNotes={onViewNotes}
                          />
                        </DraggableJobCard>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex items-center justify-center py-3 rounded-lg border-2 border-dashed transition-all bg-green-50/50 border-green-200`}>
                    <p className="text-sm text-green-500 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
                      Available
                    </p>
                  </div>
                )}
              </div>
            </div>
          </DroppableOperatorRow>
        );
      })}

      {/* Empty state if no operators */}
      {operators.length === 0 && unassignedJobs.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No operators or jobs for this date</p>
        </div>
      )}
    </div>
  );
}
