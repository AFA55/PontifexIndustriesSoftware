'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, AlertCircle } from 'lucide-react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceOutput } from '@/hooks/useVoiceOutput';
import { VoiceMicButton } from '@/components/ui/VoiceMicButton';
import { PontiBotReviewCard } from '@/components/PontiBotReviewCard';
import {
  buildScript,
  createInitialData,
  type PontiBotData,
  type ConversationStep,
  type ParseResult,
} from '@/lib/pontibot-script';
import { bulkExtract, buildConfirmationPrompt, bulkExtractStep2, buildStep2ConfirmationPrompt } from '@/lib/bulk-extractor';
import { getChangedFieldsForStep } from '@/lib/pontibot-field-map';

// ============================================================
// Types
// ============================================================

interface PontiBotOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  adminName: string;
  operators: Array<{ id: string; full_name: string }>;
  admins: Array<{ id: string; full_name: string }>;
  /** Called when PontiBot updates data — enables real-time form sync */
  onDataChange?: (changedFields: string[], data: PontiBotData) => void;
  /** Called when PontiBot advances to a new step — enables form page auto-advance */
  onFormStepChange?: (formStep: number) => void;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: number;
}

type Phase = 'conversation' | 'review';

// ============================================================
// Helper: generate description matching dispatch form format
// ============================================================

