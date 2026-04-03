'use client';

import React, { useState } from 'react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  features?: string[];
}

const OPERATOR_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: '👋 Welcome to Your Field Platform!',
    description:
      'Everything you need to run your workday — from your job list to clocking out — lives right here. This quick tour covers what\'s new and how it all works.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
      </svg>
    ),
  },
  {
    id: 'my-jobs',
    title: '📋 My Jobs — Your Daily View',
    description:
      'My Jobs is your home base. See your assigned jobs for today. Tap a job to get started. Use the date bar to look ahead or back.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    features: [
      '📅 Swipe the date bar to look ahead or back',
      '🏷️ Status badge shows where each job is in the workflow',
      '📍 Tap any job card to open its details and get started',
      '🔄 Multi-day jobs carry over automatically day to day',
    ],
  },
  {
    id: 'job-workflow',
    title: '🔄 The Daily Job Workflow',
    description:
      'Every job moves through the same five steps. Work through them in order and the system tracks everything automatically.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    features: [
      '1️⃣  My Jobs — tap a job to open its detail',
      '2️⃣  En Route — tap when you\'re leaving for the site',
      '3️⃣  Jobsite — tap when you arrive on site',
      '4️⃣  Work Performed — log everything you did today',
      '5️⃣  Day Complete — wrap up, sign off, or complete the job',
    ],
  },
  {
    id: 'log-work',
    title: '📝 Logging Your Work',
    description:
      'The Work Performed page is where you record everything you did on site. Search for work items, tap to add them, attach photos, and leave notes.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    features: [
      '🔍 Search by work type (e.g., "core drill", "wall saw")',
      '📸 Attach job-site photos directly from this page',
      '🎙️ Use voice notes to quickly describe what you did',
      '✅ Tap "Done — Proceed to Wrap Up" when you\'re finished logging',
    ],
  },
  {
    id: 'complete-job',
    title: '✅ Completing a Job',
    description:
      'On your final scheduled day, tap "Complete Job" instead of "Done for Today". Add any closing notes for your supervisor — that\'s it. Your supervisor will review and approve.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    features: [
      '🗓️ On earlier days of multi-day jobs, tap "Done for Today"',
      '🏁 On the last day, tap "Complete Job" to send for approval',
      '💬 Add closing notes for your supervisor before submitting',
      '🔔 Your supervisor is notified automatically once you submit',
    ],
  },
  {
    id: 'timecard',
    title: '⏰ Timecard & Clock In/Out',
    description:
      'Use the Timecard page to clock in at the start of your day, clock out when you\'re done, and review your hours for the week. GPS verification confirms you\'re at the right location.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    features: [
      '📍 GPS location verified on every clock-in',
      '⏱️ Hours tracked automatically while you work',
      '📅 Weekly breakdown: Mon–Sun hours at a glance',
      '💰 Overtime flagged automatically',
      '🔔 You\'ll get a reminder if you forget to clock out',
    ],
  },
  {
    id: 'quick-tips',
    title: '💡 Quick Tips',
    description:
      'A few handy things to know that will save you time every day.',
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    features: [
      '📸 Take job-site photos on the Work Performed page — they attach to your dispatch ticket',
      '🔔 Tap the bell icon anytime to check notifications from your supervisor',
      '🏖️ Request time off directly from the sidebar — no paperwork needed',
      '📋 JSA (Job Safety Analysis) forms are under Tools in the sidebar',
      '❓ Questions? Tap your profile or contact your supervisor through the app',
    ],
  },
  {
    id: 'complete',
    title: "🚀 You're All Set!",
    description:
      "You now know everything you need to manage your workday. Start with My Jobs, follow the 5-step workflow, and log your work as you go. Have questions? Your supervisor is a tap away.",
    icon: (
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
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
      localStorage.setItem(`patriot-onboarding-${userId}`, 'completed');
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
    localStorage.setItem(`patriot-onboarding-${userId}`, 'skipped');
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
              className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${((currentStep + 1) / OPERATOR_STEPS.length) * 100}%` }}
            />
          </div>
          {/* Step dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {OPERATOR_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`rounded-full transition-all duration-200 ${
                  idx === currentStep
                    ? 'w-4 h-2 bg-purple-600'
                    : idx < currentStep
                    ? 'w-2 h-2 bg-purple-300'
                    : 'w-2 h-2 bg-gray-200'
                }`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center text-purple-600">
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
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-5 mb-6">
            <ul className="space-y-2">
              {step.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-purple-500 mt-0.5">•</span>
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
            className={`py-3 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] ${
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
