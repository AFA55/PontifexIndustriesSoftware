'use client';

import { useState } from 'react';
import { X, Plus, Calendar, User, Building2, Send } from 'lucide-react';

interface QuickAddModalProps {
  salesmen: string[];
  onSubmit: (data: { salesmanName: string; startDate: string; contractorName: string }) => void;
  onClose: () => void;
}

export default function QuickAddModal({ salesmen, onSubmit, onClose }: QuickAddModalProps) {
  const [salesmanName, setSalesmanName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [contractorName, setContractorName] = useState('');

  const isValid = salesmanName.trim() && startDate && contractorName.trim();

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Quick Add Job
                </h2>
                <p className="text-green-100 text-sm">Add a job fast — full details later</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Info note */}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>Quick Add</strong> creates a pending job with minimal info. The salesman will be
                reminded to fill out the full Schedule Form so you can collect the rest of the details.
              </p>
            </div>

            {/* Salesman Name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <User className="w-4 h-4 inline mr-1.5" />
                Salesman Name
              </label>
              <select
                value={salesmanName}
                onChange={(e) => setSalesmanName(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 text-sm text-gray-900 bg-white transition-all"
              >
                <option value="">Select salesman...</option>
                {salesmen.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Contractor / Customer Name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <Building2 className="w-4 h-4 inline mr-1.5" />
                Contractor / Customer Name
              </label>
              <input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="e.g. Turner Construction"
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 text-sm text-gray-900 bg-white placeholder:text-gray-400 transition-all"
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                Project Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 text-sm text-gray-900 bg-white transition-all"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => isValid && onSubmit({ salesmanName, startDate, contractorName })}
                disabled={!isValid}
                className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Add to Pending
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
