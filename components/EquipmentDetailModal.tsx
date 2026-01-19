'use client';

import { Equipment } from '../lib/supabase-equipment';

interface EquipmentDetailModalProps {
  equipment: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (equipment: Equipment) => Promise<void>;
}

export default function EquipmentDetailModal({
  equipment,
  isOpen,
  onClose,
  onUpdate
}: EquipmentDetailModalProps) {
  if (!isOpen || !equipment) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">Equipment Details</h2>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Equipment Name</label>
              <p className="text-lg font-semibold text-gray-800">{equipment.name}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Brand</label>
              <p className="text-lg text-gray-800">{equipment.brand || 'N/A'}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Model</label>
              <p className="text-lg text-gray-800">{equipment.model || 'N/A'}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Serial Number</label>
              <p className="text-lg text-gray-800">{equipment.serial_number || 'N/A'}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Status</label>
              <div className="mt-1">
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                  equipment.status === 'available'
                    ? 'bg-green-100 text-green-700'
                    : equipment.status === 'assigned'
                    ? 'bg-blue-100 text-blue-700'
                    : equipment.status === 'maintenance'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {equipment.status.charAt(0).toUpperCase() + equipment.status.slice(1).replace('-', ' ')}
                </span>
              </div>
            </div>

            {equipment.assigned_to && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-500">Assigned To</label>
                <p className="text-lg text-gray-800">{equipment.assigned_to}</p>
              </div>
            )}

            {equipment.location && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-500">Location</label>
                <p className="text-lg text-gray-800">{equipment.location}</p>
              </div>
            )}

            {equipment.notes && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-500">Notes</label>
                <p className="text-gray-700 mt-1">{equipment.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-medium"
            >
              Close
            </button>
            {onUpdate && (
              <button
                onClick={() => {
                  // Handle edit functionality
                  console.log('Edit equipment:', equipment);
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                Edit Details
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}