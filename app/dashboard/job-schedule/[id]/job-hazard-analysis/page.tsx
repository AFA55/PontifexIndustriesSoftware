'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import WorkflowNavigation from '@/components/WorkflowNavigation';
import QuickAccessButtons from '@/components/QuickAccessButtons';

interface HazardTask {
  id: string;
  taskDescription: string;
  potentialHazards: string[];
  hazardControls: string[];
  ppeRequired: string[];
}

interface JHAFormData {
  // Job Info
  jobNumber: string;
  jobLocation: string;
  customer: string;
  datePerformed: string;

  // Crew Info
  crewLeader: string;
  crewMembers: string[];

  // Tasks and Hazards
  tasks: HazardTask[];

  // Additional Controls
  additionalControls: string;

  // Signature
  signature: string;
  signerTitle: string;
  signatureDate: string;
}

const COMMON_HAZARDS = [
  'Struck by falling objects',
  'Slips, trips, and falls',
  'Electrical hazards',
  'Dust inhalation (silica)',
  'Noise exposure',
  'Pinch points/caught between',
  'Overexertion/lifting',
  'Sharp edges/cuts',
  'Flying debris',
  'Vibration exposure',
  'Traffic/moving equipment',
  'Confined space',
  'Heat/cold stress',
  'Chemical exposure'
];

const COMMON_CONTROLS = [
  'Barricade work area',
  'Wear hard hat',
  'Use safety glasses',
  'Wear steel-toed boots',
  'Use hearing protection',
  'Wet cutting methods',
  'Dust collection system',
  'Proper lifting techniques',
  'Use hand/eye protection',
  'Maintain 3-point contact',
  'Lock out/tag out',
  'Ground fault protection',
  'Adequate ventilation',
  'Inspect equipment before use'
];

const COMMON_PPE = [
  'Hard hat',
  'Safety glasses/goggles',
  'Steel-toed boots',
  'Hearing protection',
  'Respirator (N95/P100)',
  'Cut-resistant gloves',
  'Work gloves',
  'High-visibility vest',
  'Knee pads',
  'Safety harness',
  'Face shield',
  'Welding shield'
];

