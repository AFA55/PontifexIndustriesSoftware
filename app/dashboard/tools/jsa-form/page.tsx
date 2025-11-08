'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';

interface HazardControl {
  taskStep: string;
  potentialHazards: string[];
  controlMeasures: string[];
}

interface JSAForm {
  // Header Info
  projectName: string;
  location: string;
  date: string;
  supervisor: string;
  crewMembers: string[];

  // Job Details
  jobDescription: string;
  equipmentUsed: string[];

  // Required PPE
  requiredPPE: string[];

  // Hazard Analysis Steps
  hazardControls: HazardControl[];

  // Signatures
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
}

const commonPPE = [
  'Hard Hat',
  'Safety Glasses/Goggles',
  'Hearing Protection',
  'Dust Mask/Respirator',
  'Safety Boots',
  'High-Visibility Vest',
  'Gloves',
  'Face Shield',
  'Fall Protection Harness',
  'Protective Clothing'
];

const commonHazards = [
  'Silica Dust Exposure',
  'Noise Exposure',
  'Electrical Hazards',
  'Moving Equipment',
  'Sharp Objects/Tools',
  'Slips, Trips, Falls',
  'Heavy Lifting',
  'Confined Spaces',
  'Vehicle Traffic',
  'Water Hazards',
  'Overhead Work',
  'Hot Surfaces/Equipment'
];

