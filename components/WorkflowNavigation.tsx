'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Circle, Lock } from 'lucide-react';

interface WorkflowStep {
  id: string;
  name: string;
  order: number;
  completed: boolean;
  current: boolean;
  url: string;
}

interface WorkflowNavigationProps {
  jobId: string;
  currentStepId: string;
  onStepComplete?: (stepId: string) => void;
}

export default function WorkflowNavigation({
  jobId,
  currentStepId,
  onStepComplete,
}: WorkflowNavigationProps) {
  const router = useRouter();
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);

  const STEP_DEFINITIONS: Omit<WorkflowStep, 'completed' | 'current'>[] = [
    { id: 'work_order_agreement', name: 'Agreement', order: 1, url: `/dashboard/job-schedule/${jobId}/work-order-agreement` },
    { id: 'equipment_checklist', name: 'Equipment', order: 2, url: `/dashboard/job-schedule/${jobId}/start-route` },
    { id: 'in_route', name: 'In Route', order: 3, url: `/dashboard/job-schedule/${jobId}/in-route` },
    { id: 'liability_release', name: 'Liability', order: 4, url: `/dashboard/job-schedule/${jobId}/liability-release` },
    { id: 'silica_form', name: 'Silica Form', order: 5, url: `/dashboard/job-schedule/${jobId}/silica-exposure` },
    { id: 'work_performed', name: 'Work Log', order: 6, url: `/dashboard/job-schedule/${jobId}/work-performed` },
    { id: 'pictures', name: 'Pictures', order: 7, url: `/dashboard/job-schedule/${jobId}/pictures` },
    { id: 'customer_signature', name: 'Signature', order: 8, url: `/dashboard/job-schedule/${jobId}/customer-signature` },
    { id: 'job_complete', name: 'Complete', order: 9, url: `/dashboard/job-schedule/${jobId}/complete` },
  ];

  useEffect(() => {
    fetchWorkflowProgress();
  }, [jobId, currentStepId]);

  const fetchWorkflowProgress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const workflow = result.data;

          // Map step definitions to include completion status
          const updatedSteps = STEP_DEFINITIONS.map(step => ({
            ...step,
            completed: getStepCompletion(step.id, workflow),
            current: step.id === currentStepId,
          }));

          setSteps(updatedSteps);
        }
      }
    } catch (error) {
      console.error('Error fetching workflow progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStepCompletion = (stepId: string, workflow: any): boolean => {
    switch (stepId) {
      case 'work_order_agreement':
        return workflow.work_order_signed || false;
      case 'equipment_checklist':
        return workflow.equipment_checklist_completed || false;
      case 'in_route':
        return workflow.sms_sent || false;
      case 'liability_release':
        return workflow.liability_release_signed || false;
      case 'silica_form':
        return workflow.silica_form_completed || false;
      case 'work_performed':
        return workflow.work_performed_completed || false;
      case 'pictures':
        return workflow.pictures_submitted || false;
      case 'customer_signature':
        return workflow.customer_signature_received || false;
      case 'job_complete':
        return workflow.job_completed || false;
      default:
        return false;
    }
  };

  const handleStepClick = (step: WorkflowStep) => {
    // Can navigate to any completed step or current step
    // Equipment checklist cannot be re-done once completed
    if (step.id === 'equipment_checklist' && step.completed && !step.current) {
      // Cannot go back to equipment checklist
      return;
    }

    // In Route can be viewed after completion (page handles state safely)
    if (step.completed || step.current) {
      router.push(step.url);
    }
  };

  const getCurrentStepIndex = () => {
    return steps.findIndex(s => s.current);
  };

  const canNavigatePrevious = () => {
    const currentIndex = getCurrentStepIndex();
    return currentIndex > 0;
  };

  const canNavigateNext = () => {
    const currentIndex = getCurrentStepIndex();
    return currentIndex < steps.length - 1 && steps[currentIndex]?.completed;
  };

  const navigatePrevious = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      const previousStep = steps[currentIndex - 1];
      router.push(previousStep.url);
    }
  };

  const navigateNext = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1];
      router.push(nextStep.url);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-2 py-1">
            <div className="h-2 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex-1 flex items-center">
              {/* Step Circle */}
              <button
                onClick={() => handleStepClick(step)}
                disabled={!step.completed && !step.current}
                className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                  step.completed
                    ? 'bg-green-500 border-green-500 cursor-pointer hover:bg-green-600'
                    : step.current
                    ? 'bg-blue-500 border-blue-500 animate-pulse'
                    : 'bg-gray-200 border-gray-300 cursor-not-allowed'
                }`}
              >
                {step.completed ? (
                  <CheckCircle2 className="w-6 h-6 text-white" />
                ) : step.current ? (
                  <Circle className="w-6 h-6 text-white fill-current" />
                ) : (
                  <Lock className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    step.completed ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Labels - Now Clickable */}
        <div className="flex items-center justify-between mt-2">
          {steps.map((step) => {
            const canClick = (step.completed || step.current) &&
                            !(step.id === 'equipment_checklist' && step.completed && !step.current);

            return (
              <button
                key={`label-${step.id}`}
                onClick={() => canClick && handleStepClick(step)}
                disabled={!canClick}
                className={`flex-1 text-center py-1 px-2 rounded-lg transition-all ${
                  canClick ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed'
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    step.current
                      ? 'text-blue-600 font-bold'
                      : step.completed
                      ? 'text-green-600 hover:text-green-700'
                      : 'text-gray-400'
                  }`}
                >
                  {step.name}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3">
        <button
          onClick={navigatePrevious}
          disabled={!canNavigatePrevious()}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
            canNavigatePrevious()
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-gray-50 text-gray-400 cursor-not-allowed'
          }`}
        >
          ← Previous Step
        </button>

        <button
          onClick={() => router.push('/dashboard/job-schedule')}
          className="flex-1 px-4 py-3 rounded-xl font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
        >
          Back to Schedule
        </button>

        <button
          onClick={navigateNext}
          disabled={!canNavigateNext()}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
            canNavigateNext()
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-50 text-gray-400 cursor-not-allowed'
          }`}
        >
          Next Step →
        </button>
      </div>
    </div>
  );
}
