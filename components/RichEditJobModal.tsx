'use client';

import { useState } from 'react';
import { Calendar, Users } from 'lucide-react';
import { commonEquipment } from '@/types/equipment-constants';
import type { JobOrder } from '@/types/job';

interface OperatorInfo {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
}

interface RichEditJobModalProps {
  job: JobOrder;
  operators: OperatorInfo[];
  saving: boolean;
  deleting: boolean;
  onJobChange: (job: JobOrder) => void;
  onSave: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
}

export default function RichEditJobModal({
  job,
  operators,
  saving,
  deleting,
  onJobChange,
  onSave,
  onDelete,
  onClose,
}: RichEditJobModalProps) {
  const [showOperatorDropdown, setShowOperatorDropdown] = useState(false);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const addEquipment = (item: string) => {
    const current = job.equipment_needed || [];
    if (!current.includes(item)) {
      onJobChange({ ...job, equipment_needed: [...current, item] });
    }
    setEquipmentSearch('');
    setShowEquipmentDropdown(false);
  };

  const removeEquipment = (item: string) => {
    const current = job.equipment_needed || [];
    onJobChange({ ...job, equipment_needed: current.filter(e => e !== item) });
  };

  return (
    <>
      {/* Main Edit Modal */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 text-white p-6 rounded-t-3xl z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">Edit Job Details</h2>
                <p className="text-purple-100">{job.job_number} - {job.title}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-6">
            {/* Operator Assignment */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-xl border-2 border-purple-200">
              <div className="flex items-start gap-3">
                <Users className="w-6 h-6 text-purple-600 mt-1" />
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-900 mb-1">
                    Assigned Operator
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Future updates will include smart recommendations based on task requirements and operator skill levels.
                  </p>

                  {/* Current Operator Display */}
                  {!showOperatorDropdown ? (
                    <div>
                      <div className="w-full px-4 py-3 bg-white border-2 border-purple-300 rounded-xl mb-3">
                        <div className="flex items-center gap-2">
                          {job.assigned_to ? (
                            <>
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                {job.operator_name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900">{job.operator_name || 'Unknown Operator'}</p>
                                <p className="text-xs text-gray-500">
                                  {operators.find(op => op.id === job.assigned_to)?.email || ''}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <p className="font-bold text-orange-600">Unassigned</p>
                                <p className="text-xs text-gray-500">No operator assigned to this job</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowOperatorDropdown(true)}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
                        >
                          Change Operator
                        </button>
                        {job.assigned_to && (
                          <button
                            type="button"
                            onClick={() => {
                              onJobChange({
                                ...job,
                                assigned_to: null,
                                operator_name: null,
                              });
                            }}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
                            title="Remove operator assignment"
                          >
                            Unassign
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Operator Dropdown */
                    <div className="space-y-2">
                      <select
                        value={job.assigned_to || ''}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          const selectedOperator = operators.find(op => op.id === selectedId);
                          onJobChange({
                            ...job,
                            assigned_to: selectedId || null,
                            operator_name: selectedOperator?.full_name || null,
                          });
                        }}
                        className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900 bg-white font-medium"
                        autoFocus
                      >
                        <option value="">-- Select Operator --</option>
                        {operators.map((operator) => (
                          <option key={operator.id} value={operator.id}>
                            {operator.full_name} ({operator.email})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowOperatorDropdown(false)}
                        className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-all"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Scheduled Date */}
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-5 rounded-xl border-2 border-blue-200">
              <div className="flex items-start gap-3">
                <Calendar className="w-6 h-6 text-blue-600 mt-1" />
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Scheduled Date *
                  </label>
                  <input
                    type="date"
                    value={job.scheduled_date ? job.scheduled_date.split('T')[0] : ''}
                    onChange={(e) => onJobChange({ ...job, scheduled_date: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-blue-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                  />
                </div>
              </div>

              {/* End Date for multi-day jobs */}
              <div className="flex items-start gap-3 mt-4">
                <Calendar className="w-6 h-6 text-purple-600 mt-1" />
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    End Date (multi-day jobs)
                  </label>
                  <input
                    type="date"
                    value={job.end_date || ''}
                    onChange={(e) => onJobChange({ ...job, end_date: e.target.value || null })}
                    min={job.scheduled_date ? job.scheduled_date.split('T')[0] : ''}
                    className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty for single-day jobs</p>
                </div>
              </div>
            </div>

            {/* Times */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Shop Arrival Time
                </label>
                <input
                  type="time"
                  value={job.shop_arrival_time ? job.shop_arrival_time.substring(0, 5) : ''}
                  onChange={(e) => onJobChange({ ...job, shop_arrival_time: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                />
                <div className="flex gap-2 mt-2">
                  {['06:00', '07:00', '08:00'].map(time => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => onJobChange({ ...job, shop_arrival_time: time })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      {parseInt(time)}:00 AM
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Job Site Arrival Time *
                </label>
                <input
                  type="time"
                  value={job.arrival_time ? job.arrival_time.substring(0, 5) : ''}
                  onChange={(e) => onJobChange({ ...job, arrival_time: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                />
                <div className="flex gap-2 mt-2">
                  {['07:00', '08:00', '09:00'].map(time => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => onJobChange({ ...job, arrival_time: time })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      {parseInt(time)}:00 AM
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Location Name *
                </label>
                <input
                  type="text"
                  value={job.location}
                  onChange={(e) => onJobChange({ ...job, location: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Address *
                </label>
                <input
                  type="text"
                  value={job.address}
                  onChange={(e) => onJobChange({ ...job, address: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900"
                />
              </div>
            </div>

            {/* Customer & Contact */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={job.customer_name}
                  onChange={(e) => onJobChange({ ...job, customer_name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact on Site
                </label>
                <input
                  type="text"
                  value={job.foreman_name || ''}
                  onChange={(e) => onJobChange({ ...job, foreman_name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Contact Phone
              </label>
              <input
                type="tel"
                value={job.foreman_phone || ''}
                onChange={(e) => onJobChange({ ...job, foreman_phone: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Job Description
              </label>
              <textarea
                value={job.description || ''}
                onChange={(e) => onJobChange({ ...job, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
              />
            </div>

            {/* Equipment */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Equipment Needed
              </label>

              {/* Selected Equipment Tags */}
              {job.equipment_needed && job.equipment_needed.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  {job.equipment_needed.map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeEquipment(item)}
                        className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Equipment Search */}
              <div className="relative">
                <input
                  type="text"
                  value={equipmentSearch}
                  onChange={(e) => {
                    setEquipmentSearch(e.target.value);
                    setShowEquipmentDropdown(true);
                  }}
                  onFocus={() => setShowEquipmentDropdown(true)}
                  placeholder="Search equipment..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                  autoComplete="off"
                />

                {/* Equipment Dropdown */}
                {showEquipmentDropdown && equipmentSearch && (
                  <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {commonEquipment
                      .filter(item => item.toLowerCase().includes(equipmentSearch.toLowerCase()))
                      .map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => addEquipment(item)}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-gray-800 border-b border-gray-100 last:border-b-0"
                        >
                          {item}
                        </div>
                      ))}
                    {commonEquipment.filter(item => item.toLowerCase().includes(equipmentSearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-2 text-gray-500 text-sm">No equipment found</div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Type to search and add equipment items
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl border-t border-gray-200 flex justify-between items-center gap-3">
            {/* Delete Button on Left */}
            <button
              onClick={() => setShowDeleteConfirmation(true)}
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Job
            </button>

            {/* Save/Cancel Buttons on Right */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Delete Job</h3>
                  <p className="text-red-100 text-sm">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Are you sure you want to delete this job?
              </p>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="font-bold text-gray-900">{job.customer_name}</p>
                <p className="text-sm text-gray-600">{job.job_number}</p>
                <p className="text-sm text-gray-600 mt-2">{job.location}</p>
              </div>
              <p className="text-sm text-red-600 font-semibold mt-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                This will permanently delete all job data, history, and related records.
              </p>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 p-6 flex justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => setShowDeleteConfirmation(false)}
                disabled={deleting}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowDeleteConfirmation(false);
                }}
                disabled={deleting}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Yes, Delete Job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