export default function JobHazardAnalysis() {
  const router = useRouter();
  const params = useParams();

  const [formData, setFormData] = useState<JHAFormData>({
    jobNumber: params.id as string || '',
    jobLocation: '',
    customer: '',
    datePerformed: new Date().toISOString().split('T')[0],
    crewLeader: '',
    crewMembers: [''],
    tasks: [{
      id: '1',
      taskDescription: '',
      potentialHazards: [],
      hazardControls: [],
      ppeRequired: []
    }],
    additionalControls: '',
    signature: '',
    signerTitle: 'Crew Leader',
    signatureDate: new Date().toISOString().split('T')[0]
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [checkingSubmission, setCheckingSubmission] = useState(true);

  // Check if JHA already exists for this job
  useEffect(() => {
    checkExistingJHA();
    loadJobInfo();
  }, [params.id]);

  const checkExistingJHA = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCheckingSubmission(false);
        return;
      }

      // Check if JHA exists in pdf_documents table
      const { data, error } = await supabase
        .from('pdf_documents')
        .select('id')
        .eq('job_id', params.id)
        .eq('document_type', 'job_hazard_analysis')
        .maybeSingle();

      if (data) {
        setAlreadySubmitted(true);
      }

      setCheckingSubmission(false);
    } catch (error) {
      console.error('Error checking existing JHA:', error);
      setCheckingSubmission(false);
    }
  };

  const loadJobInfo = async () => {
    try {
      const { data: job, error } = await supabase
        .from('job_orders')
        .select('id, customer, job_location')
        .eq('id', params.id)
        .single();

      if (job && !error) {
        setFormData(prev => ({
          ...prev,
          customer: job.customer || '',
          jobLocation: job.job_location || ''
        }));
      }

      // Get current user for crew leader
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          const fullName = `${profile.first_name} ${profile.last_name}`;
          setFormData(prev => ({
            ...prev,
            crewLeader: fullName,
            crewMembers: [fullName]
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
    }
  };

  const addTask = () => {
    setFormData(prev => ({
      ...prev,
      tasks: [...prev.tasks, {
        id: (prev.tasks.length + 1).toString(),
        taskDescription: '',
        potentialHazards: [],
        hazardControls: [],
        ppeRequired: []
      }]
    }));
  };

  const removeTask = (index: number) => {
    if (formData.tasks.length > 1) {
      setFormData(prev => ({
        ...prev,
        tasks: prev.tasks.filter((_, i) => i !== index)
      }));
      if (currentTaskIndex >= formData.tasks.length - 1) {
        setCurrentTaskIndex(Math.max(0, formData.tasks.length - 2));
      }
    }
  };

  const updateTask = (index: number, field: keyof HazardTask, value: any) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, i) =>
        i === index ? { ...task, [field]: value } : task
      )
    }));
  };

  const toggleArrayItem = (index: number, field: keyof HazardTask, item: string) => {
    const currentArray = formData.tasks[index][field] as string[];
    const newArray = currentArray.includes(item)
      ? currentArray.filter(i => i !== item)
      : [...currentArray, item];

    updateTask(index, field, newArray);
  };

  const addCrewMember = () => {
    setFormData(prev => ({
      ...prev,
      crewMembers: [...prev.crewMembers, '']
    }));
  };

  const updateCrewMember = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      crewMembers: prev.crewMembers.map((member, i) => i === index ? value : member)
    }));
  };

  const removeCrewMember = (index: number) => {
    if (formData.crewMembers.length > 1) {
      setFormData(prev => ({
        ...prev,
        crewMembers: prev.crewMembers.filter((_, i) => i !== index)
      }));
    }
  };

  const submitJHA = async () => {
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      const response = await fetch('/api/job-hazard-analysis/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: params.id,
          formData: formData
        })
      });

      const result = await response.json();

      if (result.success) {
        setAlreadySubmitted(true);

        // Update workflow progress
        await fetch('/api/workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            jobId: params.id,
            completedStep: 'job_hazard_analysis',
            currentStep: 'silica_form'
          })
        });

        router.push(`/dashboard/job-schedule/${params.id}/silica-exposure`);
      } else {
        alert(result.error || 'Failed to save JHA');
      }
    } catch (error) {
      console.error('Error submitting JHA:', error);
      alert('Error submitting JHA. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepComplete = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.crewLeader && formData.crewMembers.filter(m => m).length > 0);
      case 2:
        return formData.tasks.every(task =>
          task.taskDescription &&
          task.potentialHazards.length > 0 &&
          task.hazardControls.length > 0
        );
      case 3:
        return !!formData.signature;
      default:
        return false;
    }
  };

  if (checkingSubmission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
        <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-800">Job Hazard Analysis</h1>
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                Job #{params.id}
              </span>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-green-400 p-8">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">JHA Already Completed</h2>
              <p className="text-gray-600 text-lg">
                The Job Hazard Analysis has already been submitted for this job.
              </p>
            </div>

            <button
              onClick={() => router.push(`/dashboard/job-schedule/${params.id}/silica-exposure`)}
              className="w-full px-8 py-4 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-3 font-bold text-lg shadow-lg"
            >
              Continue to Silica Form
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/job-schedule"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Job Hazard Analysis (JHA)</h1>
                <p className="text-sm text-gray-600">Safety Planning & Risk Assessment</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
              Job #{params.id}
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <WorkflowNavigation jobId={params.id as string} currentStepId="job_hazard_analysis" />
        <QuickAccessButtons jobId={params.id as string} />

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex-1">
              <div className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    currentStep === step
                      ? 'bg-orange-600 text-white shadow-lg scale-110'
                      : isStepComplete(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isStepComplete(step) && currentStep !== step ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step
                  )}
                </div>
                {step < 3 && (
                  <div className={`flex-1 h-1 transition-all ${isStepComplete(step) ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
              <p className="text-xs mt-2 font-medium text-gray-600">
                {step === 1 && 'Crew Info'}
                {step === 2 && 'Hazard Tasks'}
                {step === 3 && 'Review & Sign'}
              </p>
            </div>
          ))}
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Step 1: Crew Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mr-3 text-sm">1</span>
                Crew & Job Information
              </h3>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Job Number</label>
                  <input
                    type="text"
                    value={formData.jobNumber}
                    disabled
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={formData.datePerformed}
                    onChange={(e) => setFormData(prev => ({ ...prev, datePerformed: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer</label>
                <input
                  type="text"
                  value={formData.customer}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Job Location</label>
                <input
                  type="text"
                  value={formData.jobLocation}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Crew Leader *</label>
                <input
                  type="text"
                  value={formData.crewLeader}
                  onChange={(e) => setFormData(prev => ({ ...prev, crewLeader: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-gray-900 font-medium"
                  placeholder="Enter crew leader name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Crew Members *</label>
                {formData.crewMembers.map((member, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={member}
                      onChange={(e) => updateCrewMember(index, e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-gray-900 font-medium"
                      placeholder="Crew member name"
                    />
                    {formData.crewMembers.length > 1 && (
                      <button
                        onClick={() => removeCrewMember(index)}
                        className="px-3 py-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addCrewMember}
                  className="mt-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 font-medium"
                >
                  + Add Crew Member
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Hazard Tasks */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                  <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
                  Task {currentTaskIndex + 1} of {formData.tasks.length}
                </h3>
                <div className="flex gap-2">
                  {formData.tasks.length > 1 && (
                    <button
                      onClick={() => removeTask(currentTaskIndex)}
                      className="px-3 py-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 text-sm font-medium"
                    >
                      Delete Task
                    </button>
                  )}
                  <button
                    onClick={addTask}
                    className="px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium"
                  >
                    + Add Task
                  </button>
                </div>
              </div>

              {/* Task Navigation */}
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {formData.tasks.map((task, index) => (
                  <button
                    key={task.id}
                    onClick={() => setCurrentTaskIndex(index)}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                      currentTaskIndex === index
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Task {index + 1}
                  </button>
                ))}
              </div>

              {/* Task Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Task Description *</label>
                <textarea
                  value={formData.tasks[currentTaskIndex].taskDescription}
                  onChange={(e) => updateTask(currentTaskIndex, 'taskDescription', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-gray-900 font-medium"
                  rows={3}
                  placeholder="Describe the task (e.g., Core drilling through concrete slab)"
                />
              </div>

              {/* Potential Hazards */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Potential Hazards * (Select all that apply)</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto border-2 border-gray-200 rounded-xl p-4">
                  {COMMON_HAZARDS.map((hazard) => (
                    <button
                      key={hazard}
                      onClick={() => toggleArrayItem(currentTaskIndex, 'potentialHazards', hazard)}
                      className={`p-3 rounded-lg border-2 text-left text-sm font-medium transition-all ${
                        formData.tasks[currentTaskIndex].potentialHazards.includes(hazard)
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 hover:border-gray-400 text-gray-700'
                      }`}
                    >
                      {hazard}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hazard Controls */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Hazard Controls * (Select all that apply)</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto border-2 border-gray-200 rounded-xl p-4">
                  {COMMON_CONTROLS.map((control) => (
                    <button
                      key={control}
                      onClick={() => toggleArrayItem(currentTaskIndex, 'hazardControls', control)}
                      className={`p-3 rounded-lg border-2 text-left text-sm font-medium transition-all ${
                        formData.tasks[currentTaskIndex].hazardControls.includes(control)
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 hover:border-gray-400 text-gray-700'
                      }`}
                    >
                      {control}
                    </button>
                  ))}
                </div>
              </div>

              {/* PPE Required */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">PPE Required (Select all that apply)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {COMMON_PPE.map((ppe) => (
                    <button
                      key={ppe}
                      onClick={() => toggleArrayItem(currentTaskIndex, 'ppeRequired', ppe)}
                      className={`p-3 rounded-lg border-2 text-left text-sm font-medium transition-all ${
                        formData.tasks[currentTaskIndex].ppeRequired.includes(ppe)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400 text-gray-700'
                      }`}
                    >
                      {ppe}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Navigation */}
              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setCurrentTaskIndex(Math.max(0, currentTaskIndex - 1))}
                  disabled={currentTaskIndex === 0}
                  className={`px-6 py-3 rounded-xl font-bold ${
                    currentTaskIndex === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  ← Previous Task
                </button>
                <button
                  onClick={() => setCurrentTaskIndex(Math.min(formData.tasks.length - 1, currentTaskIndex + 1))}
                  disabled={currentTaskIndex === formData.tasks.length - 1}
                  className={`px-6 py-3 rounded-xl font-bold ${
                    currentTaskIndex === formData.tasks.length - 1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  Next Task →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Sign */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mr-3 text-sm">3</span>
                Review & Sign
              </h3>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <h4 className="font-bold text-gray-900 text-lg">JHA Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Job:</span>
                    <span className="font-bold text-gray-900">{formData.jobNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Crew Leader:</span>
                    <span className="font-bold text-gray-900">{formData.crewLeader}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Crew Size:</span>
                    <span className="font-bold text-gray-900">{formData.crewMembers.filter(m => m).length} members</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tasks Analyzed:</span>
                    <span className="font-bold text-gray-900">{formData.tasks.length} tasks</span>
                  </div>
                </div>

                {/* Task Summaries */}
                <div className="mt-4 space-y-3">
                  {formData.tasks.map((task, index) => (
                    <div key={task.id} className="bg-white rounded-lg p-4 border-2 border-gray-200">
                      <h5 className="font-bold text-gray-900 mb-2">Task {index + 1}: {task.taskDescription}</h5>
                      <div className="text-xs space-y-1">
                        <p><span className="font-semibold">Hazards:</span> {task.potentialHazards.length} identified</p>
                        <p><span className="font-semibold">Controls:</span> {task.hazardControls.length} implemented</p>
                        <p><span className="font-semibold">PPE:</span> {task.ppeRequired.length} required</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Controls */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Additional Controls or Notes</label>
                <textarea
                  value={formData.additionalControls}
                  onChange={(e) => setFormData(prev => ({ ...prev, additionalControls: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-gray-900 font-medium"
                  rows={4}
                  placeholder="Any additional safety controls or special notes..."
                />
              </div>

              {/* Signature */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Electronic Signature *</label>
                <input
                  type="text"
                  value={formData.signature}
                  onChange={(e) => setFormData(prev => ({ ...prev, signature: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none font-signature text-xl text-gray-900"
                  placeholder="Type your full name to sign"
                />
                <p className="text-xs text-gray-500 mt-1">
                  By signing, you confirm that this JHA accurately reflects the hazards and controls for this job.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              className={`px-6 py-3 rounded-xl font-bold ${
                currentStep === 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
              disabled={currentStep === 1}
            >
              Previous
            </button>

            {currentStep < 3 ? (
              <button
                onClick={() => isStepComplete(currentStep) && setCurrentStep(currentStep + 1)}
                className={`px-6 py-3 rounded-xl font-bold ${
                  isStepComplete(currentStep)
                    ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!isStepComplete(currentStep)}
              >
                Next Step
              </button>
            ) : (
              <button
                onClick={submitJHA}
                disabled={!isStepComplete(3) || isSubmitting}
                className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 ${
                  isStepComplete(3) && !isSubmitting
                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:scale-105'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Save JHA Document
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .font-signature {
          font-family: 'Brush Script MT', cursive;
        }
      `}</style>
    </div>
  );
}
