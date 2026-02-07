'use client';

import { useState } from 'react';
import { ReactElement } from 'react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: ReactElement;
  features?: string[];
  badge?: string;
  badgeColor?: string;
}

const ADMIN_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pontifex Industries',
    description: 'Your complete operations management platform for concrete cutting and coring services.',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'dispatch',
    title: 'Dispatch & Scheduling',
    description: 'Create and manage job orders with powerful scheduling tools.',
    badge: 'Core Feature',
    badgeColor: 'bg-orange-100 text-orange-700',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    features: [
      'Create job orders with detailed specifications',
      'Assign operators and equipment',
      'Schedule jobs with calendar integration',
      'Track job status in real-time'
    ],
  },
  {
    id: 'schedule-board',
    title: 'Schedule Board',
    description: 'Visualize and manage operator schedules with automated notifications.',
    badge: 'Planning',
    badgeColor: 'bg-purple-100 text-purple-700',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    features: [
      'Daily and weekly schedule views',
      'Automated email notifications',
      'Shop arrival time calculations',
      'Operator availability tracking'
    ],
  },
  {
    id: 'project-board',
    title: 'Project Status Board',
    description: 'Monitor live job status with color-coded progress tracking.',
    badge: 'Analytics',
    badgeColor: 'bg-red-100 text-red-700',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    features: [
      'Real-time job status updates',
      'Upcoming jobs preview',
      'Performance analytics',
      'Timeline tracking'
    ],
  },
  {
    id: 'team',
    title: 'Team & Access Management',
    description: 'Manage operator profiles, skills, and system access controls.',
    badge: 'People',
    badgeColor: 'bg-blue-100 text-blue-700',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    features: [
      'Operator skill tracking and certifications',
      'Role-based access control',
      'Performance ratings and metrics',
      'Access request approvals'
    ],
  },
  {
    id: 'completed',
    title: 'Completed Job Tickets',
    description: 'Review finished work with customer signatures and documentation.',
    badge: 'Records',
    badgeColor: 'bg-green-100 text-green-700',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    features: [
      'Digital customer signatures',
      'Liability release documents',
      'Job feedback and ratings',
      'Photo documentation'
    ],
  },
  {
    id: 'ready',
    title: "You're All Set!",
    description: 'Start managing your operations with confidence. Access any feature from the dashboard.',
    icon: (
      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

interface AdminOnboardingTourProps {
  userId: string;
  onComplete: () => void;
}

export default function AdminOnboardingTour({ userId, onComplete }: AdminOnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const step = ADMIN_STEPS[currentStep];
  const isLastStep = currentStep === ADMIN_STEPS.length - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / ADMIN_STEPS.length) * 100;

  const saveOnboardingStatus = async (completed: boolean, skipped: boolean) => {
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'admin',
          completed,
          skipped,
        }),
      });
    } catch (error) {
      console.error('Failed to save onboarding status:', error);
    }
  };

  const handleNext = async () => {
    if (isLastStep) {
      await saveOnboardingStatus(true, false);
      setIsVisible(false);
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await saveOnboardingStatus(false, true);
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/70 to-black/60 backdrop-blur-md"
        onClick={handleSkip}
      />

      {/* Modal Card */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-50 to-blue-50 px-8 pt-10 pb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full uppercase tracking-wide">
                Step {currentStep + 1} of {ADMIN_STEPS.length}
              </span>
              {step.badge && (
                <span className={`px-3 py-1 ${step.badgeColor} text-xs font-bold rounded-full uppercase tracking-wide`}>
                  {step.badge}
                </span>
              )}
            </div>
            {!isLastStep && (
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                Skip Tour
              </button>
            )}
          </div>

          {/* Icon Container */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Animated rings */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full animate-ping opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full animate-pulse opacity-30" />

              {/* Icon background */}
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl">
                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-blue-600">
                  {step.icon}
                </div>
              </div>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">
            {step.title}
          </h2>
          <p className="text-gray-600 text-center text-lg leading-relaxed max-w-xl mx-auto">
            {step.description}
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {step.features && (
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl p-6 border border-blue-100">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
                Key Capabilities
              </h3>
              <ul className="space-y-3">
                {step.features.map((feature, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-gray-700"
                    style={{
                      animation: `slideInLeft 0.3s ease-out ${idx * 0.1}s both`
                    }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLastStep && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-green-900 mb-2">Quick Tips</h3>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• Use the dashboard cards to navigate to different modules</li>
                    <li>• Hover over cards to see additional details</li>
                    <li>• Access operator view anytime from the header</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 px-8 py-6 flex gap-4">
          {!isFirstStep && (
            <button
              onClick={handleBack}
              className="flex-1 py-3.5 px-6 text-gray-700 font-semibold rounded-xl border-2 border-gray-300 hover:border-gray-400 hover:bg-white transition-all duration-200"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </span>
            </button>
          )}
          <button
            onClick={handleNext}
            className={`${isFirstStep ? 'flex-1' : 'flex-[2]'} group relative py-3.5 px-6 bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 hover:from-blue-700 hover:via-purple-700 hover:to-red-700 text-white font-bold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl overflow-hidden`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            <span className="relative flex items-center justify-center gap-2">
              {isLastStep ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Custom Animations */}
      <style jsx>{`
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes ping {
          75%, 100% {
            transform: scale(1.1);
            opacity: 0;
          }
        }

        .animate-ping {
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