function generateDescription(data: PontiBotData): string {
  let desc = '';

  // Job site conditions
  if (!data.jobTypes.includes('SHOP TICKET')) {
    desc += `JOB SITE CONDITIONS:\n`;
    desc += `• Truck Parking: ${data.truck_parking === 'close' ? 'Close (Under 300 ft)' : 'Far (Unload & Carry Equipment)'}\n`;
    desc += `• Work Environment: ${data.work_environment === 'indoor' ? 'Indoor' : 'Outdoor'}\n`;
    desc += `• Site Cleanliness: ${data.site_cleanliness}/10\n`;
    desc += `• Job Difficulty: ${data.difficulty_rating}/10\n`;
    desc += `---\n`;
  }

  data.jobTypes.forEach((jobType, idx) => {
    if (jobType === 'SHOP TICKET') {
      desc += `SHOP TICKET\n${data.shopTicketDescription}\n`;
      return;
    }

    const details = data.jobTypeDetails[jobType];
    if (!details) {
      desc += `${jobType}\n`;
      return;
    }

    // Core drilling
    if (jobType === 'CORE DRILLING') {
      const locs = details.locations;
      desc += locs && locs.length > 0 ? `CORE DRILLING ON ${locs.join('/')}\n` : `CORE DRILLING\n`;
      if (details.accessibility) desc += `Accessibility Ranking: ${details.accessibility}\n`;
      if (details.holes && Array.isArray(details.holes)) {
        details.holes.forEach((h: any) => {
          let line = `${h.quantity || '?'} holes @ ${h.diameter || '?'}" diameter x ${h.depth || '?'}" deep`;
          if (h.aboveFiveFeet) line += ` (Above 5ft - ${h.ladderLiftOption || 'Ladder/Lift Required'})`;
          desc += line + '\n';
        });
      }
    }

    // Wall cutting
    if (jobType === 'WALL CUTTING') {
      desc += `WALL SAWING - CUTTING OPENINGS IN WALLS\n`;
      if (details.material) desc += `Material Type: ${details.material}${details.materialOther ? ` (${details.materialOther})` : ''}\n`;
      if (details.overcutsAllowed) desc += `Overcuts Allowed: ${details.overcutsAllowed}\n`;
      if (details.cuts && Array.isArray(details.cuts)) {
        details.cuts.forEach((cut: any) => {
          if (cut.linearCutOnly) {
            desc += `${cut.linearFeet || '?'} LF x ${cut.thickness || '?'}" thick\n`;
          } else {
            const qty = cut.quantity || '1';
            const areaText = qty === '1' ? '1 area' : `${qty} areas`;
            let line = `${areaText} - Opening: ${cut.openingSize || '?'} - ${cut.length || '?'}' L x ${cut.width || '?'}' W x ${cut.thickness || '?'}" thick`;
            if (cut.removing) {
              line += ` | REMOVING MATERIAL`;
              if (cut.equipment) line += ` - Equipment: ${cut.equipment}`;
            }
            desc += line + '\n';
          }
        });
      }
    }

    // Slab sawing
    if (jobType === 'SLAB SAWING') {
      desc += `SLAB SAWING - CUTTING CONCRETE FLOORS/SLABS\n`;
      if (details.material) desc += `Material: ${details.material}\n`;
      if (details.overcutsAllowed) desc += `Overcuts Allowed: ${details.overcutsAllowed}\n`;
      if (details.cuts && Array.isArray(details.cuts)) {
        details.cuts.forEach((cut: any) => {
          if (cut.cutType === 'Areas') {
            const qty = cut.quantity || '1';
            let line = `${qty === '1' ? '1 area' : `${qty} areas`} - ${cut.length || '?'}' L x ${cut.width || '?'}' W x ${cut.thickness || '?'}" thick`;
            if (cut.removing) {
              line += ` | REMOVING MATERIAL`;
              if (cut.equipment) line += ` - Equipment: ${Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment}`;
            }
            desc += line + '\n';
          } else {
            let line = `${cut.linearFeet || '?'} LF x ${cut.thickness || '?'}" thick`;
            if (cut.removing) {
              line += ` | REMOVING MATERIAL`;
              if (cut.equipment) line += ` - Equipment: ${Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment}`;
            }
            desc += line + '\n';
          }
        });
      }
    }

    // Hand sawing
    if (jobType === 'HAND SAWING') {
      desc += `HAND SAWING - MANUAL CUTTING OPERATIONS\n`;
      if (details.material) desc += `Material Type: ${details.material}\n`;
      if (details.locations && Array.isArray(details.locations)) desc += `Location Type: ${details.locations.join(', ')}\n`;
      if (details.overcutsAllowed) desc += `Overcuts Allowed: ${details.overcutsAllowed}\n`;
      if (details.cuts && Array.isArray(details.cuts)) {
        details.cuts.forEach((cut: any) => {
          if (cut.cutType === 'Areas') {
            const qty = cut.quantity || '1';
            let line = `${qty === '1' ? '1 area' : `${qty} areas`} - ${cut.length || '?'}' L x ${cut.width || '?'}' W x ${cut.thickness || '?'}" thick`;
            if (cut.removing) {
              line += ` | REMOVING MATERIAL`;
              if (cut.equipment) line += ` - Equipment: ${Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment}`;
            }
            desc += line + '\n';
          } else {
            let line = `${cut.linearFeet || '?'} LF x ${cut.thickness || '?'}" deep`;
            if (cut.removing) {
              line += ` | REMOVING MATERIAL`;
              if (cut.equipment) line += ` - Equipment: ${Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment}`;
            }
            desc += line + '\n';
          }
        });
      }
    }

    // Wire sawing
    if (jobType === 'WIRE SAWING') {
      desc += `WIRE SAWING - CUTTING LARGE STRUCTURES\n`;
      if (details.cuts && Array.isArray(details.cuts)) {
        details.cuts.forEach((cut: any) => { if (cut.description) desc += `${cut.description}\n`; });
      }
    }

    // Concrete demolition
    if (jobType === 'CONCRETE DEMOLITION') {
      desc += `CONCRETE DEMOLITION - BREAKING AND REMOVING CONCRETE\n`;
      if (details.methods && Array.isArray(details.methods)) desc += `Demolition Methods: ${details.methods.join(', ')}\n`;
      if (details.removal) desc += `Removal Required?: ${details.removal}\n`;
      if (details.areas && Array.isArray(details.areas)) {
        details.areas.forEach((area: any, i: number) => {
          desc += `Area ${i + 1}: ${area.areaVolume || '?'} @ ${area.thickness || '?'}" - ${area.material || '?'}${area.materialOther ? ` (${area.materialOther})` : ''}\n`;
        });
      }
    }

    // GPR
    if (jobType === 'GPR SCANNING') {
      desc += `GPR SCANNING - GROUND PENETRATING RADAR SURVEY\n`;
      if (details.quantity) desc += `Scan Area: ${details.quantity}\n`;
    }

    if (idx < data.jobTypes.length - 1) desc += '\n---\n\n';
  });

  return desc;
}

