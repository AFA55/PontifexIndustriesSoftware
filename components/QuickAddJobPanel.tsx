'use client';

import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import type { JobType } from '@/types/job';
import { EQUIPMENT_PRESETS } from '@/lib/equipment-map';

interface OperatorInfo {
  id: string;
  full_name: string;
  email: string;
}

interface QuickAddJobPanelProps {
  operators: OperatorInfo[];
  defaultDate: string;
  onSubmit: (data: QuickAddData) => Promise<void>;
  onClose: () => void;
}

export interface QuickAddData {
  customer_name: string;
  job_type: string;       // Comma-separated if multiple types selected
  job_types: string[];    // Array of selected job types
  scheduled_date: string;
  end_date: string;
  arrival_time: string;
  shop_arrival_time: string;
  operator_id: string;
  operator_name: string;
  equipment_needed: string[];
  location: string;
  address: string;
  notes: string;
}

const JOB_TYPES: JobType[] = [
  'Core Drilling',
  'Wall Sawing',
  'Slab Sawing',
  'Hand Sawing',
  'Wire Sawing',
  'GPR Scanning',
  'Demolition',
  'Other',
];

// EQUIPMENT_PRESETS imported from @/lib/equipment-map (single source of truth)

export default function QuickAddJobPanel({ operators, defaultDate, onSubmit, onClose }: QuickAddJobPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [shopArrivalTime, setShopArrivalTime] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [customEquipment, setCustomEquipment] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const addCustomEquipment = () => {
    const trimmed = customEquipment.trim();
    if (trimmed && !equipment.includes(trimmed)) {
      setEquipment([...equipment, trimmed]);
      setCustomEquipment('');
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!customerName.trim()) {
      setError('Customer/Contractor name is required');
      return;
    }
    if (jobTypes.length === 0) {
      setError('At least one job type is required');
      return;
    }
    if (!scheduledDate) {
      setError('Scheduled date is required');
      return;
    }

    const operator = operators.find(o => o.id === selectedOperator);

    setSubmitting(true);
    try {
      await onSubmit({
        customer_name: customerName.trim(),
        job_type: jobTypes.join(', '),
        job_types: jobTypes,
        scheduled_date: scheduledDate,
        end_date: endDate,
        arrival_time: arrivalTime,
        shop_arrival_time: shopArrivalTime,
        operator_id: selectedOperator,
        operator_name: operator?.full_name || '',
        equipment_needed: equipment,
        location: location.trim(),
        address: address.trim(),
        notes: notes.trim(),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
      <div
        className="bg-white w-full max-w-lg shadow-2xl overflow-y-auto animate-slide-in-right"
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 p-5 text-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Quick Add Job</h2>
              <p className="text-purple-100 text-sm">Add a job to the schedule</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Customer/Contractor Name */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Customer / Contractor *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Patriot Concrete, ABC Construction"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900 text-base"
            />
          </div>

          {/* Job Type - Multi-select */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Job Type * <span className="font-normal text-gray-400">(select one or more)</span>
            </label>
            {jobTypes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {jobTypes.map(type => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium"
                  >
                    {type}
                    <button
                      onClick={() => setJobTypes(jobTypes.filter(t => t !== type))}
                      className="hover:text-green-900"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {JOB_TYPES.filter(type => !jobTypes.includes(type)).map(type => (
                <button
                  key={type}
                  onClick={() => setJobTypes([...jobTypes, type])}
                  className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-purple-400 hover:bg-purple-50 hover:text-purple-700 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Date Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Start Date *
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
                style={{ colorScheme: 'light' }}
              />
            </div>
          </div>

          {/* Time Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Shop Arrival
              </label>
              <input
                type="time"
                value={shopArrivalTime}
                onChange={(e) => setShopArrivalTime(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Site Arrival
              </label>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
              />
            </div>
          </div>

          {/* Operator */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Operator
            </label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900 text-base bg-white"
            >
              <option value="">Unassigned</option>
              {operators.map(op => (
                <option key={op.id} value={op.id}>{op.full_name}</option>
              ))}
            </select>
          </div>

          {/* Equipment */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Equipment <span className="font-normal text-gray-400">(tap to add)</span>
            </label>

            {/* Selected equipment chips */}
            {equipment.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {equipment.map(item => {
                  const preset = EQUIPMENT_PRESETS.find(p => p.abbrev === item);
                  return (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                      title={preset?.full}
                    >
                      {item}
                      <button
                        onClick={() => setEquipment(equipment.filter(e => e !== item))}
                        className="hover:text-purple-900"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Preset abbreviation buttons */}
            <div className="flex flex-wrap gap-2 mb-3">
              {EQUIPMENT_PRESETS.filter(p => !equipment.includes(p.abbrev)).map(preset => (
                <button
                  key={preset.abbrev}
                  onClick={() => setEquipment([...equipment, preset.abbrev])}
                  title={preset.full}
                  className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:border-purple-400 hover:bg-purple-50 hover:text-purple-700 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {preset.abbrev}
                </button>
              ))}
            </div>

            {/* Custom equipment input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customEquipment}
                onChange={(e) => setCustomEquipment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomEquipment();
                  }
                }}
                placeholder="Add other equipment..."
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
              />
              <button
                type="button"
                onClick={addCustomEquipment}
                className="px-4 py-3 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-xl font-bold transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Location Name
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Downtown Office Building"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St, City, State"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any initial notes about this job..."
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900 resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Adding...' : 'Add to Schedule'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
