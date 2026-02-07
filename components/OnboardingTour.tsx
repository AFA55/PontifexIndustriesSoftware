'use client';

import { useState } from 'react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  features?: string[];
}

const OPERATOR_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pontifex Industries! 👋',
    description: 'Your complete job management platform. Let us show you how to navigate your workday with ease.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
      </svg>
    ),
  },
  {
    id: 'clock-in',
    title: '⏰ Clock In/Out',
    description: 'Start your day by clocking in at the shop. Location verification ensures you\'re within 20 feet of the designated area.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    features: [
      'GPS location verification',
      'Automatic time tracking',
      'View current status'
    ],
  },
  {
    id: 'job-schedule',
    title: '📋 Job Schedule & Workflow',
    description: 'Access your assigned jobs and follow the complete workflow from route planning to customer signature.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    features: [
      '📍 En Route tracking',
      '🚧 In-progress updates',
      '✂️ Work performed logging',
      '📸 Photo documentation',
      '✍️ Customer signatures'
    ],
  },
  {
    id: 'quick-access',
    title: '⚡ Quick Access Features',
    description: 'Use these powerful tools throughout your job workflow to stay organized and efficient.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    features: [
      '📍 View job location & get directions',
      '📞 Call customer contact',
      '⏱️ Track standby time (when waiting)'
    ],
  },
  {
    id: 'job-feedback',
    title: '⭐ Job Feedback System',
    description: 'After completing work, rate the job difficulty and site access to help improve future planning.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    features: [
      '😊 Rate job difficulty (1-5)',
      '✅ Rate site access (1-5)',
      '📝 Add optional notes',
      '📊 Data helps improve estimates'
    ],
  },
  {
    id: 'tools',
    title: '🔧 Tools & Equipment',
    description: 'Track equipment usage, report damage, and manage your gear inventory.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    features: [
      '📦 View assigned equipment',
      '⚠️ Report damage instantly',
      '🔪 Track blade usage'
    ],
  },
  {
    id: 'timecard',
    title: '📊 Timecard & Hours',
    description: 'Review your hours worked, view attendance history, and track your weekly schedule.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    features: [
      '📅 Weekly hour breakdown',
      '✅ Attendance tracking',
      '💰 Overtime monitoring'
    ],
  },
  {
    id: 'complete',
    title: "You're Ready to Go! 🚀",
    description: 'You now have everything you need to efficiently manage your workday. Have questions? Contact your supervisor anytime.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

interface OnboardingTourProps {
  userId: string;
  onComplete: () => void;
}

export default function OnboardingTour({ userId, onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const step = OPERATOR_STEPS[currentStep];
  const isLastStep = currentStep === OPERATOR_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      // Mark as completed in localStorage
      localStorage.setItem(`pontifex-onboarding-${userId}`, 'completed');
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

  const handleSkip = () => {
    localStorage.setItem(`pontifex-onboarding-${userId}`, 'skipped');
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-fade-in">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-600">
              Step {currentStep + 1} of {OPERATOR_STEPS.length}
            </span>
            {!isLastStep && (
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Skip Tour
              </button>
            )}
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-red-500 transition-all duration-300 ease-out"
              style={{ width: `${((currentStep + 1) / OPERATOR_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-red-50 flex items-center justify-center text-blue-600">
            {step.icon}
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h2>
          <p className="text-gray-600 text-base leading-relaxed">{step.description}</p>
        </div>

        {/* Features list */}
        {step.features && (
          <div className="bg-gradient-to-br from-blue-50 to-red-50 rounded-2xl p-5 mb-6">
            <ul className="space-y-2">
              {step.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {!isFirstStep && (
            <button
              onClick={handleBack}
              className="flex-1 py-3 px-4 text-gray-600 font-semibold rounded-xl border-2 border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className={`py-3 px-6 bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] ${
              isFirstStep ? 'flex-1' : 'flex-[2]'
            }`}
          >
            {isLastStep ? '✓ Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
