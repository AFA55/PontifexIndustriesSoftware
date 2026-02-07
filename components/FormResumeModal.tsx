'use client';

import { useEffect, useState } from 'react';

interface FormResumeModalProps {
  isOpen: boolean;
  savedAge: string;
  currentStep: number;
  totalSteps: number;
  onResume: () => void;
  onStartNew: () => void;
}

export function FormResumeModal({
  isOpen,
  savedAge,
  currentStep,
  totalSteps,
  onResume,
  onStartNew,
}: FormResumeModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-slideUp">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
          Resume Your Work?
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          We found a saved draft from <strong>{savedAge}</strong>.
        </p>

        {/* Progress Info */}
        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-4 mb-6 border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Draft Progress</span>
            <span className="text-sm font-bold text-orange-600">
              Step {currentStep} of {totalSteps}
            </span>
          </div>
          <div className="w-full bg-white rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-red-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onResume}
            className="w-full px-6 py-3.5 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            Resume Draft
          </button>
          <button
            onClick={onStartNew}
            className="w-full px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all duration-200"
          >
            Start New Job Order
          </button>
        </div>

        {/* Info */}
        <p className="text-xs text-gray-500 text-center mt-4">
          Drafts are automatically saved and expire after 24 hours
        </p>
      </div>
    </div>
  );
}
