/**
 * PontiBot Conversation Script
 *
 * Defines the entire conversational flow for creating a job ticket.
 * Each step maps 1:1 to the 8-step schedule form.
 * The script is DATA — the overlay component iterates through it.
 */

import {
  matchJobType,
  detectYesNo,
  detectDone,
  parseDate,
  parseTime,
  parseNumber,
  matchPriority,
  matchParking,
  matchEnvironment,
  matchName,
  fuzzyMatch,
  fuzzyMatchMultiple,
  detectSkip,
  parsePhoneNumber,
  parseDollarAmount,
  formatDateDisplay,
  formatTimeDisplay,
} from './voice-parser';

// ============================================================
// TYPES
// ============================================================

export type StepId = string;

export interface ConversationStep {
  /** Unique step identifier */
  id: StepId;
  /** Which form step this belongs to (1-8) for progress display */
  formStep: number;
  /** What PontiBot says to the admin */
  prompt: string | ((data: PontiBotData) => string);
  /** How to parse the voice response and store it */
  parse: (spoken: string, data: PontiBotData) => ParseResult;
  /** What PontiBot says to confirm after parsing */
  confirm?: string | ((data: PontiBotData, parsed: any) => string);
  /** Condition: should this step be shown? */
  condition?: (data: PontiBotData) => boolean;
  /** After this step, which step comes next? (defaults to next in array) */
  nextStep?: (data: PontiBotData) => StepId | 'next' | 'review';
  /** Is this a loop step that can repeat? */
  isLoop?: boolean;
  /** Field name in PontiBotData this step populates */
  field?: string;
}

export interface ParseResult {
  success: boolean;
  /** The parsed/matched value */
  value?: any;
  /** Confirmation message to speak */
  message?: string;
  /** If parsing failed, retry message */
  retryMessage?: string;
}

/** All data collected by PontiBot — mirrors the dispatch form's JobOrderForm */
export interface PontiBotData {
  // Step 1: Basic Info
  jobTypes: string[];
  difficulty_rating: number;
  priority: 'high' | 'medium' | 'low';
  truck_parking: 'close' | 'far';
  work_environment: 'outdoor' | 'indoor';
  site_cleanliness: number;
  shopTicketDescription: string;

  // Step 2: Work Details (per job type)
  jobTypeDetails: Record<string, any>;
  additionalInfo: string;

  // Step 3: Location
  location: string;
  address: string;
  estimatedDriveHours: number;
  estimatedDriveMinutes: number;

  // Step 4: Schedule
  startDate: string;
  endDate: string;
  arrivalTime: string;
  shopArrivalTime: string;
  estimatedHours: string;

  // Step 5: Team
  technicians: Array<{ id: string; full_name: string }>;
  salesman: { id: string; full_name: string } | null;

  // Step 6: Equipment
  equipment: string[];

  // Step 7: Job Info
  title: string;
  customer: string;
  customerPhone: string;
  contactOnSite: string;
  contactPhone: string;
  po: string;
  companyName: string;
  customerEmail: string;
  salespersonEmail: string;
  jobSiteGC: string;
  jobQuote: number | undefined;

  // Step 8: Documents
  requiredDocuments: string[];

  // Internal
  _currentJobTypeIndex: number;
  _operators: Array<{ id: string; full_name: string }>;
  _admins: Array<{ id: string; full_name: string }>;
  _adminName: string;
}

export function createInitialData(
  adminName: string,
  operators: Array<{ id: string; full_name: string }>,
  admins: Array<{ id: string; full_name: string }>
): PontiBotData {
  return {
    jobTypes: [],
    difficulty_rating: 5,
    priority: 'medium',
    truck_parking: 'close',
    work_environment: 'outdoor',
    site_cleanliness: 5,
    shopTicketDescription: '',
    jobTypeDetails: {},
    additionalInfo: '',
    location: '',
    address: '',
    estimatedDriveHours: 0,
    estimatedDriveMinutes: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    arrivalTime: '08:00',
    shopArrivalTime: '',
    estimatedHours: '8.00',
    technicians: [],
    salesman: null,
    equipment: [],
    title: '',
    customer: '',
    customerPhone: '',
    contactOnSite: '',
    contactPhone: '',
    po: '',
    companyName: '',
    customerEmail: '',
    salespersonEmail: '',
    jobSiteGC: '',
    jobQuote: undefined,
    requiredDocuments: ['silica-dust-control'],
    _currentJobTypeIndex: 0,
    _operators: operators,
    _admins: admins,
    _adminName: adminName,
  };
}

// ============================================================
// CONSTANTS (matching the dispatch form exactly)
// ============================================================

const VALID_JOB_TYPES = [
  'CORE DRILLING', 'WALL CUTTING', 'SLAB SAWING', 'HAND SAWING',
  'WIRE SAWING', 'CONCRETE DEMOLITION', 'GPR SCANNING', 'SHOP TICKET',
];

const CORE_DRILLING_LOCATIONS = ['Columns', 'Block Wall', 'Concrete Wall', 'Precast Wall', 'Slab on Grade', 'Elevated Slab'];
const CORE_DRILLING_ACCESSIBILITY = ['1 - Very Hard (Tight Area)', '2 - Hard', '3 - Moderate', '4 - Easy', '5 - Wide Open'];
const CORE_DRILLING_LADDER_LIFT = ['6ft Ladder', '8ft Ladder', '12ft Ladder', 'Scissor Lift'];

const WALL_SAWING_MATERIALS = ['Reinforced Concrete', 'Duct Bank', 'Precast Concrete', 'Block/Brick', 'Other'];
const WALL_CUTTING_REMOVAL_EQUIPMENT = ['Forklift', '6k lull', '8k lull', '10k lull', 'Other'];

const SLAB_SAWING_MATERIALS = ['Reinforced Concrete', 'Asphalt', 'Green Concrete'];
const SLAB_HAND_REMOVAL_EQUIPMENT = ['Dolly Hand Removal', 'Sherpa', 'Skidsteer', 'Forklift', 'A Frame'];

const HAND_SAWING_MATERIALS = ['Concrete', 'Block', 'Brick', 'Rock'];
const HAND_SAWING_LOCATIONS = ['Slab on Grade', 'Elevated Slab', 'Vertical Cutting'];

const DEMOLITION_METHODS = ['Brokk Demo', 'Jackhammering'];
const DEMOLITION_MATERIALS = ['Reinforced Concrete', 'Block/Brick', 'Other'];

// ============================================================
// HELPER: get admin's first name for personal touches
// ============================================================

function firstName(data: PontiBotData): string {
  return data._adminName.split(' ')[0] || 'boss';
}

// ============================================================
// SCRIPT DEFINITION
// ============================================================

