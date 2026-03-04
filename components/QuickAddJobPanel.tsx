'use client';

import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import type { JobType } from '@/types/job';
import { commonEquipment } from '@/types/equipment-constants';

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
  job_type: string;
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

export default function QuickAddJobPanel({ operators, defaultDate, onSubmit, onClose }: QuickAddJobPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [jobType, setJobType] = useState('');
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [shopArrivalTime, setShopArrivalTime] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const filteredEquipment = equipmentSearch
    ? commonEquipment.filter(e =>
        e.toLowerCase().includes(equipmentSearch.toLowerCase()) && !equipment.includes(e)
      )
    : [];

  const handleSubmit = async () => {
    setError('');

    if (!customerName.trim()) {
      setError('Customer/Contractor name is required');
      return;
    }
    if (!jobType) {
      setError('Job type is required');
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
        job_type: jobType,
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

          {/* Job Type */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              Job Type *
            </label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900 text-base bg-white"
            >
              <option value="">Select job type...</option>
              {JOB_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
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
              Equipment
            </label>
            {equipment.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {equipment.map(item => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                  >
                    {item}
                    <button
                      onClick={() => setEquipment(equipment.filter(e => e !== item))}
                      className="hover:text-purple-900"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-900"
              />
              {showEquipmentDropdown && filteredEquipment.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto z-20">
                  {filteredEquipment.slice(0, 10).map(item => (
                    <button
                      key={item}
                      onClick={() => {
                        setEquipment([...equipment, item]);
                        setEquipmentSearch('');
                        setShowEquipmentDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-purple-50 text-sm text-gray-900 flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5 text-purple-500" />
                      {item}
                    </button>
                  ))}
                </div>
              )}
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