export default function JSAFormPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<JSAForm>({
    projectName: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    supervisor: '',
    crewMembers: [],
    jobDescription: '',
    equipmentUsed: [],
    requiredPPE: [],
    hazardControls: [
      { taskStep: '', potentialHazards: [], controlMeasures: [] }
    ],
    preparedBy: getCurrentUser()?.name || '',
    reviewedBy: '',
    approvedBy: ''
  });

  const [newCrewMember, setNewCrewMember] = useState('');
  const [newEquipment, setNewEquipment] = useState('');

  const handleInputChange = (field: keyof JSAForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addCrewMember = () => {
    if (newCrewMember.trim()) {
      setFormData(prev => ({
        ...prev,
        crewMembers: [...prev.crewMembers, newCrewMember.trim()]
      }));
      setNewCrewMember('');
    }
  };

  const removeCrewMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      crewMembers: prev.crewMembers.filter((_, i) => i !== index)
    }));
  };

  const addEquipment = () => {
    if (newEquipment.trim()) {
      setFormData(prev => ({
        ...prev,
        equipmentUsed: [...prev.equipmentUsed, newEquipment.trim()]
      }));
      setNewEquipment('');
    }
  };

  const removeEquipment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      equipmentUsed: prev.equipmentUsed.filter((_, i) => i !== index)
    }));
  };

  const togglePPE = (ppe: string) => {
    setFormData(prev => ({
      ...prev,
      requiredPPE: prev.requiredPPE.includes(ppe)
        ? prev.requiredPPE.filter(p => p !== ppe)
        : [...prev.requiredPPE, ppe]
    }));
  };

  const addHazardControlStep = () => {
    setFormData(prev => ({
      ...prev,
      hazardControls: [...prev.hazardControls, { taskStep: '', potentialHazards: [], controlMeasures: [] }]
    }));
  };

  const updateHazardControl = (index: number, field: keyof HazardControl, value: any) => {
    setFormData(prev => ({
      ...prev,
      hazardControls: prev.hazardControls.map((hc, i) =>
        i === index ? { ...hc, [field]: value } : hc
      )
    }));
  };

  const removeHazardControlStep = (index: number) => {
    if (formData.hazardControls.length > 1) {
      setFormData(prev => ({
        ...prev,
        hazardControls: prev.hazardControls.filter((_, i) => i !== index)
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('JSA Form Submitted:', formData);
    alert('Job Safety Analysis form submitted successfully!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Global input text color fix */}
      <style jsx global>{`
        input[type="text"],
        input[type="date"],
        input[type="email"],
        input[type="tel"],
        input[type="number"],
        input[type="password"],
        input[type="search"],
        textarea,
        select,
        option {
          color: #111827 !important;
        }
        input::placeholder,
        textarea::placeholder {
          color: #9ca3af !important;
        }
        input:disabled,
        select:disabled,
        textarea:disabled {
          color: #6b7280 !important;
          background-color: #f3f4f6 !important;
        }
      `}</style>

      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.back()}
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent">
                Job Safety Analysis (JSA)
              </h1>
              <p className="text-gray-600 font-medium mt-1">Identify hazards and establish safety controls</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto space-y-6">
          {/* Basic Information */}
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Project Information
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Project/Job Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.projectName}
                  onChange={(e) => handleInputChange('projectName', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Enter project name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Location/Site Address *
                </label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Enter site location"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Supervisor *
                </label>
                <input
                  type="text"
                  required
                  value={formData.supervisor}
                  onChange={(e) => handleInputChange('supervisor', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Supervisor name"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Job Description *
                </label>
                <textarea
                  required
                  value={formData.jobDescription}
                  onChange={(e) => handleInputChange('jobDescription', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors resize-none"
                  placeholder="Describe the work to be performed..."
                />
              </div>
            </div>
          </div>

          {/* Crew Members */}
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              Crew Members
            </h2>

            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={newCrewMember}
                onChange={(e) => setNewCrewMember(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCrewMember())}
                className="flex-1 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                placeholder="Enter crew member name"
              />
              <button
                type="button"
                onClick={addCrewMember}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl font-semibold transition-all shadow-md"
              >
                + Add
              </button>
            </div>

            <div className="space-y-2">
              {formData.crewMembers.map((member, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border-2 border-purple-200">
                  <span className="font-medium text-purple-800">{member}</span>
                  <button
                    type="button"
                    onClick={() => removeCrewMember(idx)}
                    className="p-1 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {formData.crewMembers.length === 0 && (
                <p className="text-gray-500 text-center py-4">No crew members added yet</p>
              )}
            </div>
          </div>

          {/* Equipment Used */}
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              Equipment/Tools Used
            </h2>

            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEquipment())}
                className="flex-1 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors"
                placeholder="Enter equipment or tool name"
              />
              <button
                type="button"
                onClick={addEquipment}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold transition-all shadow-md"
              >
                + Add
              </button>
            </div>

            <div className="space-y-2">
              {formData.equipmentUsed.map((equip, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border-2 border-orange-200">
                  <span className="font-medium text-orange-800">{equip}</span>
                  <button
                    type="button"
                    onClick={() => removeEquipment(idx)}
                    className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {formData.equipmentUsed.length === 0 && (
                <p className="text-gray-500 text-center py-4">No equipment added yet</p>
              )}
            </div>
          </div>

          {/* Required PPE */}
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              Required Personal Protective Equipment (PPE)
            </h2>

            <div className="grid md:grid-cols-3 gap-3">
              {commonPPE.map(ppe => (
                <button
                  key={ppe}
                  type="button"
                  onClick={() => togglePPE(ppe)}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                    formData.requiredPPE.includes(ppe)
                      ? 'bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-200'
                      : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                      formData.requiredPPE.includes(ppe)
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-white border-gray-300'
                    }`}>
                      {formData.requiredPPE.includes(ppe) && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`font-semibold text-sm ${
                      formData.requiredPPE.includes(ppe) ? 'text-emerald-800' : 'text-gray-700'
                    }`}>
                      {ppe}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Hazard Analysis */}
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              Hazard Analysis & Control Measures
            </h2>

            <div className="space-y-6">
              {formData.hazardControls.map((hc, idx) => (
                <div key={idx} className="border-2 border-red-200 rounded-2xl p-6 bg-red-50/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                      <span className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-sm">
                        {idx + 1}
                      </span>
                      Task Step {idx + 1}
                    </h3>
                    {formData.hazardControls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeHazardControlStep(idx)}
                        className="p-2 hover:bg-red-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Describe Task Step *
                      </label>
                      <textarea
                        required
                        value={hc.taskStep}
                        onChange={(e) => updateHazardControl(idx, 'taskStep', e.target.value)}
                        rows={2}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none transition-colors resize-none"
                        placeholder="e.g., Set up core drilling equipment"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Potential Hazards *
                      </label>
                      <textarea
                        required
                        value={hc.potentialHazards.join('\n')}
                        onChange={(e) => updateHazardControl(idx, 'potentialHazards', e.target.value.split('\n').filter(h => h.trim()))}
                        rows={3}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none transition-colors resize-none"
                        placeholder="List hazards, one per line&#10;e.g.,&#10;Silica dust exposure&#10;Noise exposure&#10;Electrical shock"
                      />
                      <p className="text-xs text-gray-500 mt-1">Common hazards: {commonHazards.slice(0, 5).join(', ')}...</p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Control Measures/Procedures *
                      </label>
                      <textarea
                        required
                        value={hc.controlMeasures.join('\n')}
                        onChange={(e) => updateHazardControl(idx, 'controlMeasures', e.target.value.split('\n').filter(c => c.trim()))}
                        rows={4}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none transition-colors resize-none"
                        placeholder="List control measures, one per line&#10;e.g.,&#10;Use wet cutting methods&#10;Wear N95 respirator&#10;Ensure proper ventilation&#10;Use GFCI protection"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addHazardControlStep}
                className="w-full py-4 bg-gradient-to-r from-red-100 to-red-200 hover:from-red-200 hover:to-red-300 border-2 border-red-300 text-red-800 rounded-xl font-bold transition-all shadow-md hover:shadow-lg"
              >
                + Add Another Task Step
              </button>
            </div>
          </div>

          {/* Signatures */}
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              Approvals & Signatures
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Prepared By *
                </label>
                <input
                  type="text"
                  required
                  value={formData.preparedBy}
                  onChange={(e) => handleInputChange('preparedBy', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reviewed By
                </label>
                <input
                  type="text"
                  value={formData.reviewedBy}
                  onChange={(e) => handleInputChange('reviewedBy', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  placeholder="Reviewer name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Approved By
                </label>
                <input
                  type="text"
                  value={formData.approvedBy}
                  onChange={(e) => handleInputChange('approvedBy', e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  placeholder="Approver name"
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-bold text-yellow-800">Important Notice</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    All crew members listed above must review this JSA and acknowledge understanding before beginning work.
                    This document must be available on-site at all times during the job.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-4">
            <Link
              href="/dashboard/tools"
              className="px-8 py-4 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-800 font-bold rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-md"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="px-8 py-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-lg hover:shadow-xl"
            >
              Submit JSA Form
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