export function buildScript(): ConversationStep[] {
  return [
    // ========================================
    // GREETING
    // ========================================
    {
      id: 'greeting',
      formStep: 0,
      prompt: (data) => `Hey ${firstName(data)}, how's it going? Ready to create a job ticket?`,
      parse: () => ({ success: true, value: null, message: "Alright, let's get it done." }),
    },

    // ========================================
    // FREE SPEECH MODE (optional bulk input)
    // ========================================
    {
      id: 'free-speech',
      formStep: 1,
      prompt: (data) => `Tell me about this job, ${firstName(data)}. Job type, difficulty, priority, parking, indoor or outdoor, cleanliness — give me everything you've got. Just talk naturally.`,
      parse: (spoken, data) => {
        // Bulk extraction is handled by the overlay — this just passes the raw text through
        return { success: true, value: { raw: spoken }, message: '' };
      },
      field: '_free_speech',
    },
    {
      id: 'free-speech-confirm',
      formStep: 1,
      prompt: '', // Dynamic — set by the overlay after bulk extraction
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: "Perfect. Let's keep going." };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask you step by step." };
        // If they say "just ask me" or similar, treat as skip
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step') || spoken.toLowerCase().includes('one at a time')) {
          return { success: true, value: 'rejected', message: "Sure thing, I'll ask one at a time." };
        }
        return { success: false, retryMessage: "Did I get that right? Yes or no?" };
      },
      field: '_free_speech_confirm',
    },

    // ========================================
    // STEP 1: BASIC INFORMATION
    // ========================================
    {
      id: 'step1-job-type',
      formStep: 1,
      field: 'jobTypes',
      prompt: 'What type of job? Just say the name — like core drilling, wall cutting, slab sawing, hand sawing, and so on.',
      parse: (spoken, data) => {
        const match = matchJobType(spoken);
        if (match && !data.jobTypes.includes(match)) {
          data.jobTypes.push(match);
          return { success: true, value: match, message: `Got it, ${match}.` };
        }
        if (match && data.jobTypes.includes(match)) {
          return { success: true, value: match, message: `Already have ${match}.` };
        }
        return { success: false, retryMessage: "Hmm, didn't catch that one. Try again — what job type?" };
      },
      isLoop: true,
    },
    {
      id: 'step1-job-type-more',
      formStep: 1,
      prompt: 'Any more job types for this ticket, or are we good?',
      parse: (spoken, data) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') {
          return { success: true, value: 'done', message: '' };
        }
        // They might be saying another job type
        const match = matchJobType(spoken);
        if (match && !data.jobTypes.includes(match)) {
          data.jobTypes.push(match);
          return { success: true, value: 'added', message: `Added ${match}.` };
        }
        return { success: true, value: 'done', message: '' };
      },
      nextStep: (data) => {
        // If they added more, ask again
        const lastResult = data.jobTypes.length;
        if (lastResult > 0) {
          // This is handled by the overlay logic — if value was 'added', loop back
          return 'next';
        }
        return 'next';
      },
    },

    // Shop ticket description (conditional)
    {
      id: 'step1-shop-description',
      formStep: 1,
      prompt: "Since this is a shop ticket, describe what needs to be done.",
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          data.shopTicketDescription = spoken.trim();
          return { success: true, value: spoken.trim(), message: 'Got it. Moving on to location.' };
        }
        return { success: false, retryMessage: 'Could you describe what needs to be done at the shop?' };
      },
      condition: (data) => data.jobTypes.includes('SHOP TICKET'),
      nextStep: () => 'step3-location', // Skip Step 2 for shop tickets
    },

    // Difficulty (skip for shop ticket)
    {
      id: 'step1-difficulty',
      formStep: 1,
      field: 'difficulty_rating',
      prompt: 'Difficulty rating, 1 through 10? 1 being easy, 10 very hard.',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null && num >= 1 && num <= 10) {
          data.difficulty_rating = Math.round(num);
          return { success: true, value: num, message: `${Math.round(num)}. Got it.` };
        }
        return { success: false, retryMessage: 'Give me a number 1 through 10.' };
      },
      condition: (data) => !data.jobTypes.includes('SHOP TICKET'),
    },

    // Priority
    {
      id: 'step1-priority',
      formStep: 1,
      field: 'priority',
      prompt: 'What priority — high, medium, or low?',
      parse: (spoken, data) => {
        const match = matchPriority(spoken);
        if (match) {
          data.priority = match;
          return { success: true, value: match, message: `${match}. Noted.` };
        }
        return { success: false, retryMessage: 'High, medium, or low?' };
      },
      condition: (data) => !data.jobTypes.includes('SHOP TICKET'),
    },

    // Truck parking
    {
      id: 'step1-parking',
      formStep: 1,
      field: 'truck_parking',
      prompt: 'How close can the truck park? Close, under 300 feet, or far where they need to unload and carry?',
      parse: (spoken, data) => {
        const match = matchParking(spoken);
        if (match) {
          data.truck_parking = match;
          return { success: true, value: match, message: match === 'close' ? 'Close parking.' : 'Far — they\'ll need to carry.' };
        }
        return { success: false, retryMessage: 'Close or far?' };
      },
      condition: (data) => !data.jobTypes.includes('SHOP TICKET'),
    },

    // Work environment
    {
      id: 'step1-environment',
      formStep: 1,
      field: 'work_environment',
      prompt: 'Indoor or outdoor?',
      parse: (spoken, data) => {
        const match = matchEnvironment(spoken);
        if (match) {
          data.work_environment = match;
          return { success: true, value: match, message: `${match === 'indoor' ? 'Indoor' : 'Outdoor'}.` };
        }
        return { success: false, retryMessage: 'Indoor or outdoor?' };
      },
      condition: (data) => !data.jobTypes.includes('SHOP TICKET'),
    },

    // Site cleanliness
    {
      id: 'step1-cleanliness',
      formStep: 1,
      field: 'site_cleanliness',
      prompt: 'Site cleanliness, 1 through 10? 1 dirty, 10 very clean.',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null && num >= 1 && num <= 10) {
          data.site_cleanliness = Math.round(num);
          return { success: true, value: num, message: `Alright, basic info is locked in. Let's get into the work details.` };
        }
        return { success: false, retryMessage: 'Give me a number 1 through 10.' };
      },
      condition: (data) => !data.jobTypes.includes('SHOP TICKET'),
    },

    // ========================================
    // STEP 2: WORK DETAILS (per job type)
    // ========================================

    // --- CORE DRILLING ---
    {
      id: 'step2-cd-intro',
      formStep: 2,
      prompt: (data) => {
        const types = data.jobTypes.filter(t => t !== 'SHOP TICKET');
        return `Now let's get into the work details. Starting with ${types[data._currentJobTypeIndex] || types[0]}.`;
      },
      parse: () => ({ success: true, value: null }),
      condition: (data) => data.jobTypes.some(t => t !== 'SHOP TICKET'),
    },

    // --- CORE DRILLING FREE SPEECH ---
    {
      id: 'step2-cd-free-speech',
      formStep: 2,
      field: '_step2_cd_free_speech',
      prompt: "Tell me about the core drilling — accessibility, where they're drilling, and the holes. How many, what diameter, depth, above 5 feet or not. Give me everything.",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },
    {
      id: 'step2-cd-free-speech-confirm',
      formStep: 2,
      field: '_step2_cd_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },

    {
      id: 'step2-cd-accessibility',
      formStep: 2,
      field: 'CORE_DRILLING.accessibility',
      prompt: 'Accessibility ranking — 1 very hard, tight area, all the way to 5 wide open. What are we looking at?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null && num >= 1 && num <= 5) {
          const match = CORE_DRILLING_ACCESSIBILITY[Math.round(num) - 1];
          if (!data.jobTypeDetails['CORE DRILLING']) data.jobTypeDetails['CORE DRILLING'] = {};
          data.jobTypeDetails['CORE DRILLING'].accessibility = match;
          return { success: true, value: match, message: `${match}. Got it.` };
        }
        return { success: false, retryMessage: 'Give me a number 1 through 5. 1 is very hard tight area, 5 is wide open.' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },

    {
      id: 'step2-cd-locations',
      formStep: 2,
      field: 'CORE_DRILLING.locations',
      prompt: 'Where are they drilling? Columns, block wall, concrete wall, precast wall, slab on grade, or elevated slab? Tell me all that apply.',
      parse: (spoken, data) => {
        const matches = fuzzyMatchMultiple(spoken, CORE_DRILLING_LOCATIONS);
        if (matches.length > 0) {
          if (!data.jobTypeDetails['CORE DRILLING']) data.jobTypeDetails['CORE DRILLING'] = {};
          const existing = data.jobTypeDetails['CORE DRILLING'].locations || [];
          const combined = [...new Set([...existing, ...matches])];
          data.jobTypeDetails['CORE DRILLING'].locations = combined;
          return { success: true, value: matches, message: `Got ${matches.join(' and ')}.` };
        }
        // Try single match
        const single = fuzzyMatch(spoken, CORE_DRILLING_LOCATIONS, 0.4);
        if (single) {
          if (!data.jobTypeDetails['CORE DRILLING']) data.jobTypeDetails['CORE DRILLING'] = {};
          const existing = data.jobTypeDetails['CORE DRILLING'].locations || [];
          if (!existing.includes(single)) existing.push(single);
          data.jobTypeDetails['CORE DRILLING'].locations = existing;
          return { success: true, value: [single], message: `Got ${single}.` };
        }
        return { success: false, retryMessage: 'Which locations? Columns, block wall, concrete wall, precast wall, slab on grade, or elevated slab?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
      isLoop: true,
    },
    {
      id: 'step2-cd-locations-more',
      formStep: 2,
      field: 'CORE_DRILLING.locations',
      prompt: 'Any more drilling locations, or are we good?',
      parse: (spoken, data) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') {
          return { success: true, value: 'done' };
        }
        const match = fuzzyMatch(spoken, CORE_DRILLING_LOCATIONS, 0.4);
        if (match) {
          const existing = data.jobTypeDetails['CORE DRILLING']?.locations || [];
          if (!existing.includes(match)) existing.push(match);
          data.jobTypeDetails['CORE DRILLING'].locations = existing;
          return { success: true, value: 'added', message: `Added ${match}.` };
        }
        return { success: true, value: 'done' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },

    {
      id: 'step2-cd-holes-qty',
      formStep: 2,
      field: 'CORE_DRILLING.holes',
      prompt: "Let's do the holes. How many holes in this set?",
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null && num > 0) {
          if (!data.jobTypeDetails['CORE DRILLING']) data.jobTypeDetails['CORE DRILLING'] = {};
          if (!data.jobTypeDetails['CORE DRILLING']._currentHole) {
            data.jobTypeDetails['CORE DRILLING']._currentHole = {};
          }
          data.jobTypeDetails['CORE DRILLING']._currentHole.quantity = String(Math.round(num));
          return { success: true, value: num, message: `${Math.round(num)} holes.` };
        }
        return { success: false, retryMessage: 'How many holes?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },
    {
      id: 'step2-cd-holes-diameter',
      formStep: 2,
      field: 'CORE_DRILLING.holes',
      prompt: 'What diameter in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null && num > 0) {
          data.jobTypeDetails['CORE DRILLING']._currentHole.diameter = String(num);
          return { success: true, value: num, message: `${num} inch diameter.` };
        }
        return { success: false, retryMessage: 'What diameter in inches?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },
    {
      id: 'step2-cd-holes-depth',
      formStep: 2,
      field: 'CORE_DRILLING.holes',
      prompt: 'What depth in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null && num > 0) {
          data.jobTypeDetails['CORE DRILLING']._currentHole.depth = String(num);
          return { success: true, value: num, message: `${num} inches deep.` };
        }
        return { success: false, retryMessage: 'What depth in inches?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },
    {
      id: 'step2-cd-holes-above5',
      formStep: 2,
      field: 'CORE_DRILLING.holes',
      prompt: 'Any of these above 5 feet?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') {
          data.jobTypeDetails['CORE DRILLING']._currentHole.aboveFiveFeet = true;
          return { success: true, value: true };
        }
        if (yn === 'no') {
          data.jobTypeDetails['CORE DRILLING']._currentHole.aboveFiveFeet = false;
          // Finalize this hole set
          const holes = data.jobTypeDetails['CORE DRILLING'].holes || [];
          const current = { ...data.jobTypeDetails['CORE DRILLING']._currentHole };
          delete data.jobTypeDetails['CORE DRILLING']._currentHole;
          holes.push(current);
          data.jobTypeDetails['CORE DRILLING'].holes = holes;
          const h = current;
          return { success: true, value: false, message: `Got ${h.quantity} holes, ${h.diameter} inch diameter, ${h.depth} inches deep.` };
        }
        return { success: false, retryMessage: 'Are they above 5 feet? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
    },
    {
      id: 'step2-cd-holes-ladder',
      formStep: 2,
      field: 'CORE_DRILLING.holes',
      prompt: '6 foot ladder, 8 foot ladder, 12 foot ladder, or scissor lift?',
      parse: (spoken, data) => {
        const match = fuzzyMatch(spoken, CORE_DRILLING_LADDER_LIFT, 0.4);
        if (match) {
          data.jobTypeDetails['CORE DRILLING']._currentHole.ladderLiftOption = match;
          // Finalize this hole set
          const holes = data.jobTypeDetails['CORE DRILLING'].holes || [];
          const current = { ...data.jobTypeDetails['CORE DRILLING']._currentHole };
          delete data.jobTypeDetails['CORE DRILLING']._currentHole;
          holes.push(current);
          data.jobTypeDetails['CORE DRILLING'].holes = holes;
          const h = current;
          return { success: true, value: match, message: `Got ${h.quantity} holes, ${h.diameter} inch, ${h.depth} deep, with ${match}.` };
        }
        return { success: false, retryMessage: '6 foot ladder, 8 foot ladder, 12 foot ladder, or scissor lift?' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING') &&
        data.jobTypeDetails['CORE DRILLING']?._currentHole?.aboveFiveFeet === true,
    },
    {
      id: 'step2-cd-holes-more',
      formStep: 2,
      field: 'CORE_DRILLING.holes',
      prompt: 'Any more hole sets, or are we done?',
      parse: (spoken) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') {
          return { success: true, value: 'done' };
        }
        return { success: true, value: 'more' };
      },
      condition: (data) => data.jobTypes.includes('CORE DRILLING'),
      nextStep: (_data) => 'next', // overlay handles looping back to holes-qty if 'more'
    },

    // --- WALL CUTTING FREE SPEECH ---
    {
      id: 'step2-wc-free-speech',
      formStep: 2,
      field: '_step2_wc_free_speech',
      prompt: "Give me the wall cutting details — material type, overcuts allowed or not, and the cuts. Linear feet or openings with dimensions, thickness, removing material or not. Go ahead.",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },
    {
      id: 'step2-wc-free-speech-confirm',
      formStep: 2,
      field: '_step2_wc_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },

    // --- WALL CUTTING ---
    {
      id: 'step2-wc-material',
      formStep: 2,
      field: 'WALL_CUTTING.material',
      prompt: 'What material are they cutting through? Reinforced concrete, duct bank, precast concrete, block and brick, or other?',
      parse: (spoken, data) => {
        const match = fuzzyMatch(spoken, WALL_SAWING_MATERIALS, 0.4);
        if (match) {
          if (!data.jobTypeDetails['WALL CUTTING']) data.jobTypeDetails['WALL CUTTING'] = {};
          data.jobTypeDetails['WALL CUTTING'].material = match;
          return { success: true, value: match, message: `${match}.` };
        }
        return { success: false, retryMessage: 'Reinforced concrete, duct bank, precast concrete, block and brick, or other?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },
    {
      id: 'step2-wc-material-other',
      formStep: 2,
      field: 'WALL_CUTTING.materialOther',
      prompt: 'What material is it?',
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          data.jobTypeDetails['WALL CUTTING'].materialOther = spoken.trim();
          return { success: true, value: spoken.trim(), message: `Got it, ${spoken.trim()}.` };
        }
        return { success: false, retryMessage: 'What is the material?' };
      },
      condition: (data) => data.jobTypeDetails['WALL CUTTING']?.material === 'Other',
    },
    {
      id: 'step2-wc-overcuts',
      formStep: 2,
      field: 'WALL_CUTTING.overcutsAllowed',
      prompt: 'Are overcuts allowed?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn) {
          data.jobTypeDetails['WALL CUTTING'].overcutsAllowed = yn === 'yes' ? 'Yes' : 'No';
          return { success: true, value: yn, message: yn === 'yes' ? 'Overcuts allowed.' : 'No overcuts.' };
        }
        return { success: false, retryMessage: 'Yes or no — are overcuts allowed?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },
    {
      id: 'step2-wc-cut-type',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Is this a linear cut only, or an opening with specific dimensions?',
      parse: (spoken, data) => {
        const normalized = spoken.toLowerCase();
        if (normalized.includes('linear') || normalized.includes('line')) {
          if (!data.jobTypeDetails['WALL CUTTING']._currentCut) data.jobTypeDetails['WALL CUTTING']._currentCut = {};
          data.jobTypeDetails['WALL CUTTING']._currentCut.linearCutOnly = true;
          return { success: true, value: 'linear' };
        }
        if (normalized.includes('opening') || normalized.includes('dimension') || normalized.includes('specific') || normalized.includes('area')) {
          if (!data.jobTypeDetails['WALL CUTTING']._currentCut) data.jobTypeDetails['WALL CUTTING']._currentCut = {};
          data.jobTypeDetails['WALL CUTTING']._currentCut.linearCutOnly = false;
          return { success: true, value: 'opening' };
        }
        return { success: false, retryMessage: 'Linear cut only, or an opening with dimensions?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },
    // Linear cut fields
    {
      id: 'step2-wc-linear-feet',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'How many linear feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.linearFeet = String(num);
          return { success: true, value: num, message: `${num} linear feet.` };
        }
        return { success: false, retryMessage: 'How many linear feet?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === true,
    },
    {
      id: 'step2-wc-linear-thickness',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Thickness in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.thickness = String(num);
          return { success: true, value: num, message: `${num} inches thick.` };
        }
        return { success: false, retryMessage: 'Thickness in inches?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === true,
    },
    // Opening fields
    {
      id: 'step2-wc-opening-qty',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'How many areas — like how many identical openings?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.quantity = String(Math.round(num));
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'How many openings?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === false,
    },
    {
      id: 'step2-wc-opening-size',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Opening size?',
      parse: (spoken, data) => {
        data.jobTypeDetails['WALL CUTTING']._currentCut.openingSize = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === false,
    },
    {
      id: 'step2-wc-opening-length',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Length in feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.length = String(num);
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'Length in feet?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === false,
    },
    {
      id: 'step2-wc-opening-width',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Width in feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.width = String(num);
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'Width in feet?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === false,
    },
    {
      id: 'step2-wc-opening-thickness',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Thickness in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.thickness = String(num);
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'Thickness in inches?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.linearCutOnly === false,
    },
    // Wall cutting removal
    {
      id: 'step2-wc-removing',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Are they removing material?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') {
          data.jobTypeDetails['WALL CUTTING']._currentCut.removing = true;
          return { success: true, value: true };
        }
        if (yn === 'no') {
          data.jobTypeDetails['WALL CUTTING']._currentCut.removing = false;
          // Finalize cut
          const cuts = data.jobTypeDetails['WALL CUTTING'].cuts || [];
          const current = { ...data.jobTypeDetails['WALL CUTTING']._currentCut };
          delete data.jobTypeDetails['WALL CUTTING']._currentCut;
          cuts.push(current);
          data.jobTypeDetails['WALL CUTTING'].cuts = cuts;
          return { success: true, value: false, message: 'No material removal.' };
        }
        return { success: false, retryMessage: 'Are they removing material? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },
    {
      id: 'step2-wc-removal-equipment',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'What equipment on site? Forklift, 6K lull, 8K lull, 10K lull, or other?',
      parse: (spoken, data) => {
        const match = fuzzyMatch(spoken, WALL_CUTTING_REMOVAL_EQUIPMENT, 0.4);
        if (match) {
          data.jobTypeDetails['WALL CUTTING']._currentCut.equipment = match;
          // Finalize cut
          const cuts = data.jobTypeDetails['WALL CUTTING'].cuts || [];
          const current = { ...data.jobTypeDetails['WALL CUTTING']._currentCut };
          delete data.jobTypeDetails['WALL CUTTING']._currentCut;
          cuts.push(current);
          data.jobTypeDetails['WALL CUTTING'].cuts = cuts;
          return { success: true, value: match, message: `${match}. Got it.` };
        }
        return { success: false, retryMessage: 'Forklift, 6K lull, 8K lull, 10K lull, or other?' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING') &&
        data.jobTypeDetails['WALL CUTTING']?._currentCut?.removing === true,
    },
    {
      id: 'step2-wc-cuts-more',
      formStep: 2,
      field: 'WALL_CUTTING.cuts',
      prompt: 'Any more cut sets, or are we done with wall cutting?',
      parse: (spoken) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') {
          return { success: true, value: 'done' };
        }
        return { success: true, value: 'more' };
      },
      condition: (data) => data.jobTypes.includes('WALL CUTTING'),
    },

    // --- SLAB SAWING FREE SPEECH ---
    {
      id: 'step2-ss-free-speech',
      formStep: 2,
      field: '_step2_ss_free_speech',
      prompt: "Give me the slab sawing details — material, overcuts, and the cuts. Linear feet or areas with dimensions and thickness. Are they removing material? Go ahead.",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },
    {
      id: 'step2-ss-free-speech-confirm',
      formStep: 2,
      field: '_step2_ss_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },

    // --- SLAB SAWING ---
    {
      id: 'step2-ss-material',
      formStep: 2,
      field: 'SLAB_SAWING.material',
      prompt: 'What material? Reinforced concrete, asphalt, or green concrete?',
      parse: (spoken, data) => {
        const match = fuzzyMatch(spoken, SLAB_SAWING_MATERIALS, 0.4);
        if (match) {
          if (!data.jobTypeDetails['SLAB SAWING']) data.jobTypeDetails['SLAB SAWING'] = {};
          data.jobTypeDetails['SLAB SAWING'].material = match;
          return { success: true, value: match, message: `${match}.` };
        }
        return { success: false, retryMessage: 'Reinforced concrete, asphalt, or green concrete?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },
    {
      id: 'step2-ss-overcuts',
      formStep: 2,
      field: 'SLAB_SAWING.overcutsAllowed',
      prompt: 'Overcuts allowed?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn) {
          if (!data.jobTypeDetails['SLAB SAWING']) data.jobTypeDetails['SLAB SAWING'] = {};
          data.jobTypeDetails['SLAB SAWING'].overcutsAllowed = yn === 'yes' ? 'Yes' : 'No';
          return { success: true, value: yn };
        }
        return { success: false, retryMessage: 'Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },
    {
      id: 'step2-ss-cut-type',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Are we measuring linear feet or areas?',
      parse: (spoken, data) => {
        const normalized = spoken.toLowerCase();
        if (!data.jobTypeDetails['SLAB SAWING']) data.jobTypeDetails['SLAB SAWING'] = {};
        if (!data.jobTypeDetails['SLAB SAWING']._currentCut) data.jobTypeDetails['SLAB SAWING']._currentCut = {};
        if (normalized.includes('linear') || normalized.includes('feet') || normalized.includes('foot')) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.cutType = 'Linear Feet';
          return { success: true, value: 'linear' };
        }
        if (normalized.includes('area') || normalized.includes('dimension')) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.cutType = 'Areas';
          return { success: true, value: 'areas' };
        }
        return { success: false, retryMessage: 'Linear feet or areas?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },
    {
      id: 'step2-ss-linear-feet',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'How many linear feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.linearFeet = String(num);
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'How many linear feet?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') &&
        data.jobTypeDetails['SLAB SAWING']?._currentCut?.cutType === 'Linear Feet',
    },
    {
      id: 'step2-ss-linear-thickness',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Thickness in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.thickness = String(num);
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'Thickness in inches?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') &&
        data.jobTypeDetails['SLAB SAWING']?._currentCut?.cutType === 'Linear Feet',
    },
    {
      id: 'step2-ss-area-qty',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'How many areas?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.quantity = String(Math.round(num));
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'How many areas?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') &&
        data.jobTypeDetails['SLAB SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-ss-area-length',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Length in feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['SLAB SAWING']._currentCut.length = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Length in feet?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') && data.jobTypeDetails['SLAB SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-ss-area-width',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Width in feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['SLAB SAWING']._currentCut.width = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Width in feet?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') && data.jobTypeDetails['SLAB SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-ss-area-thickness',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Thickness in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['SLAB SAWING']._currentCut.thickness = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Thickness in inches?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') && data.jobTypeDetails['SLAB SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-ss-removing',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Are they removing material?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') {
          data.jobTypeDetails['SLAB SAWING']._currentCut.removing = true;
          return { success: true, value: true };
        }
        if (yn === 'no') {
          data.jobTypeDetails['SLAB SAWING']._currentCut.removing = false;
          const cuts = data.jobTypeDetails['SLAB SAWING'].cuts || [];
          const current = { ...data.jobTypeDetails['SLAB SAWING']._currentCut };
          delete data.jobTypeDetails['SLAB SAWING']._currentCut;
          cuts.push(current);
          data.jobTypeDetails['SLAB SAWING'].cuts = cuts;
          return { success: true, value: false };
        }
        return { success: false, retryMessage: 'Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },
    {
      id: 'step2-ss-removal-equip',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'What equipment on site? Dolly hand removal, Sherpa, skidsteer, forklift, or A frame? Tell me all that apply.',
      parse: (spoken, data) => {
        const matches = fuzzyMatchMultiple(spoken, SLAB_HAND_REMOVAL_EQUIPMENT);
        if (matches.length > 0) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.equipment = matches;
          const cuts = data.jobTypeDetails['SLAB SAWING'].cuts || [];
          const current = { ...data.jobTypeDetails['SLAB SAWING']._currentCut };
          delete data.jobTypeDetails['SLAB SAWING']._currentCut;
          cuts.push(current);
          data.jobTypeDetails['SLAB SAWING'].cuts = cuts;
          return { success: true, value: matches, message: `Got ${matches.join(' and ')}.` };
        }
        const single = fuzzyMatch(spoken, SLAB_HAND_REMOVAL_EQUIPMENT, 0.4);
        if (single) {
          data.jobTypeDetails['SLAB SAWING']._currentCut.equipment = [single];
          const cuts = data.jobTypeDetails['SLAB SAWING'].cuts || [];
          const current = { ...data.jobTypeDetails['SLAB SAWING']._currentCut };
          delete data.jobTypeDetails['SLAB SAWING']._currentCut;
          cuts.push(current);
          data.jobTypeDetails['SLAB SAWING'].cuts = cuts;
          return { success: true, value: [single], message: `Got ${single}.` };
        }
        return { success: false, retryMessage: 'Dolly hand removal, Sherpa, skidsteer, forklift, or A frame?' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING') &&
        data.jobTypeDetails['SLAB SAWING']?._currentCut?.removing === true,
    },
    {
      id: 'step2-ss-cuts-more',
      formStep: 2,
      field: 'SLAB_SAWING.cuts',
      prompt: 'Any more cut sets for slab sawing?',
      parse: (spoken) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') return { success: true, value: 'done' };
        return { success: true, value: 'more' };
      },
      condition: (data) => data.jobTypes.includes('SLAB SAWING'),
    },

    // --- HAND SAWING FREE SPEECH ---
    {
      id: 'step2-hs-free-speech',
      formStep: 2,
      field: '_step2_hs_free_speech',
      prompt: "What about the hand sawing? Material, location type, overcuts, and the cuts — linear or areas with dimensions. Go ahead.",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },
    {
      id: 'step2-hs-free-speech-confirm',
      formStep: 2,
      field: '_step2_hs_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },

    // --- HAND SAWING ---
    {
      id: 'step2-hs-material',
      formStep: 2,
      field: 'HAND_SAWING.material',
      prompt: 'What material type? Concrete, block, brick, or rock?',
      parse: (spoken, data) => {
        const match = fuzzyMatch(spoken, HAND_SAWING_MATERIALS, 0.4);
        if (match) {
          if (!data.jobTypeDetails['HAND SAWING']) data.jobTypeDetails['HAND SAWING'] = {};
          data.jobTypeDetails['HAND SAWING'].material = match;
          return { success: true, value: match, message: `${match}.` };
        }
        return { success: false, retryMessage: 'Concrete, block, brick, or rock?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },
    {
      id: 'step2-hs-locations',
      formStep: 2,
      field: 'HAND_SAWING.locations',
      prompt: 'Location type — slab on grade, elevated slab, or vertical cutting? Tell me all that apply.',
      parse: (spoken, data) => {
        const matches = fuzzyMatchMultiple(spoken, HAND_SAWING_LOCATIONS);
        if (matches.length > 0) {
          if (!data.jobTypeDetails['HAND SAWING']) data.jobTypeDetails['HAND SAWING'] = {};
          data.jobTypeDetails['HAND SAWING'].locations = matches;
          return { success: true, value: matches, message: `Got ${matches.join(' and ')}.` };
        }
        const single = fuzzyMatch(spoken, HAND_SAWING_LOCATIONS, 0.4);
        if (single) {
          if (!data.jobTypeDetails['HAND SAWING']) data.jobTypeDetails['HAND SAWING'] = {};
          data.jobTypeDetails['HAND SAWING'].locations = [single];
          return { success: true, value: [single], message: `Got ${single}.` };
        }
        return { success: false, retryMessage: 'Slab on grade, elevated slab, or vertical cutting?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },
    {
      id: 'step2-hs-overcuts',
      formStep: 2,
      field: 'HAND_SAWING.overcutsAllowed',
      prompt: 'Are overcuts allowed?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn) {
          if (!data.jobTypeDetails['HAND SAWING']) data.jobTypeDetails['HAND SAWING'] = {};
          data.jobTypeDetails['HAND SAWING'].overcutsAllowed = yn === 'yes' ? 'Yes' : 'No';
          return { success: true, value: yn };
        }
        return { success: false, retryMessage: 'Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },
    {
      id: 'step2-hs-cut-type',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Are we measuring linear feet or areas?',
      parse: (spoken, data) => {
        const normalized = spoken.toLowerCase();
        if (!data.jobTypeDetails['HAND SAWING']) data.jobTypeDetails['HAND SAWING'] = {};
        if (!data.jobTypeDetails['HAND SAWING']._currentCut) data.jobTypeDetails['HAND SAWING']._currentCut = {};
        if (normalized.includes('linear') || normalized.includes('feet') || normalized.includes('foot')) {
          data.jobTypeDetails['HAND SAWING']._currentCut.cutType = 'Linear Feet';
          return { success: true, value: 'linear' };
        }
        if (normalized.includes('area') || normalized.includes('dimension')) {
          data.jobTypeDetails['HAND SAWING']._currentCut.cutType = 'Areas';
          return { success: true, value: 'areas' };
        }
        return { success: false, retryMessage: 'Linear feet or areas?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },
    {
      id: 'step2-hs-linear-feet',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'How many linear feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['HAND SAWING']._currentCut.linearFeet = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'How many linear feet?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.cutType === 'Linear Feet',
    },
    {
      id: 'step2-hs-linear-depth',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Depth of cut in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['HAND SAWING']._currentCut.thickness = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Depth of cut in inches?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.cutType === 'Linear Feet',
    },
    {
      id: 'step2-hs-area-qty',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'How many areas?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['HAND SAWING']._currentCut.quantity = String(Math.round(num)); return { success: true, value: num }; }
        return { success: false, retryMessage: 'How many areas?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-hs-area-length',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Length in feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['HAND SAWING']._currentCut.length = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Length in feet?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-hs-area-width',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Width in feet?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['HAND SAWING']._currentCut.width = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Width in feet?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-hs-area-thickness',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Thickness in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) { data.jobTypeDetails['HAND SAWING']._currentCut.thickness = String(num); return { success: true, value: num }; }
        return { success: false, retryMessage: 'Thickness in inches?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.cutType === 'Areas',
    },
    {
      id: 'step2-hs-removing',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Are they removing material?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') { data.jobTypeDetails['HAND SAWING']._currentCut.removing = true; return { success: true, value: true }; }
        if (yn === 'no') {
          data.jobTypeDetails['HAND SAWING']._currentCut.removing = false;
          const cuts = data.jobTypeDetails['HAND SAWING'].cuts || [];
          cuts.push({ ...data.jobTypeDetails['HAND SAWING']._currentCut });
          delete data.jobTypeDetails['HAND SAWING']._currentCut;
          data.jobTypeDetails['HAND SAWING'].cuts = cuts;
          return { success: true, value: false };
        }
        return { success: false, retryMessage: 'Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },
    {
      id: 'step2-hs-removal-equip',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'What equipment on site? Dolly hand removal, Sherpa, skidsteer, forklift, or A frame? Tell me all that apply.',
      parse: (spoken, data) => {
        const matches = fuzzyMatchMultiple(spoken, SLAB_HAND_REMOVAL_EQUIPMENT);
        const result = matches.length > 0 ? matches : (() => { const s = fuzzyMatch(spoken, SLAB_HAND_REMOVAL_EQUIPMENT, 0.4); return s ? [s] : []; })();
        if (result.length > 0) {
          data.jobTypeDetails['HAND SAWING']._currentCut.equipment = result;
          const cuts = data.jobTypeDetails['HAND SAWING'].cuts || [];
          cuts.push({ ...data.jobTypeDetails['HAND SAWING']._currentCut });
          delete data.jobTypeDetails['HAND SAWING']._currentCut;
          data.jobTypeDetails['HAND SAWING'].cuts = cuts;
          return { success: true, value: result, message: `Got ${result.join(' and ')}.` };
        }
        return { success: false, retryMessage: 'Dolly hand removal, Sherpa, skidsteer, forklift, or A frame?' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING') && data.jobTypeDetails['HAND SAWING']?._currentCut?.removing === true,
    },
    {
      id: 'step2-hs-cuts-more',
      formStep: 2,
      field: 'HAND_SAWING.cuts',
      prompt: 'Any more cut sets for hand sawing?',
      parse: (spoken) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') return { success: true, value: 'done' };
        return { success: true, value: 'more' };
      },
      condition: (data) => data.jobTypes.includes('HAND SAWING'),
    },

    // --- WIRE SAWING FREE SPEECH ---
    {
      id: 'step2-ws-free-speech',
      formStep: 2,
      field: '_step2_ws_free_speech',
      prompt: "Describe the wire sawing cuts — just tell me what they need to cut.",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('WIRE SAWING'),
    },
    {
      id: 'step2-ws-free-speech-confirm',
      formStep: 2,
      field: '_step2_ws_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('WIRE SAWING'),
    },

    // --- WIRE SAWING ---
    {
      id: 'step2-ws-description',
      formStep: 2,
      field: 'WIRE_SAWING.cuts',
      prompt: 'Describe the cuts for wire sawing.',
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          if (!data.jobTypeDetails['WIRE SAWING']) data.jobTypeDetails['WIRE SAWING'] = {};
          if (!data.jobTypeDetails['WIRE SAWING'].cuts) data.jobTypeDetails['WIRE SAWING'].cuts = [];
          data.jobTypeDetails['WIRE SAWING'].cuts.push({ description: spoken.trim() });
          return { success: true, value: spoken.trim(), message: 'Got it.' };
        }
        return { success: false, retryMessage: 'Describe the cut.' };
      },
      condition: (data) => data.jobTypes.includes('WIRE SAWING'),
    },
    {
      id: 'step2-ws-cuts-more',
      formStep: 2,
      field: 'WIRE_SAWING.cuts',
      prompt: 'Any more cuts for wire sawing?',
      parse: (spoken, data) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') return { success: true, value: 'done' };
        // They might be describing the next cut right away
        if (spoken.trim().length > 5) {
          if (!data.jobTypeDetails['WIRE SAWING'].cuts) data.jobTypeDetails['WIRE SAWING'].cuts = [];
          data.jobTypeDetails['WIRE SAWING'].cuts.push({ description: spoken.trim() });
          return { success: true, value: 'added', message: 'Added.' };
        }
        return { success: true, value: 'more' };
      },
      condition: (data) => data.jobTypes.includes('WIRE SAWING'),
    },

    // --- CONCRETE DEMOLITION FREE SPEECH ---
    {
      id: 'step2-dm-free-speech',
      formStep: 2,
      field: '_step2_dm_free_speech',
      prompt: "Give me the demolition details — Brokk or jackhammering, removal needed, and the areas with volume, thickness, and material. Go ahead.",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },
    {
      id: 'step2-dm-free-speech-confirm',
      formStep: 2,
      field: '_step2_dm_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },

    // --- CONCRETE DEMOLITION ---
    {
      id: 'step2-dm-methods',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.methods',
      prompt: 'What demolition methods? Brokk demo or jackhammering? Tell me all that apply.',
      parse: (spoken, data) => {
        const matches = fuzzyMatchMultiple(spoken, DEMOLITION_METHODS);
        if (matches.length > 0) {
          if (!data.jobTypeDetails['CONCRETE DEMOLITION']) data.jobTypeDetails['CONCRETE DEMOLITION'] = {};
          data.jobTypeDetails['CONCRETE DEMOLITION'].methods = matches;
          return { success: true, value: matches, message: `Got ${matches.join(' and ')}.` };
        }
        const single = fuzzyMatch(spoken, DEMOLITION_METHODS, 0.3);
        if (single) {
          if (!data.jobTypeDetails['CONCRETE DEMOLITION']) data.jobTypeDetails['CONCRETE DEMOLITION'] = {};
          data.jobTypeDetails['CONCRETE DEMOLITION'].methods = [single];
          return { success: true, value: [single], message: `Got ${single}.` };
        }
        return { success: false, retryMessage: 'Brokk demo or jackhammering?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },
    {
      id: 'step2-dm-removal',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.removal',
      prompt: 'Is removal required?',
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn) {
          if (!data.jobTypeDetails['CONCRETE DEMOLITION']) data.jobTypeDetails['CONCRETE DEMOLITION'] = {};
          data.jobTypeDetails['CONCRETE DEMOLITION'].removal = yn === 'yes' ? 'Yes' : 'No';
          return { success: true, value: yn };
        }
        return { success: false, retryMessage: 'Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },
    {
      id: 'step2-dm-area-volume',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.areas',
      prompt: 'Give me the area or volume.',
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          if (!data.jobTypeDetails['CONCRETE DEMOLITION']) data.jobTypeDetails['CONCRETE DEMOLITION'] = {};
          if (!data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea) data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea = {};
          data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea.areaVolume = spoken.trim();
          return { success: true, value: spoken.trim() };
        }
        return { success: false, retryMessage: 'What is the area or volume?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },
    {
      id: 'step2-dm-area-thickness',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.areas',
      prompt: 'Thickness in inches?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea.thickness = String(num);
          return { success: true, value: num };
        }
        return { success: false, retryMessage: 'Thickness in inches?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },
    {
      id: 'step2-dm-area-material',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.areas',
      prompt: 'What material? Reinforced concrete, block and brick, or other?',
      parse: (spoken, data) => {
        const match = fuzzyMatch(spoken, DEMOLITION_MATERIALS, 0.4);
        if (match) {
          data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea.material = match;
          if (match !== 'Other') {
            // Finalize area
            const areas = data.jobTypeDetails['CONCRETE DEMOLITION'].areas || [];
            areas.push({ ...data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea });
            delete data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea;
            data.jobTypeDetails['CONCRETE DEMOLITION'].areas = areas;
          }
          return { success: true, value: match, message: `${match}.` };
        }
        return { success: false, retryMessage: 'Reinforced concrete, block and brick, or other?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },
    {
      id: 'step2-dm-area-material-other',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.areas',
      prompt: 'What material?',
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea.materialOther = spoken.trim();
          const areas = data.jobTypeDetails['CONCRETE DEMOLITION'].areas || [];
          areas.push({ ...data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea });
          delete data.jobTypeDetails['CONCRETE DEMOLITION']._currentArea;
          data.jobTypeDetails['CONCRETE DEMOLITION'].areas = areas;
          return { success: true, value: spoken.trim() };
        }
        return { success: false, retryMessage: 'What is the material?' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION') &&
        data.jobTypeDetails['CONCRETE DEMOLITION']?._currentArea?.material === 'Other',
    },
    {
      id: 'step2-dm-areas-more',
      formStep: 2,
      field: 'CONCRETE_DEMOLITION.areas',
      prompt: 'Any more areas?',
      parse: (spoken) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') return { success: true, value: 'done' };
        return { success: true, value: 'more' };
      },
      condition: (data) => data.jobTypes.includes('CONCRETE DEMOLITION'),
    },

    // --- GPR SCANNING FREE SPEECH ---
    {
      id: 'step2-gpr-free-speech',
      formStep: 2,
      field: '_step2_gpr_free_speech',
      prompt: "How big is the GPR scan area?",
      parse: (spoken) => ({ success: true, value: { raw: spoken }, message: '' }),
      condition: (data) => data.jobTypes.includes('GPR SCANNING'),
    },
    {
      id: 'step2-gpr-free-speech-confirm',
      formStep: 2,
      field: '_step2_gpr_free_speech_confirm',
      prompt: '',
      parse: (spoken) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') return { success: true, value: 'confirmed', message: 'Perfect.' };
        if (yn === 'no') return { success: true, value: 'rejected', message: "No problem, let me ask step by step." };
        if (spoken.toLowerCase().includes('ask me') || spoken.toLowerCase().includes('step by step')) {
          return { success: true, value: 'rejected', message: "Sure thing." };
        }
        return { success: false, retryMessage: 'Did I get that right? Yes or no?' };
      },
      condition: (data) => data.jobTypes.includes('GPR SCANNING'),
    },

    // --- GPR SCANNING ---
    {
      id: 'step2-gpr-area',
      formStep: 2,
      field: 'GPR_SCANNING.quantity',
      prompt: 'How big is the scan area? Like 500 square feet.',
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          if (!data.jobTypeDetails['GPR SCANNING']) data.jobTypeDetails['GPR SCANNING'] = {};
          data.jobTypeDetails['GPR SCANNING'].quantity = spoken.trim();
          return { success: true, value: spoken.trim(), message: `${spoken.trim()}. Got it.` };
        }
        return { success: false, retryMessage: 'What is the scan area?' };
      },
      condition: (data) => data.jobTypes.includes('GPR SCANNING'),
    },

    // --- Additional comments (end of Step 2) ---
    {
      id: 'step2-additional-comments',
      formStep: 2,
      prompt: 'Any additional comments or special instructions for the operators?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) {
          return { success: true, value: '', message: 'Work details are done. Let\'s get the location.' };
        }
        data.additionalInfo = spoken.trim();
        return { success: true, value: spoken.trim(), message: 'Work details are done. Let\'s get the location.' };
      },
      condition: (data) => data.jobTypes.some(t => t !== 'SHOP TICKET'),
    },

    // ========================================
    // STEP 3: LOCATION
    // ========================================
    {
      id: 'step3-location',
      formStep: 3,
      prompt: "What's the location name? Like the site name.",
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          data.location = spoken.trim();
          return { success: true, value: spoken.trim(), message: `${spoken.trim()}.` };
        }
        return { success: false, retryMessage: 'What is the location or site name?' };
      },
    },
    {
      id: 'step3-address',
      formStep: 3,
      prompt: "What's the full address?",
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          data.address = spoken.trim();
          return { success: true, value: spoken.trim(), message: `${spoken.trim()}. Got it.` };
        }
        return { success: false, retryMessage: 'What is the full address?' };
      },
    },
    {
      id: 'step3-drive-time',
      formStep: 3,
      prompt: 'Any idea on drive time? Give me hours and minutes, or say skip.',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) {
          return { success: true, value: 'skip', message: 'Location locked in. Let\'s do the schedule.' };
        }
        const num = parseNumber(spoken);
        if (num !== null) {
          // If they said just a number, interpret as minutes if < 10, hours otherwise
          if (num < 10) {
            data.estimatedDriveHours = Math.floor(num);
            data.estimatedDriveMinutes = Math.round((num % 1) * 60);
          } else {
            data.estimatedDriveMinutes = Math.round(num);
          }
          return { success: true, value: num, message: 'Location locked in. Let\'s do the schedule.' };
        }
        // Try to parse "X hours Y minutes" pattern
        const hoursMatch = spoken.match(/(\d+)\s*hour/i);
        const minutesMatch = spoken.match(/(\d+)\s*min/i);
        if (hoursMatch || minutesMatch) {
          data.estimatedDriveHours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
          data.estimatedDriveMinutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
          return { success: true, value: `${data.estimatedDriveHours}h ${data.estimatedDriveMinutes}m`, message: 'Location locked in. Let\'s do the schedule.' };
        }
        return { success: true, value: 'skip', message: 'Location locked in. Let\'s do the schedule.' };
      },
    },

    // ========================================
    // STEP 4: SCHEDULE
    // ========================================
    {
      id: 'step4-start-date',
      formStep: 4,
      prompt: "What's the start date?",
      parse: (spoken, data) => {
        const date = parseDate(spoken);
        if (date) {
          data.startDate = date;
          data.endDate = date; // Default end = start
          return { success: true, value: date, message: `${formatDateDisplay(date)}. Got it.` };
        }
        return { success: false, retryMessage: 'What date? You can say tomorrow, next Monday, February 20th, or a date like 2/20.' };
      },
    },
    {
      id: 'step4-multi-day',
      formStep: 4,
      prompt: 'Is this a multi-day job or just that day?',
      parse: (spoken, data) => {
        const normalized = spoken.toLowerCase();
        if (normalized.includes('multi') || normalized.includes('multiple') || normalized.includes('more than')) {
          return { success: true, value: 'multi' };
        }
        if (normalized.includes('just') || normalized.includes('single') || normalized.includes('one day') || detectYesNo(spoken) === 'no') {
          return { success: true, value: 'single', message: 'Single day.' };
        }
        // Default to single
        return { success: true, value: 'single', message: 'Single day.' };
      },
    },
    {
      id: 'step4-end-date',
      formStep: 4,
      prompt: "What's the end date?",
      parse: (spoken, data) => {
        const date = parseDate(spoken);
        if (date) {
          data.endDate = date;
          return { success: true, value: date, message: `End date: ${formatDateDisplay(date)}.` };
        }
        return { success: false, retryMessage: 'What is the end date?' };
      },
      condition: (_data) => true, // Overlay handles showing this only after 'multi' answer
    },
    {
      id: 'step4-arrival-time',
      formStep: 4,
      prompt: 'What time should they arrive on site?',
      parse: (spoken, data) => {
        const time = parseTime(spoken);
        if (time) {
          data.arrivalTime = time;
          return { success: true, value: time, message: `${formatTimeDisplay(time)}.` };
        }
        return { success: false, retryMessage: 'What time? Like 7 AM or 7:30.' };
      },
    },
    {
      id: 'step4-shop-time',
      formStep: 4,
      prompt: 'What time at the shop?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) {
          return { success: true, value: 'skip' };
        }
        const time = parseTime(spoken);
        if (time) {
          data.shopArrivalTime = time;
          return { success: true, value: time, message: `Shop time: ${formatTimeDisplay(time)}.` };
        }
        return { success: false, retryMessage: 'What time at the shop, or say skip?' };
      },
    },
    {
      id: 'step4-estimated-hours',
      formStep: 4,
      prompt: 'How many hours you estimating?',
      parse: (spoken, data) => {
        const num = parseNumber(spoken);
        if (num !== null) {
          data.estimatedHours = String(num);
          return { success: true, value: num, message: `${num} hours. Schedule is set. Who are we sending?` };
        }
        return { success: false, retryMessage: 'How many hours?' };
      },
    },

    // ========================================
    // STEP 5: TEAM ASSIGNMENT
    // ========================================
    {
      id: 'step5-operators',
      formStep: 5,
      prompt: "Who are we sending out? Give me the operator names.",
      parse: (spoken, data) => {
        if (detectSkip(spoken) || detectDone(spoken)) {
          return { success: true, value: 'skip', message: "No worries, we can assign later." };
        }
        const match = matchName(spoken, data._operators);
        if (match && !data.technicians.find(t => t.id === match.id)) {
          data.technicians.push(match);
          return { success: true, value: match, message: `Got ${match.full_name}.` };
        }
        if (match) {
          return { success: true, value: match, message: `Already have ${match.full_name}.` };
        }
        return { success: false, retryMessage: "I didn't catch that name. Who are we sending?" };
      },
      isLoop: true,
    },
    {
      id: 'step5-operators-more',
      formStep: 5,
      prompt: 'Anyone else?',
      parse: (spoken, data) => {
        if (detectDone(spoken) || detectYesNo(spoken) === 'no') {
          return { success: true, value: 'done' };
        }
        const match = matchName(spoken, data._operators);
        if (match && !data.technicians.find(t => t.id === match.id)) {
          data.technicians.push(match);
          return { success: true, value: 'added', message: `Added ${match.full_name}.` };
        }
        return { success: true, value: 'done' };
      },
    },
    {
      id: 'step5-salesman',
      formStep: 5,
      prompt: "Who's the salesman or admin on this one?",
      parse: (spoken, data) => {
        if (detectSkip(spoken)) {
          return { success: true, value: 'skip', message: "Team's set. Let's talk equipment." };
        }
        const match = matchName(spoken, data._admins);
        if (match) {
          data.salesman = match;
          return { success: true, value: match, message: `${match.full_name}. Team's set. Let's talk equipment.` };
        }
        return { success: false, retryMessage: "Which salesman or admin?" };
      },
    },

    // ========================================
    // STEP 6: EQUIPMENT
    // ========================================
    {
      id: 'step6-equipment-recs',
      formStep: 6,
      prompt: (data) => {
        const types = data.jobTypes.filter(t => t !== 'SHOP TICKET').join(' and ');
        return `Based on ${types}, want me to add the recommended equipment?`;
      },
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') {
          // Auto-add smart recommendations based on job type
          // This is simplified — the real form has detailed recs per type
          return { success: true, value: 'yes', message: 'Recommended equipment added.' };
        }
        return { success: true, value: 'no' };
      },
      condition: (data) => data.jobTypes.some(t => t !== 'SHOP TICKET'),
    },
    {
      id: 'step6-equipment-custom',
      formStep: 6,
      prompt: 'Anything else to add? Tell me the equipment, or say done.',
      parse: (spoken, data) => {
        if (detectDone(spoken) || detectSkip(spoken)) {
          return { success: true, value: 'done', message: "Equipment is loaded. Almost done — job info next." };
        }
        // Add whatever they say as custom equipment
        const item = spoken.trim();
        if (item.length > 0 && !data.equipment.includes(item)) {
          data.equipment.push(item);
          return { success: true, value: 'added', message: `Added ${item}.` };
        }
        return { success: true, value: 'done', message: "Equipment is loaded. Almost done — job info next." };
      },
      isLoop: true,
    },

    // ========================================
    // STEP 7: JOB INFORMATION
    // ========================================

    // Shop ticket path
    {
      id: 'step7-st-contact',
      formStep: 7,
      prompt: "Who's the contact?",
      parse: (spoken, data) => {
        if (spoken.trim().length > 0) {
          data.contactOnSite = spoken.trim();
          return { success: true, value: spoken.trim() };
        }
        return { success: false, retryMessage: "Who's the contact?" };
      },
      condition: (data) => data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1,
    },
    {
      id: 'step7-st-phone',
      formStep: 7,
      prompt: 'Contact phone number?',
      parse: (spoken, data) => {
        const phone = parsePhoneNumber(spoken);
        if (phone) {
          data.contactPhone = phone;
          return { success: true, value: phone, message: `${phone}.` };
        }
        // Store raw if can't parse
        data.contactPhone = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1,
    },

    // Non-shop ticket path
    {
      id: 'step7-title',
      formStep: 7,
      prompt: "What's the customer job title?",
      parse: (spoken, data) => {
        data.title = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },
    {
      id: 'step7-customer',
      formStep: 7,
      prompt: 'Customer name?',
      parse: (spoken, data) => {
        data.customer = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },
    {
      id: 'step7-customer-phone',
      formStep: 7,
      prompt: 'Customer phone number, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        const phone = parsePhoneNumber(spoken);
        data.customerPhone = phone || spoken.trim();
        return { success: true, value: data.customerPhone };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },
    {
      id: 'step7-contact-site',
      formStep: 7,
      prompt: "Who's the contact on site?",
      parse: (spoken, data) => {
        data.contactOnSite = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },
    {
      id: 'step7-contact-phone',
      formStep: 7,
      prompt: 'Their phone number, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        const phone = parsePhoneNumber(spoken);
        data.contactPhone = phone || spoken.trim();
        return { success: true, value: data.contactPhone };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },
    {
      id: 'step7-po',
      formStep: 7,
      prompt: 'PO number, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        data.po = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },
    {
      id: 'step7-company',
      formStep: 7,
      prompt: 'Company name, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        data.companyName = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
      condition: (data) => !(data.jobTypes.includes('SHOP TICKET') && data.jobTypes.length === 1),
    },

    // Both paths converge
    {
      id: 'step7-customer-email',
      formStep: 7,
      prompt: 'Customer email for completion agreements, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        data.customerEmail = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
    },
    {
      id: 'step7-salesperson-email',
      formStep: 7,
      prompt: 'Salesperson email for notifications, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        data.salespersonEmail = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
    },
    {
      id: 'step7-gc',
      formStep: 7,
      prompt: 'General contractor on this job, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        data.jobSiteGC = spoken.trim();
        return { success: true, value: spoken.trim() };
      },
    },
    {
      id: 'step7-quote',
      formStep: 7,
      prompt: 'Any quoted price for this job, or skip?',
      parse: (spoken, data) => {
        if (detectSkip(spoken)) return { success: true, value: 'skip' };
        const amount = parseDollarAmount(spoken);
        if (amount !== null) {
          data.jobQuote = amount;
          return { success: true, value: amount, message: `$${amount.toLocaleString()}.` };
        }
        return { success: true, value: 'skip' };
      },
    },

    // ========================================
    // STEP 8: DOCUMENTS
    // ========================================
    {
      id: 'step8-documents',
      formStep: 8,
      prompt: (data) => `Silica dust exposure plan is always required, that's already checked. Do we need a JSA form on this one?`,
      parse: (spoken, data) => {
        const yn = detectYesNo(spoken);
        if (yn === 'yes') {
          if (!data.requiredDocuments.includes('jsa-form')) {
            data.requiredDocuments.push('jsa-form');
          }
          return { success: true, value: 'yes', message: `Alright ${firstName(data)}, that's everything. Let me put this together for you.` };
        }
        return { success: true, value: 'no', message: `Alright ${firstName(data)}, that's everything. Let me put this together for you.` };
      },
      nextStep: () => 'review',
    },
  ];
}
