'use client';

import { useState } from 'react';
import { Equipment } from '../lib/supabase-equipment';

interface AssignmentModalProps {
  equipment: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
  onAssign: (equipment: Equipment, assignedTo: string) => Promise<void>;
}

export default function AssignmentModal({
  equipment,
  isOpen,
  onClose,
  onAssign
}: AssignmentModalProps) {
  const [assignedTo, setAssignedTo] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  if (!isOpen || !equipment) return null;

  const handleAssign = async () => {
    if (!assignedTo.trim()) {
      alert('Please enter a name for assignment');
      return;
    }

    setIsAssigning(true);
    try {
      await onAssign(equipment, assignedTo.trim());
      setAssignedTo('');
      onClose();
    } catch (error) {
      console.error('Failed to assign equipment:', error);
      alert('Failed to assign equipment. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Assign Equipment</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">{equipment.name}</h3>
            <p className="text-sm text-gray-500">
              {equipment.brand} {equipment.model && `- ${equipment.model}`}
            </p>
          </div>

          <div>
            <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700 mb-2">
              Assign To
            </label>
            <input
              id="assignedTo"
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Enter employee name or ID"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-medium">Assignment Info</p>
                <p className="text-xs text-blue-700 mt-1">
                  This equipment will be marked as "In Use" and assigned to the specified person.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-medium"
              disabled={isAssigning}
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={isAssigning || !assignedTo.trim()}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isAssigning ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Assigning...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Assign Equipment
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}