// ============================================================
// Main Component
// ============================================================

export function PontiBotOverlay({
  isOpen,
  onClose,
  adminName,
  operators,
  admins,
  onDataChange,
  onFormStepChange,
}: PontiBotOverlayProps) {
  // State
  const [phase, setPhase] = useState<Phase>('conversation');
  const [data, setData] = useState<PontiBotData>(() =>
    createInitialData(adminName, operators, admins)
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Free-speech mode state
  const [freeSpeechMode, setFreeSpeechMode] = useState(false);
  const [extractedFields, setExtractedFields] = useState<Set<string>>(new Set());
  // Store the confirmation prompt generated after bulk extraction
  const confirmPromptRef = useRef('');
  // Track which job type's Step 2 free-speech step is active
  const step2FreeSpeechJobTypeRef = useRef<string | null>(null);

  const script = useRef(buildScript()).current;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasSpokenRef = useRef(false);
  // Mutable data ref to avoid stale closures
  const dataRef = useRef(data);
  dataRef.current = data;

  // Voice hooks
  const voiceOutput = useVoiceOutput({ rate: 1.05 });

  // Standard voice input (single-turn, for step-by-step)
  const handleVoiceResult = useCallback((transcript: string) => {
    if (!waitingForInput) return;
    setWaitingForInput(false);
    addMessage('user', transcript);
    processResponse(transcript);
  }, [waitingForInput, currentStepIndex, data, extractedFields]);

  const voiceInput = useVoiceInput({
    onResult: handleVoiceResult,
    continuous: false,
  });

  // Free-speech voice input (accumulates long speech, 3s silence timeout)
  const handleFreeSpeechResult = useCallback((transcript: string) => {
    if (!waitingForInput) return;
    setWaitingForInput(false);
    setFreeSpeechMode(false);
    addMessage('user', transcript);

    if (step2FreeSpeechJobTypeRef.current) {
      const jobType = step2FreeSpeechJobTypeRef.current;
      step2FreeSpeechJobTypeRef.current = null;
      processStep2FreeSpeechResponse(transcript, jobType);
    } else {
      processFreeSpeechResponse(transcript);
    }
  }, [waitingForInput, data, extractedFields]);

  const freeSpeechVoiceInput = useVoiceInput({
    onResult: handleFreeSpeechResult,
    accumulateResults: true,
    silenceTimeout: 3000,
  });

  // Expose current listening state from whichever input is active
  const activeVoiceInput = freeSpeechMode ? freeSpeechVoiceInput : voiceInput;

  // ============================================================
  // Helpers
  // ============================================================

  function addMessage(sender: 'bot' | 'user', text: string) {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      sender,
      text,
      timestamp: Date.now(),
    }]);
  }

  // ============================================================
  // Step 2 free-speech helpers
  // ============================================================

  function isStep2FreeSpeechStep(stepId: string): boolean {
    return /^step2-\w+-free-speech$/.test(stepId) && !stepId.includes('confirm');
  }

  function isStep2FreeSpeechConfirmStep(stepId: string): boolean {
    return /^step2-\w+-free-speech-confirm$/.test(stepId);
  }

  const STEP_PREFIX_TO_JOB_TYPE: Record<string, string> = {
    'step2-cd': 'CORE DRILLING',
    'step2-wc': 'WALL CUTTING',
    'step2-ss': 'SLAB SAWING',
    'step2-hs': 'HAND SAWING',
    'step2-ws': 'WIRE SAWING',
    'step2-dm': 'CONCRETE DEMOLITION',
    'step2-gpr': 'GPR SCANNING',
  };

  function getJobTypeFromStepId(stepId: string): string {
    const prefix = stepId.replace(/-free-speech(-confirm)?$/, '');
    return STEP_PREFIX_TO_JOB_TYPE[prefix] || '';
  }

  function getFieldPrefixForJobType(jobType: string): string {
    return jobType.replace(/\s+/g, '_');
  }

  // ============================================================
  // Sync data to parent form
  // ============================================================

  function syncToForm(changedFields: string[]) {
    if (onDataChange && changedFields.length > 0) {
      onDataChange(changedFields, dataRef.current);
    }
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================================
  // Get the steps that apply based on current data + extracted fields
  // ============================================================

  function getApplicableSteps(): ConversationStep[] {
    return script.filter(step => {
      // Check original conditions (e.g., skip shop-ticket-only steps)
      if (step.condition && !step.condition(dataRef.current)) return false;

      // Skip Step 1 fields that were already extracted via free speech
      if (step.field && extractedFields.has(step.field)) return false;

      // Skip the "more job types?" step if jobTypes already populated via free speech
      if (step.id === 'step1-job-type-more' && extractedFields.has('jobTypes')) return false;

      return true;
    });
  }

  function getCurrentStep(): ConversationStep | null {
    const applicable = getApplicableSteps();
    if (currentStepIndex >= applicable.length) return null;
    return applicable[currentStepIndex];
  }

  // ============================================================
  // Speak a step prompt and start listening
  // ============================================================

  async function speakAndListen(step: ConversationStep) {
    // For free-speech-confirm steps (Step 1 or Step 2), use the dynamically generated prompt
    let promptText: string;
    if ((step.id === 'free-speech-confirm' || isStep2FreeSpeechConfirmStep(step.id)) && confirmPromptRef.current) {
      promptText = confirmPromptRef.current;
    } else {
      promptText = typeof step.prompt === 'function' ? step.prompt(dataRef.current) : step.prompt;
    }

    addMessage('bot', promptText);

    // Speak it
    await voiceOutput.speak(promptText);

    // Start listening — use free-speech input for free-speech steps (Step 1 or Step 2)
    setWaitingForInput(true);
    if (step.id === 'free-speech' || isStep2FreeSpeechStep(step.id)) {
      setFreeSpeechMode(true);
      if (isStep2FreeSpeechStep(step.id)) {
        step2FreeSpeechJobTypeRef.current = getJobTypeFromStepId(step.id);
      }
      freeSpeechVoiceInput.start();
    } else {
      setFreeSpeechMode(false);
      voiceInput.start();
    }
  }

  // ============================================================
  // Process free-speech bulk extraction
  // ============================================================

  function processFreeSpeechResponse(transcript: string) {
    // Run the bulk extractor on the full transcript
    const result = bulkExtract(transcript);

    if (result.confident.length === 0) {
      // Couldn't extract anything — fall through to step-by-step
      addMessage('bot', "I didn't catch enough details from that. No worries, let me ask you step by step.");
      voiceOutput.speak("I didn't catch enough details from that. No worries, let me ask you step by step.").then(() => {
        // Skip free-speech-confirm, go to step1 questions
        const newExtracted = new Set<string>();
        setExtractedFields(newExtracted);
        advanceStep(); // move past free-speech to free-speech-confirm, then it'll advance past to step1
      });
      return;
    }

    // Apply extracted values to data
    const newData = { ...dataRef.current };
    const newExtracted = new Set<string>();

    if (result.extracted.jobTypes) {
      newData.jobTypes = result.extracted.jobTypes;
      newExtracted.add('jobTypes');
    }
    if (result.extracted.difficulty_rating !== undefined) {
      newData.difficulty_rating = result.extracted.difficulty_rating;
      newExtracted.add('difficulty_rating');
    }
    if (result.extracted.priority) {
      newData.priority = result.extracted.priority;
      newExtracted.add('priority');
    }
    if (result.extracted.truck_parking) {
      newData.truck_parking = result.extracted.truck_parking;
      newExtracted.add('truck_parking');
    }
    if (result.extracted.work_environment) {
      newData.work_environment = result.extracted.work_environment;
      newExtracted.add('work_environment');
    }
    if (result.extracted.site_cleanliness !== undefined) {
      newData.site_cleanliness = result.extracted.site_cleanliness;
      newExtracted.add('site_cleanliness');
    }

    setData(newData);
    setExtractedFields(newExtracted);

    // Sync extracted fields to parent form
    syncToForm(result.confident);

    // Build confirmation prompt
    const confirmText = buildConfirmationPrompt(result.extracted, result.confident);
    confirmPromptRef.current = confirmText;

    // Tell user what remaining fields are needed
    const gapCount = result.gaps.filter(g => g !== 'jobTypes' || !newExtracted.has('jobTypes')).length;

    let fullMessage = confirmText;
    if (result.gaps.length > 0 && result.gaps.length < 6) {
      fullMessage += ` I'll ask about the rest.`;
    }

    // Advance to the confirmation step
    advanceStep();
  }

  // ============================================================
  // Process Step 2 free-speech bulk extraction
  // ============================================================

  function processStep2FreeSpeechResponse(transcript: string, jobType: string) {
    const result = bulkExtractStep2(jobType, transcript);

    if (result.confident.length === 0) {
      addMessage('bot', "I didn't catch enough details. Let me ask step by step.");
      voiceOutput.speak("I didn't catch enough details. Let me ask step by step.").then(() => {
        advanceStep();
      });
      return;
    }

    // Apply extracted values to data
    const newData = { ...dataRef.current };
    if (!newData.jobTypeDetails[jobType]) newData.jobTypeDetails[jobType] = {};

    // Merge extracted fields into jobTypeDetails
    for (const [key, value] of Object.entries(result.extracted)) {
      newData.jobTypeDetails[jobType][key] = value;
    }

    setData(newData);

    // Mark extracted fields for skip logic
    const newExtracted = new Set(extractedFields);
    const fieldPrefix = getFieldPrefixForJobType(jobType);

    for (const field of result.confident) {
      newExtracted.add(`${fieldPrefix}.${field}`);
    }

    setExtractedFields(newExtracted);

    // Sync to parent form
    syncToForm(['jobTypeDetails']);

    // Build confirmation prompt
    const confirmText = buildStep2ConfirmationPrompt(jobType, result.extracted, result.confident);
    confirmPromptRef.current = confirmText;

    // Advance to confirm step
    advanceStep();
  }

  // ============================================================
  // Process a voice response (step-by-step mode)
  // ============================================================

  function processResponse(spoken: string) {
    const step = getCurrentStep();
    if (!step) return;

    // Special handling for free-speech-confirm
    if (step.id === 'free-speech-confirm') {
      const result = step.parse(spoken, dataRef.current);
      if (!result.success) {
        setRetryCount(prev => prev + 1);
        const retryMsg = result.retryMessage || "Yes or no?";
        if (retryCount >= 2) {
          addMessage('bot', "I'll take that as a yes. Let's keep going.");
          advanceStep();
          return;
        }
        addMessage('bot', retryMsg);
        voiceOutput.speak(retryMsg).then(() => {
          setWaitingForInput(true);
          voiceInput.start();
        });
        return;
      }

      setRetryCount(0);
      if (result.message) addMessage('bot', result.message);

      if (result.value === 'confirmed') {
        // User confirmed — skip all extracted fields and continue
        advanceStep();
      } else if (result.value === 'rejected') {
        // User rejected — clear extracted fields, ask step-by-step
        setExtractedFields(new Set());
        // Reset the data fields that were set by bulk extraction
        const resetData = { ...dataRef.current };
        resetData.jobTypes = [];
        resetData.difficulty_rating = 5;
        resetData.priority = 'medium';
        resetData.truck_parking = 'close';
        resetData.work_environment = 'outdoor';
        resetData.site_cleanliness = 5;
        setData(resetData);
        advanceStep(); // Will now show step1 questions since extractedFields is empty
      }
      return;
    }

    // Special handling for Step 2 free-speech-confirm steps
    if (isStep2FreeSpeechConfirmStep(step.id)) {
      const result = step.parse(spoken, dataRef.current);
      if (!result.success) {
        setRetryCount(prev => prev + 1);
        const retryMsg = result.retryMessage || 'Yes or no?';
        if (retryCount >= 2) {
          addMessage('bot', "I'll take that as a yes. Let's keep going.");
          advanceStep();
          return;
        }
        addMessage('bot', retryMsg);
        voiceOutput.speak(retryMsg).then(() => {
          setWaitingForInput(true);
          voiceInput.start();
        });
        return;
      }

      setRetryCount(0);
      if (result.message) addMessage('bot', result.message);

      if (result.value === 'confirmed') {
        // User confirmed — skip extracted Step 2 fields for this job type
        advanceStep();
      } else if (result.value === 'rejected') {
        // Remove extracted fields for THIS job type only
        const jobType = getJobTypeFromStepId(step.id);
        const fieldPrefix = getFieldPrefixForJobType(jobType);
        const newExtracted = new Set(extractedFields);
        for (const f of Array.from(newExtracted)) {
          if (f.startsWith(fieldPrefix + '.')) newExtracted.delete(f);
        }
        setExtractedFields(newExtracted);

        // Reset this job type's details
        const newData = { ...dataRef.current };
        delete newData.jobTypeDetails[jobType];
        setData(newData);

        // Sync the deletion to parent form
        syncToForm(['jobTypeDetails']);

        advanceStep(); // Will now show step-by-step for this job type
      }
      return;
    }

    const result = step.parse(spoken, dataRef.current);

    if (!result.success) {
      // Failed to parse — retry
      setRetryCount(prev => prev + 1);
      const retryMsg = result.retryMessage || "Sorry, I didn't catch that. Can you repeat?";

      if (retryCount >= 2) {
        addMessage('bot', "Having trouble hearing you. Let me move on — you can edit this in the review.");
        advanceStep();
        return;
      }

      addMessage('bot', retryMsg);
      voiceOutput.speak(retryMsg).then(() => {
        setWaitingForInput(true);
        voiceInput.start();
      });
      return;
    }

    // Success
    setRetryCount(0);

    // Sync changed fields to parent form
    const changedFields = getChangedFieldsForStep(step.id);
    syncToForm(changedFields);

    // Show confirmation message
    if (result.message) {
      addMessage('bot', result.message);
    }

    // Handle loop steps
    if (step.isLoop && result.value !== 'done' && result.value !== 'skip') {
      advanceStep();
      return;
    }

    // Handle "more" loops (job type more, holes more, cuts more, etc.)
    if (result.value === 'added') {
      setTimeout(() => {
        const currentStep = getCurrentStep();
        if (currentStep) speakAndListen(currentStep);
      }, 500);
      return;
    }

    if (result.value === 'more') {
      goBackForMore(step.id);
      return;
    }

    // Check for explicit nextStep
    if (step.nextStep) {
      const next = step.nextStep(dataRef.current);
      if (next === 'review') {
        setTimeout(() => setPhase('review'), 800);
        return;
      }
      if (next !== 'next') {
        jumpToStep(next);
        return;
      }
    }

    // Default: advance to next step
    advanceStep();
  }

  // ============================================================
  // Navigation
  // ============================================================

  function advanceStep() {
    const applicable = getApplicableSteps();
    const nextIndex = currentStepIndex + 1;

    if (nextIndex >= applicable.length) {
      setTimeout(() => setPhase('review'), 500);
      return;
    }

    setCurrentStepIndex(nextIndex);
  }

  function jumpToStep(stepId: string) {
    const applicable = getApplicableSteps();
    const targetIndex = applicable.findIndex(s => s.id === stepId);
    if (targetIndex >= 0) {
      setCurrentStepIndex(targetIndex);
    } else {
      advanceStep();
    }
  }

  function goBackForMore(currentStepId: string) {
    const loopBackMap: Record<string, string> = {
      'step2-cd-holes-more': 'step2-cd-holes-qty',
      'step2-wc-cuts-more': 'step2-wc-cut-type',
      'step2-ss-cuts-more': 'step2-ss-cut-type',
      'step2-hs-cuts-more': 'step2-hs-cut-type',
      'step2-ws-cuts-more': 'step2-ws-description',
      'step2-dm-areas-more': 'step2-dm-area-volume',
      'step1-job-type-more': 'step1-job-type',
      'step2-cd-locations-more': 'step2-cd-locations',
    };

    const targetId = loopBackMap[currentStepId];
    if (targetId) {
      jumpToStep(targetId);
    } else {
      advanceStep();
    }
  }

  // ============================================================
  // Trigger step speech when currentStepIndex changes
  // ============================================================

  useEffect(() => {
    if (!isOpen || phase !== 'conversation') return;

    const step = getCurrentStep();
    if (!step) {
      setPhase('review');
      return;
    }

    // Auto-advance the parent form to match PontiBot's current section
    if (onFormStepChange && step.formStep >= 1) {
      onFormStepChange(step.formStep);
    }

    // Small delay for natural pacing
    const timer = setTimeout(() => {
      speakAndListen(step);
    }, hasSpokenRef.current ? 600 : 300);

    hasSpokenRef.current = true;

    return () => clearTimeout(timer);
  }, [currentStepIndex, isOpen, phase, extractedFields]);

  // ============================================================
  // Reset when overlay opens
  // ============================================================

  useEffect(() => {
    if (isOpen) {
      setPhase('conversation');
      setData(createInitialData(adminName, operators, admins));
      setMessages([]);
      setCurrentStepIndex(0);
      setRetryCount(0);
      setWaitingForInput(false);
      setSubmitting(false);
      setShowSuccess(false);
      setFreeSpeechMode(false);
      setExtractedFields(new Set());
      confirmPromptRef.current = '';
      hasSpokenRef.current = false;
    } else {
      voiceOutput.stop();
      voiceInput.stop();
      freeSpeechVoiceInput.stop();
    }
  }, [isOpen]);

  // ============================================================
  // Apply to Form — sync all data and close panel
  // ============================================================

  function handleApplyToForm() {
    // Full sync of ALL fields to the parent form
    const allFields = [
      'jobTypes', 'difficulty_rating', 'priority', 'truck_parking',
      'work_environment', 'site_cleanliness', 'jobTypeDetails', 'location', 'address',
      'estimatedDriveHours', 'estimatedDriveMinutes',
      'startDate', 'endDate', 'arrivalTime', 'shopArrivalTime', 'estimatedHours',
      'technicians', 'salesman', 'equipment',
      'title', 'customer', 'companyName', 'customerEmail', 'salespersonEmail',
      'po', 'contactOnSite', 'contactPhone', 'jobSiteGC', 'jobQuote',
      'requiredDocuments', 'additionalInfo',
    ];
    syncToForm(allFields);

    addMessage('bot', "All done! I've filled in the form. Review it and hit submit when ready.");
    voiceOutput.speak("All done! I've filled in the form for you.");
    setTimeout(() => {
      handleClose();
    }, 2000);
  }

  // ============================================================
  // Handle close
  // ============================================================

  function handleClose() {
    voiceOutput.stop();
    voiceInput.stop();
    freeSpeechVoiceInput.stop();
    onClose();
  }

  function handleStartOver() {
    setPhase('conversation');
    setData(createInitialData(adminName, operators, admins));
    setMessages([]);
    setCurrentStepIndex(0);
    setRetryCount(0);
    setWaitingForInput(false);
    setFreeSpeechMode(false);
    setExtractedFields(new Set());
    confirmPromptRef.current = '';
    hasSpokenRef.current = false;
  }

  // ============================================================
  // Manual mic toggle
  // ============================================================

  function toggleMic() {
    if (activeVoiceInput.isListening) {
      activeVoiceInput.stop();
    } else {
      voiceOutput.stop();
      setWaitingForInput(true);
      if (freeSpeechMode) {
        freeSpeechVoiceInput.start();
      } else {
        voiceInput.start();
      }
    }
  }

  // ============================================================
  // Render
  // ============================================================

  if (!isOpen) return null;

  const currentStep = getCurrentStep();
  const progressPercent = currentStep
    ? Math.round((currentStep.formStep / 8) * 100)
    : 100;

  return (
    <AnimatePresence>
      {/* Backdrop — click to close */}
      <motion.div
        key="pontibot-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9998] bg-black/30"
        onClick={handleClose}
      />

      {/* Side panel */}
      <motion.div
        key="pontibot-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 z-[9999] w-[420px] max-w-[90vw] bg-gray-900/98 flex flex-col shadow-2xl shadow-black/50 border-l border-gray-700/50"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm">PontiBot</h2>
              <p className="text-gray-400 text-[10px]">
                {phase === 'conversation' && currentStep
                  ? freeSpeechMode
                    ? 'Free Speech — Keep talking'
                    : `Step ${currentStep.formStep} of 8`
                  : phase === 'review'
                    ? 'Review & Apply'
                    : ''
                }
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {phase === 'conversation' && (
            <div className="flex-1 mx-4">
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {phase === 'conversation' && (
            <>
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[90%] px-3 py-2 rounded-2xl ${
                      msg.sender === 'bot'
                        ? 'bg-gray-800 text-gray-100 rounded-bl-md'
                        : 'bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-br-md'
                    }`}>
                      {msg.sender === 'bot' && (
                        <span className="text-orange-400 text-[10px] font-bold block mb-0.5">PontiBot</span>
                      )}
                      <p className="text-xs leading-relaxed">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}

                {/* Interim transcript */}
                {activeVoiceInput.interimTranscript && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-end"
                  >
                    <div className={`max-w-[90%] px-3 py-2 rounded-2xl rounded-br-md ${
                      freeSpeechMode
                        ? 'bg-orange-500/10 border border-orange-500/20'
                        : 'bg-orange-500/20 border border-orange-500/30'
                    }`}>
                      <p className="text-xs text-orange-300 italic">{activeVoiceInput.interimTranscript}...</p>
                    </div>
                  </motion.div>
                )}

                {/* Speaking indicator */}
                {voiceOutput.isSpeaking && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="px-3 py-2 rounded-2xl bg-gray-800/50">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                        </div>
                        <span className="text-gray-500 text-[10px]">Speaking...</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Mic area */}
              <div className="px-4 py-4 border-t border-gray-700/50 flex flex-col items-center gap-3">
                {/* Error display */}
                {activeVoiceInput.error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-500/30 rounded-lg"
                  >
                    <AlertCircle size={14} className="text-red-400" />
                    <span className="text-red-400 text-xs">{activeVoiceInput.error}</span>
                  </motion.div>
                )}

                {/* Free speech mode indicator */}
                {freeSpeechMode && activeVoiceInput.isListening && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-orange-400 text-xs font-medium"
                  >
                    Keep talking — I&apos;ll listen until you&apos;re done
                  </motion.p>
                )}

                {!activeVoiceInput.isSupported ? (
                  <p className="text-red-400 text-xs">
                    Voice not supported. Please use Chrome or Edge.
                  </p>
                ) : (
                  <VoiceMicButton
                    isListening={activeVoiceInput.isListening}
                    onClick={toggleMic}
                    size="md"
                    mode={freeSpeechMode ? 'free-speech' : 'normal'}
                  />
                )}
              </div>
            </>
          )}

          {phase === 'review' && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <PontiBotReviewCard
                data={data}
                onSubmit={handleApplyToForm}
                onCancel={handleClose}
                onStartOver={handleStartOver}
                submitting={submitting}
              />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
