'use client';

import { useState } from 'react';
import {
  X, Calendar, Clock, MapPin, Wrench, Phone, FileText, Edit3, Save, Trash2,
  AlertTriangle, MessageSquare, ChevronRight, Plus, Users
} from 'lucide-react';
import type { JobCardData } from './JobCard';

// Common equipment codes for quick-add suggestions
const EQUIPMENT_OPTIONS = ['HCD', 'CS-14', 'DPP', 'DFS', 'GPP', 'ECD', 'GPR', 'WS', 'HHS', 'TS', 'HWS'];

interface EditJobPanelProps {
  job: JobCardData;
  canEdit: boolean;
  operators: { name: string; helper: string }[];
  currentOperatorIndex: number | null;
  onSave: (updates: Partial<JobCardData> & { operatorIndex?: number | null }) => void;
  onClose: () => void;
  onViewNotes: () => void;
  onMakeWillCall?: () => void;
  onRemoveFromSchedule?: () => void;
}

export default function EditJobPanel({
  job, canEdit, operators, currentOperatorIndex,
  onSave, onClose, onViewNotes, onMakeWillCall, onRemoveFromSchedule,
}: EditJobPanelProps) {
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');
  const [arrivalTime, setArrivalTime] = useState(job.arrival_time || '');
  const [endDate, setEndDate] = useState(job.end_date || '');
  const [equipment, setEquipment] = useState<string[]>([...job.equipment_needed]);
  const [newEquipment, setNewEquipment] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<number | null>(currentOperatorIndex);
  const [hasChanges, setHasChanges] = useState(false);

  const markChanged = () => setHasChanges(true);

  const addEquipment = (item: string) => {
    const trimmed = item.trim().toUpperCase();
    if (trimmed && !equipment.includes(trimmed)) {
      setEquipment(prev => [...prev, trimmed]);
      setNewEquipment('');
      markChanged();
    }
  };

  const removeEquipment = (item: string) => {
    setEquipment(prev => prev.filter(e => e !== item));
    markChanged();
  };

  // Filter suggestions to ones not already added
  const suggestions = EQUIPMENT_OPTIONS.filter(eq => !equipment.includes(eq));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[70]" onClick={onClose} />

      {/* Side panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className={`p-5 text-white ${canEdit
          ? 'bg-gradient-to-r from-purple-600 to-pink-500'
          : 'bg-gradient-to-r from-gray-600 to-gray-700'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                {canEdit ? <Edit3 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                {canEdit ? 'Edit Job' : 'Job Details'}
              </h2>
              <p className="text-sm opacity-80">{job.job_number}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Customer info (read-only) */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h3 className="font-bold text-gray-900 text-lg">{job.customer_name}</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mt-1">
              {job.job_type}
            </span>
            {job.location && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-2">
                <MapPin className="w-4 h-4 text-gray-400" /> {job.location}
              </p>
            )}
            {job.address && (
              <p className="text-xs text-gray-400 ml-5.5 mt-0.5">{job.address}</p>
            )}
            {job.description && (
              <p className="text-sm text-gray-600 mt-3 italic border-l-2 border-gray-300 pl-3">
                {job.description}
              </p>
            )}
            {job.po_number && (
              <p className="text-xs text-gray-500 mt-2">
                <strong>PO:</strong> {job.po_number}
              </p>
            )}
          </div>

          {/* Equipment — EDITABLE */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              <Wrench className="w-4 h-4 inline mr-1" />
              Equipment Required
            </label>
            {canEdit ? (
              <>
                {/* Current equipment with remove buttons */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {equipment.map(eq => (
                    <span key={eq} className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-semibold border border-indigo-200">
                      {eq}
                      <button
                        onClick={() => removeEquipment(eq)}
                        className="ml-0.5 p-0.5 hover:bg-indigo-200 rounded-full transition-colors"
                        title={`Remove ${eq}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  {equipment.length === 0 && (
                    <span className="text-sm text-gray-400 italic">No equipment added</span>
                  )}
                </div>
                {/* Add equipment input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEquipment}
                    onChange={(e) => setNewEquipment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEquipment(newEquipment); } }}
                    placeholder="Type equipment code..."
                    className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm text-gray-900 bg-white placeholder:text-gray-400"
                  />
                  <button
                    onClick={() => addEquipment(newEquipment)}
                    disabled={!newEquipment.trim()}
                    className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {/* Quick-add suggestions */}
                {suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Quick Add:</p>
                    <div className="flex flex-wrap gap-1">
                      {suggestions.slice(0, 8).map(eq => (
                        <button
                          key={eq}
                          onClick={() => addEquipment(eq)}
                          className="px-2 py-1 bg-gray-100 hover:bg-indigo-100 rounded-lg text-xs text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-300 transition-all font-medium"
                        >
                          + {eq}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {job.equipment_needed.map(eq => (
                  <span key={eq} className="px-3 py-1 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-medium border border-indigo-200">
                    {eq}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Difficulty */}
          {job.difficulty_rating && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
              job.difficulty_rating >= 7
                ? 'bg-red-50 border-red-200'
                : job.difficulty_rating >= 4
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-green-50 border-green-200'
            }`}>
              <AlertTriangle className={`w-4 h-4 ${
                job.difficulty_rating >= 7 ? 'text-red-500' : job.difficulty_rating >= 4 ? 'text-amber-500' : 'text-green-500'
              }`} />
              <span className="text-sm font-bold text-gray-900">Difficulty: {job.difficulty_rating}/10</span>
            </div>
          )}

          {/* ─── Editable Fields ─── */}
          {canEdit ? (
            <>
              {/* Schedule Date */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => { setScheduledDate(e.target.value); markChanged(); }}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm text-gray-900 bg-white"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  End Date <span className="text-gray-400 font-normal">(multi-day)</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); markChanged(); }}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm text-gray-900 bg-white"
                />
              </div>

              {/* Arrival Time */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Arrival Time
                </label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => { setArrivalTime(e.target.value); markChanged(); }}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm text-gray-900 bg-white"
                />
              </div>

              {/* Assign Operator */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <Users className="w-4 h-4 inline mr-1" />
                  Assigned Operator & Helper
                </label>
                <select
                  value={selectedOperator ?? -1}
                  onChange={(e) => { setSelectedOperator(e.target.value === '-1' ? null : parseInt(e.target.value)); markChanged(); }}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm text-gray-900 bg-white"
                >
                  <option value={-1}>Unassigned</option>
                  {operators.map((op, idx) => (
                    <option key={idx} value={idx}>{op.name} + {op.helper}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Typically assigned 2-3 days before the start date</p>
              </div>
            </>
          ) : (
            /* Read-only view of scheduling info */
            <div className="space-y-3">
              {job.arrival_time && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Arrival:</span> {job.arrival_time}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={onViewNotes}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                View Notes
                {job.notes_count > 0 && (
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">{job.notes_count}</span>
                )}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            {canEdit && onMakeWillCall && !job.is_will_call && (
              <button
                onClick={onMakeWillCall}
                className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 text-sm font-semibold text-amber-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Move to Will Call
                </span>
                <ChevronRight className="w-4 h-4 text-amber-400" />
              </button>
            )}

            {canEdit && onRemoveFromSchedule && (
              <button
                onClick={onRemoveFromSchedule}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-sm font-semibold text-red-600 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Remove from Schedule
                </span>
                <ChevronRight className="w-4 h-4 text-red-400" />
              </button>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {canEdit && (
          <div className="border-t border-gray-200 p-4 flex items-center gap-3 bg-gray-50">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave({
                scheduled_date: scheduledDate,
                end_date: endDate || null,
                arrival_time: arrivalTime || null,
                equipment_needed: equipment,
                operatorIndex: selectedOperator,
              })}
              disabled={!hasChanges}
              className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        )}
      </div>
    </>
  );
}
