/**
 * Bulk Extractor for PontiBot Free Speech Mode
 *
 * Extracts multiple form fields from a single natural language transcript.
 * Uses keyword-proximity for numeric fields and existing parsers for categorical fields.
 *
 * Example input: "hand sawing job difficulty 7 medium priority far parking indoor cleanliness 9"
 * Output: { jobTypes: ['HAND SAWING'], difficulty_rating: 7, priority: 'medium', ... }
 */

import {
  matchJobType,
  matchPriority,
  matchParking,
  matchEnvironment,
  fuzzyMatch,
  fuzzyMatchMultiple,
  detectYesNo,
} from '@/lib/voice-parser';

// ============================================================
// Types
// ============================================================

export interface ExtractionDetail {
  value: any;
  source: string; // The substring that matched
  confidence: number; // 0-1
}

export interface BulkExtractionResult {
  /** Partial PontiBotData with extracted fields */
  extracted: Record<string, any>;
  /** Field names that were confidently extracted */
  confident: string[];
  /** Field names that could NOT be extracted (need follow-up) */
  gaps: string[];
  /** Detailed extraction info per field */
  details: Record<string, ExtractionDetail>;
}

// ============================================================
// Job Type Aliases (duplicated from voice-parser for multi-match)
// ============================================================

const JOB_TYPE_ALIASES: Record<string, string> = {
  // Core Drilling
  'core drilling': 'CORE DRILLING',
  'core drill': 'CORE DRILLING',
  'coring': 'CORE DRILLING',
  'drilling': 'CORE DRILLING',
  'core drills': 'CORE DRILLING',
  'cored': 'CORE DRILLING',
  // Wall Cutting — plus common mishearings
  'wall cutting': 'WALL CUTTING',
  'wall sawing': 'WALL CUTTING',
  'wall saw': 'WALL CUTTING',
  'wall cut': 'WALL CUTTING',
  'wall sewing': 'WALL CUTTING',
  'wall sowing': 'WALL CUTTING',
  'wall soaring': 'WALL CUTTING',
  // Slab Sawing — plus common mishearings
  'slab sawing': 'SLAB SAWING',
  'slab saw': 'SLAB SAWING',
  'slab cutting': 'SLAB SAWING',
  'flat sawing': 'SLAB SAWING',
  'flat saw': 'SLAB SAWING',
  'slab sewing': 'SLAB SAWING',
  'slab sowing': 'SLAB SAWING',
  'flat sewing': 'SLAB SAWING',
  // Hand Sawing — plus common mishearings (most-reported issue!)
  'hand sawing': 'HAND SAWING',
  'hand saw': 'HAND SAWING',
  'hand cutting': 'HAND SAWING',
  'hand sewing': 'HAND SAWING',
  'hand sowing': 'HAND SAWING',
  'hand soaring': 'HAND SAWING',
  'handsawing': 'HAND SAWING',
  'handsewing': 'HAND SAWING',
  'hands awing': 'HAND SAWING',
  'hands owing': 'HAND SAWING',
  'hand sign': 'HAND SAWING',
  // Wire Sawing — plus common mishearings
  'wire sawing': 'WIRE SAWING',
  'wire saw': 'WIRE SAWING',
  'wire cutting': 'WIRE SAWING',
  'wire sewing': 'WIRE SAWING',
  'wire sowing': 'WIRE SAWING',
  // Concrete Demolition
  'concrete demolition': 'CONCRETE DEMOLITION',
  'demolition': 'CONCRETE DEMOLITION',
  'demo': 'CONCRETE DEMOLITION',
  'concrete demo': 'CONCRETE DEMOLITION',
  'demoing': 'CONCRETE DEMOLITION',
  'demolishing': 'CONCRETE DEMOLITION',
  // GPR Scanning
  'gpr scanning': 'GPR SCANNING',
  'gpr': 'GPR SCANNING',
  'ground penetrating radar': 'GPR SCANNING',
  'scanning': 'GPR SCANNING',
  'radar': 'GPR SCANNING',
  'gpr scan': 'GPR SCANNING',
  'ground penetrating': 'GPR SCANNING',
  'gp are': 'GPR SCANNING',
  // Shop Ticket
  'shop ticket': 'SHOP TICKET',
  'shop': 'SHOP TICKET',
  'shop work': 'SHOP TICKET',
};

// ============================================================
// Number Extraction with Positions
// ============================================================

interface NumberWithPosition {
  value: number;
  wordIndex: number; // Position in the word array
  source: string; // The original text that produced this number
}

const WORD_NUMBERS: Record<string, number> = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
  'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
  'ten': 10,
};

/**
 * Find ALL numbers in a transcript with their word-position indices.
 * Handles both digit numbers ("7") and word numbers ("seven").
 */
export function extractAllNumbers(transcript: string): NumberWithPosition[] {
  const words = transcript.toLowerCase().split(/\s+/);
  const results: NumberWithPosition[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z0-9.]/g, '');

    // Check for digit numbers
    const numMatch = word.match(/^(\d+\.?\d*)$/);
    if (numMatch) {
      results.push({
        value: parseFloat(numMatch[1]),
        wordIndex: i,
        source: word,
      });
      continue;
    }

    // Check for word numbers
    if (WORD_NUMBERS[word] !== undefined) {
      let value = WORD_NUMBERS[word];
      // Check for "and a half" following
      if (i + 3 < words.length && words[i + 1] === 'and' && words[i + 2] === 'a' && words[i + 3] === 'half') {
        value += 0.5;
      }
      results.push({
        value,
        wordIndex: i,
        source: word,
      });
    }
  }

  return results;
}

// ============================================================
// Keyword-Proximity Number Matching
// ============================================================

interface AnchorConfig {
  field: string;
  keywords: string[];
  min: number;
  max: number;
}

const NUMERIC_FIELD_ANCHORS: AnchorConfig[] = [
  {
    field: 'difficulty_rating',
    keywords: ['difficulty', 'hard', 'tough', 'easy', 'difficult'],
    min: 1,
    max: 10,
  },
  {
    field: 'site_cleanliness',
    keywords: ['clean', 'cleanliness', 'dirty', 'neat', 'tidy', 'mess', 'messy'],
    min: 1,
    max: 10,
  },
];

/**
 * Find the word-position of anchor keywords in a transcript.
 */
function findKeywordPositions(
  words: string[],
  keywords: string[]
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z]/g, '');
    for (const kw of keywords) {
      if (word === kw || word.startsWith(kw)) {
        positions.push(i);
        break;
      }
    }
  }
  return positions;
}

/**
 * Assign numbers to fields by keyword proximity.
 * Each number goes to the field whose anchor keyword is closest.
 */
function assignNumbersByProximity(
  transcript: string,
  numbers: NumberWithPosition[],
  anchors: AnchorConfig[]
): Record<string, { value: number; distance: number; source: string }> {
  const words = transcript.toLowerCase().split(/\s+/);
  const result: Record<string, { value: number; distance: number; source: string }> = {};

  // Build keyword positions for each field
  const fieldPositions: Record<string, number[]> = {};
  for (const anchor of anchors) {
    fieldPositions[anchor.field] = findKeywordPositions(words, anchor.keywords);
  }

  // For each number, find the closest anchor keyword
  for (const num of numbers) {
    let bestField: string | null = null;
    let bestDistance = Infinity;

    for (const anchor of anchors) {
      // Check if value is in valid range
      if (num.value < anchor.min || num.value > anchor.max) continue;

      const positions = fieldPositions[anchor.field];
      for (const pos of positions) {
        const distance = Math.abs(num.wordIndex - pos);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestField = anchor.field;
        }
      }
    }

    if (bestField) {
      // Only assign if this is closer than any previous assignment for this field
      if (!result[bestField] || bestDistance < result[bestField].distance) {
        result[bestField] = {
          value: num.value,
          distance: bestDistance,
          source: num.source,
        };
      }
    }
  }

  return result;
}

// ============================================================
// Job Type Multi-Match
// ============================================================

/**
 * Find ALL job types mentioned in a transcript.
 * Unlike matchJobType() which returns the first match,
 * this scans for all occurrences.
 */
/**
 * Phonetic normalization — collapse common speech-to-text confusions
 * so that "sewing", "sowing", "soaring" all normalize to "sawing".
 */
function phoneticNormalize(text: string): string {
  return text
    .replace(/\bsewing\b/g, 'sawing')
    .replace(/\bsowing\b/g, 'sawing')
    .replace(/\bsoaring\b/g, 'sawing')
    .replace(/\bsong\b/g, 'saw')
    .replace(/\bsign\b/g, 'sawing')
    .replace(/\bdrills?\b/g, 'drilling')
    .replace(/\bdemoing\b/g, 'demolition')
    .replace(/\bdemolishing\b/g, 'demolition');
}

function matchAllJobTypes(transcript: string): string[] {
  const normalized = transcript.toLowerCase().trim();
  const found = new Set<string>();

  // Sort aliases by length descending to match longer phrases first
  const sortedAliases = Object.entries(JOB_TYPE_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, jobType] of sortedAliases) {
    if (normalized.includes(alias) && !found.has(jobType)) {
      found.add(jobType);
    }
  }

  // Second pass: phonetic normalization then re-check
  if (found.size === 0) {
    const phonetic = phoneticNormalize(normalized);
    if (phonetic !== normalized) {
      for (const [alias, jobType] of sortedAliases) {
        if (phonetic.includes(alias) && !found.has(jobType)) {
          found.add(jobType);
        }
      }
    }
  }

  // Final fallback: single fuzzy match via voice-parser
  if (found.size === 0) {
    const fuzzyResult = matchJobType(transcript);
    if (fuzzyResult) found.add(fuzzyResult);
  }

  return Array.from(found);
}

// ============================================================
// Main Bulk Extractor
// ============================================================

/** All Step 1 field names for gap detection */
const STEP1_FIELDS = [
  'jobTypes',
  'difficulty_rating',
  'priority',
  'truck_parking',
  'work_environment',
  'site_cleanliness',
];

/**
 * Extract all Step 1 fields from a free-speech transcript.
 *
 * @param transcript The full speech transcript
 * @returns Extraction results with confident values and gaps
 */
export function bulkExtract(transcript: string): BulkExtractionResult {
  const extracted: Record<string, any> = {};
  const confident: string[] = [];
  const gaps: string[] = [];
  const details: Record<string, ExtractionDetail> = {};

  // --- Job Types ---
  const jobTypes = matchAllJobTypes(transcript);
  if (jobTypes.length > 0) {
    extracted.jobTypes = jobTypes;
    confident.push('jobTypes');
    details.jobTypes = {
      value: jobTypes,
      source: jobTypes.join(', '),
      confidence: 0.9,
    };
  } else {
    gaps.push('jobTypes');
  }

  // --- Priority (existing parser works on full text) ---
  const priority = matchPriority(transcript);
  if (priority) {
    extracted.priority = priority;
    confident.push('priority');
    details.priority = {
      value: priority,
      source: priority,
      confidence: 0.9,
    };
  } else {
    gaps.push('priority');
  }

  // --- Parking (existing parser works on full text) ---
  const parking = matchParking(transcript);
  if (parking) {
    extracted.truck_parking = parking;
    confident.push('truck_parking');
    details.truck_parking = {
      value: parking,
      source: parking,
      confidence: 0.85,
    };
  } else {
    gaps.push('truck_parking');
  }

  // --- Environment (existing parser works on full text) ---
  const environment = matchEnvironment(transcript);
  if (environment) {
    extracted.work_environment = environment;
    confident.push('work_environment');
    details.work_environment = {
      value: environment,
      source: environment,
      confidence: 0.9,
    };
  } else {
    gaps.push('work_environment');
  }

  // --- Numeric fields via keyword proximity ---
  const numbers = extractAllNumbers(transcript);
  const assignments = assignNumbersByProximity(transcript, numbers, NUMERIC_FIELD_ANCHORS);

  if (assignments.difficulty_rating) {
    extracted.difficulty_rating = Math.round(assignments.difficulty_rating.value);
    confident.push('difficulty_rating');
    details.difficulty_rating = {
      value: assignments.difficulty_rating.value,
      source: assignments.difficulty_rating.source,
      confidence: assignments.difficulty_rating.distance <= 5 ? 0.9 : 0.6,
    };
  } else {
    // Fallback: if there's exactly one unassigned number 1-10 and difficulty is the only
    // remaining numeric gap, assign it
    const unassigned = numbers.filter(n =>
      n.value >= 1 && n.value <= 10 &&
      !Object.values(assignments).some(a => a.source === n.source)
    );
    if (unassigned.length === 1 && !assignments.site_cleanliness) {
      // Ambiguous: one number, two possible fields — leave as gap
      gaps.push('difficulty_rating');
    } else {
      gaps.push('difficulty_rating');
    }
  }

  if (assignments.site_cleanliness) {
    extracted.site_cleanliness = Math.round(assignments.site_cleanliness.value);
    confident.push('site_cleanliness');
    details.site_cleanliness = {
      value: assignments.site_cleanliness.value,
      source: assignments.site_cleanliness.source,
      confidence: assignments.site_cleanliness.distance <= 5 ? 0.9 : 0.6,
    };
  } else {
    gaps.push('site_cleanliness');
  }

  return { extracted, confident, gaps, details };
}

// ============================================================
// Confirmation Prompt Builder
// ============================================================

/**
 * Build a natural language confirmation prompt from extracted data.
 * E.g., "Got it — HAND SAWING job, difficulty 7, medium priority, far parking, indoor, cleanliness 9. Sound right?"
 */
export function buildConfirmationPrompt(
  extracted: Record<string, any>,
  confident: string[]
): string {
  if (confident.length === 0) {
    return "I didn't catch any of that. Let me ask you step by step.";
  }

  const parts: string[] = [];

  if (confident.includes('jobTypes') && extracted.jobTypes?.length > 0) {
    const types = extracted.jobTypes.join(' and ');
    parts.push(`${types} job`);
  }

  if (confident.includes('difficulty_rating')) {
    parts.push(`difficulty ${extracted.difficulty_rating} out of 10`);
  }

  if (confident.includes('priority')) {
    parts.push(`${extracted.priority} priority`);
  }

  if (confident.includes('truck_parking')) {
    parts.push(`${extracted.truck_parking === 'far' ? 'far' : 'close'} parking`);
  }

  if (confident.includes('work_environment')) {
    parts.push(`${extracted.work_environment}`);
  }

  if (confident.includes('site_cleanliness')) {
    parts.push(`cleanliness ${extracted.site_cleanliness} out of 10`);
  }

  const summary = parts.join(', ');
  return `Got it — ${summary}. Sound right?`;
}

// ============================================================
// STEP 2 — Bulk Extraction for Work Details
// ============================================================

export interface Step2ExtractionResult {
  jobType: string;
  extracted: Record<string, any>;
  confident: string[];
  gaps: string[];
  details: Record<string, ExtractionDetail>;
}

// ============================================================
// Constants for Step 2 (matching pontibot-script.ts exactly)
// ============================================================

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
// Shared Helpers
// ============================================================

/**
 * Split transcript into segments at conjunctive boundaries.
 * e.g., "10 holes at 4 inches and also 5 holes at 6 inches" → 2 segments
 */
function splitIntoItemSegments(transcript: string, anchorWords: string[]): string[] {
  // First try splitting on explicit conjunctions
  const conjunctions = /\b(?:and\s+also|and\s+then|also\s+have|plus|another\s+set\s+of|then\s+we\s+have|then\s+there(?:'s| is| are)|additionally)\b/i;
  const segments = transcript.split(conjunctions).map(s => s.trim()).filter(s => s.length > 0);

  if (segments.length > 1) return segments;

  // Fallback: split on repeated anchor keywords
  const normalized = transcript.toLowerCase();
  const words = normalized.split(/\s+/);
  const anchorPositions: number[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^a-z]/g, '');
    for (const anchor of anchorWords) {
      if (w === anchor || w.startsWith(anchor)) {
        anchorPositions.push(i);
        break;
      }
    }
  }

  // If same anchor appears twice+, split between occurrences
  if (anchorPositions.length >= 2) {
    const result: string[] = [];
    const allWords = transcript.split(/\s+/);
    for (let i = 0; i < anchorPositions.length; i++) {
      const start = i === 0 ? 0 : anchorPositions[i];
      const end = i < anchorPositions.length - 1 ? anchorPositions[i + 1] : allWords.length;
      const seg = allWords.slice(start, end).join(' ').trim();
      if (seg) result.push(seg);
    }
    if (result.length > 1) return result;
  }

  return [transcript];
}

/**
 * Parse "X by Y by Z" dimension patterns.
 */
function parseDimensions(text: string): { values: number[]; source: string } | null {
  const byPattern = /(\d+\.?\d*)\s*(?:by|x|×)\s*(\d+\.?\d*)(?:\s*(?:by|x|×)\s*(\d+\.?\d*))?/i;
  const match = text.match(byPattern);
  if (match) {
    const values = [parseFloat(match[1]), parseFloat(match[2])];
    if (match[3]) values.push(parseFloat(match[3]));
    return { values, source: match[0] };
  }
  return null;
}

/**
 * Detect yes/no keywords near a specific keyword in text.
 */
function detectYesNoNear(text: string, keyword: string): 'yes' | 'no' | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword);
  if (idx === -1) return null;

  // Check surrounding 30 chars for yes/no indicators
  const surrounding = lower.substring(Math.max(0, idx - 30), Math.min(lower.length, idx + keyword.length + 30));
  if (/\b(yes|yeah|yep|allowed|definitely|sure)\b/.test(surrounding)) return 'yes';
  if (/\b(no|nope|not|none|don't|cant)\b/.test(surrounding)) return 'no';
  return null;
}

/**
 * Detect removal keywords in text.
 */
function detectRemoval(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/\b(removing|remove|removal|hauling|haul\s+away|take\s+out|taking\s+out)\b/.test(lower)) {
    // Check for negation
    if (/\b(not?\s+removing|no\s+removal|don't\s+remove|not\s+remove|no\s+remove)\b/.test(lower)) return false;
    return true;
  }
  return null;
}

// ============================================================
// Core Drilling Extractor
// ============================================================

const CD_NUMBER_ANCHORS: AnchorConfig[] = [
  { field: 'cd_hole_quantity', keywords: ['holes', 'hole'], min: 1, max: 500 },
  { field: 'cd_hole_diameter', keywords: ['diameter', 'dia', 'inch', 'wide'], min: 0.25, max: 48 },
  { field: 'cd_hole_depth', keywords: ['deep', 'depth', 'through'], min: 1, max: 120 },
  { field: 'cd_accessibility', keywords: ['accessibility', 'access', 'ranking'], min: 1, max: 5 },
];

function extractCoreDrilling(transcript: string): Step2ExtractionResult {
  const extracted: Record<string, any> = {};
  const confident: string[] = [];
  const gaps: string[] = [];
  const details: Record<string, ExtractionDetail> = {};
  const lower = transcript.toLowerCase();

  // --- Accessibility ---
  // Check for text descriptions first
  const accessMap: Record<string, string> = {
    'very hard': '1 - Very Hard (Tight Area)', 'tight': '1 - Very Hard (Tight Area)',
    'hard': '2 - Hard', 'moderate': '3 - Moderate',
    'easy': '4 - Easy', 'wide open': '5 - Wide Open',
  };
  let foundAccess = false;
  for (const [key, val] of Object.entries(accessMap)) {
    if (lower.includes(key)) {
      extracted.accessibility = val;
      confident.push('accessibility');
      details.accessibility = { value: val, source: key, confidence: 0.85 };
      foundAccess = true;
      break;
    }
  }
  if (!foundAccess) {
    // Try number near "access" keyword
    const numbers = extractAllNumbers(transcript);
    const assignments = assignNumbersByProximity(transcript, numbers,
      [{ field: 'cd_accessibility', keywords: ['accessibility', 'access', 'ranking'], min: 1, max: 5 }]
    );
    if (assignments.cd_accessibility) {
      const num = Math.round(assignments.cd_accessibility.value);
      extracted.accessibility = CORE_DRILLING_ACCESSIBILITY[num - 1];
      confident.push('accessibility');
      details.accessibility = { value: extracted.accessibility, source: String(num), confidence: 0.8 };
    } else {
      gaps.push('accessibility');
    }
  }

  // --- Locations ---
  const locations = fuzzyMatchMultiple(transcript, CORE_DRILLING_LOCATIONS);
  if (locations.length > 0) {
    extracted.locations = locations;
    confident.push('locations');
    details.locations = { value: locations, source: locations.join(', '), confidence: 0.9 };
  } else {
    const single = fuzzyMatch(transcript, CORE_DRILLING_LOCATIONS, 0.4);
    if (single) {
      extracted.locations = [single];
      confident.push('locations');
      details.locations = { value: [single], source: single, confidence: 0.8 };
    } else {
      gaps.push('locations');
    }
  }

  // --- Holes ---
  const holeSegments = splitIntoItemSegments(transcript, ['holes', 'hole']);
  const holes: any[] = [];

  for (const segment of holeSegments) {
    const numbers = extractAllNumbers(segment);
    const assignments = assignNumbersByProximity(segment, numbers, CD_NUMBER_ANCHORS);

    const hole: any = {};
    let hasData = false;

    if (assignments.cd_hole_quantity) {
      hole.quantity = String(Math.round(assignments.cd_hole_quantity.value));
      hasData = true;
    }
    if (assignments.cd_hole_diameter) {
      hole.diameter = String(assignments.cd_hole_diameter.value);
      hasData = true;
    }
    if (assignments.cd_hole_depth) {
      hole.depth = String(assignments.cd_hole_depth.value);
      hasData = true;
    }

    // Above 5 feet detection
    const segLower = segment.toLowerCase();
    if (/\b(above\s+5|above\s+five|over\s+5|over\s+five|high\s+up|elevated|overhead)\b/.test(segLower)) {
      hole.aboveFiveFeet = true;
      // Ladder/lift detection
      const ladderMatch = fuzzyMatch(segment, CORE_DRILLING_LADDER_LIFT, 0.3);
      if (ladderMatch) {
        hole.ladderLiftOption = ladderMatch;
      } else {
        // Check keyword aliases
        if (/scissor/i.test(segment)) hole.ladderLiftOption = 'Scissor Lift';
        else if (/12\s*(?:ft|foot)/i.test(segment)) hole.ladderLiftOption = '12ft Ladder';
        else if (/8\s*(?:ft|foot)/i.test(segment)) hole.ladderLiftOption = '8ft Ladder';
        else if (/6\s*(?:ft|foot)/i.test(segment)) hole.ladderLiftOption = '6ft Ladder';
      }
    } else if (/\b(not\s+above|below|under|ground\s+level)\b/.test(segLower)) {
      hole.aboveFiveFeet = false;
    }

    if (hasData) holes.push(hole);
  }

  if (holes.length > 0) {
    extracted.holes = holes;
    confident.push('holes');
    details.holes = { value: holes, source: `${holes.length} hole set(s)`, confidence: 0.85 };
  } else {
    gaps.push('holes');
  }

  return { jobType: 'CORE DRILLING', extracted, confident, gaps, details };
}

// ============================================================
// Shared Cut Set Extractor (Wall/Slab/Hand Sawing)
// ============================================================

interface CutConfig {
  linearKeywords: string[];
  areaKeywords: string[];
  thicknessKeywords: string[];
  lengthKeywords: string[];
  widthKeywords: string[];
  quantityKeywords: string[];
  linearFeetKeywords: string[];
  removalEquipment: string[];
  equipmentIsArray: boolean;
}

function extractCutSets(transcript: string, config: CutConfig): { cuts: any[]; hasCuts: boolean } {
  const lower = transcript.toLowerCase();
  const cuts: any[] = [];

  // Detect cut type
  const isLinear = config.linearKeywords.some(kw => lower.includes(kw));
  const isArea = config.areaKeywords.some(kw => lower.includes(kw));

  // If neither explicitly mentioned, try to infer from numbers + keywords
  const segments = splitIntoItemSegments(transcript, ['cut', 'cuts', 'set', 'area', 'areas', 'opening', 'openings']);

  for (const segment of segments) {
    const numbers = extractAllNumbers(segment);
    const cut: any = {};
    const segLower = segment.toLowerCase();
    let hasCutData = false;

    // Determine cut type for this segment
    const segIsLinear = config.linearKeywords.some(kw => segLower.includes(kw));
    const segIsArea = config.areaKeywords.some(kw => segLower.includes(kw));

    // Check for dimension pattern "X by Y by Z"
    const dims = parseDimensions(segment);

    if (segIsLinear || (!segIsArea && isLinear)) {
      cut.cutType = 'Linear Feet';
      cut.linearCutOnly = true;

      const anchors: AnchorConfig[] = [
        { field: 'linear_feet', keywords: config.linearFeetKeywords, min: 1, max: 5000 },
        { field: 'thickness', keywords: config.thicknessKeywords, min: 1, max: 72 },
      ];
      const assignments = assignNumbersByProximity(segment, numbers, anchors);

      if (assignments.linear_feet) {
        cut.linearFeet = String(assignments.linear_feet.value);
        hasCutData = true;
      }
      if (assignments.thickness) {
        cut.thickness = String(assignments.thickness.value);
        hasCutData = true;
      }
    } else {
      // Default to area/opening
      cut.cutType = 'Areas';
      cut.linearCutOnly = false;

      if (dims && dims.values.length >= 2) {
        cut.length = String(dims.values[0]);
        cut.width = String(dims.values[1]);
        if (dims.values.length >= 3) cut.thickness = String(dims.values[2]);
        hasCutData = true;
      } else {
        const anchors: AnchorConfig[] = [
          { field: 'quantity', keywords: config.quantityKeywords, min: 1, max: 100 },
          { field: 'length', keywords: config.lengthKeywords, min: 1, max: 500 },
          { field: 'width', keywords: config.widthKeywords, min: 1, max: 500 },
          { field: 'thickness', keywords: config.thicknessKeywords, min: 1, max: 72 },
        ];
        const assignments = assignNumbersByProximity(segment, numbers, anchors);

        if (assignments.quantity) {
          cut.quantity = String(Math.round(assignments.quantity.value));
          hasCutData = true;
        }
        if (assignments.length) {
          cut.length = String(assignments.length.value);
          hasCutData = true;
        }
        if (assignments.width) {
          cut.width = String(assignments.width.value);
          hasCutData = true;
        }
        if (assignments.thickness) {
          cut.thickness = String(assignments.thickness.value);
          hasCutData = true;
        }
      }
    }

    // Removal detection
    const removal = detectRemoval(segment);
    if (removal !== null) {
      cut.removing = removal;
      if (removal) {
        if (config.equipmentIsArray) {
          const equips = fuzzyMatchMultiple(segment, config.removalEquipment);
          if (equips.length > 0) cut.equipment = equips;
          else {
            const single = fuzzyMatch(segment, config.removalEquipment, 0.3);
            if (single) cut.equipment = [single];
          }
        } else {
          const equip = fuzzyMatch(segment, config.removalEquipment, 0.3);
          if (equip) cut.equipment = equip;
        }
      }
    }

    if (hasCutData) cuts.push(cut);
  }

  return { cuts, hasCuts: cuts.length > 0 };
}

// ============================================================
// Wall Cutting Extractor
// ============================================================

function extractWallCutting(transcript: string): Step2ExtractionResult {
  const extracted: Record<string, any> = {};
  const confident: string[] = [];
  const gaps: string[] = [];
  const details: Record<string, ExtractionDetail> = {};

  // --- Material ---
  const material = fuzzyMatch(transcript, WALL_SAWING_MATERIALS, 0.4);
  if (material) {
    extracted.material = material;
    confident.push('material');
    details.material = { value: material, source: material, confidence: 0.9 };
    if (material === 'Other') {
      // Can't determine materialOther from free speech easily
      gaps.push('materialOther');
    }
  } else {
    gaps.push('material');
  }

  // --- Overcuts ---
  const overcuts = detectYesNoNear(transcript, 'overcut');
  if (overcuts !== null) {
    extracted.overcutsAllowed = overcuts === 'yes' ? 'Yes' : 'No';
    confident.push('overcutsAllowed');
    details.overcutsAllowed = { value: extracted.overcutsAllowed, source: 'overcuts', confidence: 0.85 };
  } else {
    gaps.push('overcutsAllowed');
  }

  // --- Cuts ---
  const { cuts, hasCuts } = extractCutSets(transcript, {
    linearKeywords: ['linear', 'lf'],
    areaKeywords: ['opening', 'openings', 'area', 'areas', 'dimension'],
    thicknessKeywords: ['thick', 'thickness'],
    lengthKeywords: ['length', 'long', 'tall', 'height'],
    widthKeywords: ['width', 'wide'],
    quantityKeywords: ['openings', 'opening', 'areas', 'area', 'qty'],
    linearFeetKeywords: ['linear', 'feet', 'foot', 'lf'],
    removalEquipment: WALL_CUTTING_REMOVAL_EQUIPMENT,
    equipmentIsArray: false,
  });

  if (hasCuts) {
    extracted.cuts = cuts;
    confident.push('cuts');
    details.cuts = { value: cuts, source: `${cuts.length} cut set(s)`, confidence: 0.8 };
  } else {
    gaps.push('cuts');
  }

  return { jobType: 'WALL CUTTING', extracted, confident, gaps, details };
}

// ============================================================
// Slab Sawing Extractor
// ============================================================

function extractSlabSawing(transcript: string): Step2ExtractionResult {
  const extracted: Record<string, any> = {};
  const confident: string[] = [];
  const gaps: string[] = [];
  const details: Record<string, ExtractionDetail> = {};

  // --- Material ---
  const material = fuzzyMatch(transcript, SLAB_SAWING_MATERIALS, 0.4);
  if (material) {
    extracted.material = material;
    confident.push('material');
    details.material = { value: material, source: material, confidence: 0.9 };
  } else {
    gaps.push('material');
  }

  // --- Overcuts ---
  const overcuts = detectYesNoNear(transcript, 'overcut');
  if (overcuts !== null) {
    extracted.overcutsAllowed = overcuts === 'yes' ? 'Yes' : 'No';
    confident.push('overcutsAllowed');
    details.overcutsAllowed = { value: extracted.overcutsAllowed, source: 'overcuts', confidence: 0.85 };
  } else {
    gaps.push('overcutsAllowed');
  }

  // --- Cuts ---
  const { cuts, hasCuts } = extractCutSets(transcript, {
    linearKeywords: ['linear', 'lf'],
    areaKeywords: ['area', 'areas', 'section', 'sections'],
    thicknessKeywords: ['thick', 'thickness', 'deep', 'depth'],
    lengthKeywords: ['length', 'long'],
    widthKeywords: ['width', 'wide'],
    quantityKeywords: ['areas', 'area', 'sections', 'qty'],
    linearFeetKeywords: ['linear', 'feet', 'foot', 'lf'],
    removalEquipment: SLAB_HAND_REMOVAL_EQUIPMENT,
    equipmentIsArray: true,
  });

  if (hasCuts) {
    extracted.cuts = cuts;
    confident.push('cuts');
    details.cuts = { value: cuts, source: `${cuts.length} cut set(s)`, confidence: 0.8 };
  } else {
    gaps.push('cuts');
  }

  return { jobType: 'SLAB SAWING', extracted, confident, gaps, details };
}

// ============================================================
// Hand Sawing Extractor
// ============================================================

function extractHandSawing(transcript: string): Step2ExtractionResult {
  const extracted: Record<string, any> = {};
  const confident: string[] = [];
  const gaps: string[] = [];
  const details: Record<string, ExtractionDetail> = {};

  // --- Material ---
  const material = fuzzyMatch(transcript, HAND_SAWING_MATERIALS, 0.4);
  if (material) {
    extracted.material = material;
    confident.push('material');
    details.material = { value: material, source: material, confidence: 0.9 };
  } else {
    gaps.push('material');
  }

  // --- Locations ---
  const locations = fuzzyMatchMultiple(transcript, HAND_SAWING_LOCATIONS);
  if (locations.length > 0) {
    extracted.locations = locations;
    confident.push('locations');
    details.locations = { value: locations, source: locations.join(', '), confidence: 0.9 };
  } else {
    const single = fuzzyMatch(transcript, HAND_SAWING_LOCATIONS, 0.4);
    if (single) {
      extracted.locations = [single];
      confident.push('locations');
      details.locations = { value: [single], source: single, confidence: 0.8 };
    } else {
      gaps.push('locations');
    }
  }

  // --- Overcuts ---
  const overcuts = detectYesNoNear(transcript, 'overcut');
  if (overcuts !== null) {
    extracted.overcutsAllowed = overcuts === 'yes' ? 'Yes' : 'No';
    confident.push('overcutsAllowed');
    details.overcutsAllowed = { value: extracted.overcutsAllowed, source: 'overcuts', confidence: 0.85 };
  } else {
    gaps.push('overcutsAllowed');
  }

  // --- Cuts ---
  const { cuts, hasCuts } = extractCutSets(transcript, {
    linearKeywords: ['linear', 'lf'],
    areaKeywords: ['area', 'areas', 'section', 'sections'],
    thicknessKeywords: ['thick', 'thickness', 'deep', 'depth'],
    lengthKeywords: ['length', 'long'],
    widthKeywords: ['width', 'wide'],
    quantityKeywords: ['areas', 'area', 'sections', 'qty'],
    linearFeetKeywords: ['linear', 'feet', 'foot', 'lf'],
    removalEquipment: SLAB_HAND_REMOVAL_EQUIPMENT,
    equipmentIsArray: true,
  });

  if (hasCuts) {
    extracted.cuts = cuts;
    confident.push('cuts');
    details.cuts = { value: cuts, source: `${cuts.length} cut set(s)`, confidence: 0.8 };
  } else {
    gaps.push('cuts');
  }

  return { jobType: 'HAND SAWING', extracted, confident, gaps, details };
}

// ============================================================
// Wire Sawing Extractor (trivial — entire transcript is description)
// ============================================================

function extractWireSawing(transcript: string): Step2ExtractionResult {
  const trimmed = transcript.trim();
  if (trimmed.length > 0) {
    return {
      jobType: 'WIRE SAWING',
      extracted: { cuts: [{ description: trimmed }] },
      confident: ['cuts'],
      gaps: [],
      details: { cuts: { value: [{ description: trimmed }], source: trimmed, confidence: 0.9 } },
    };
  }
  return { jobType: 'WIRE SAWING', extracted: {}, confident: [], gaps: ['cuts'], details: {} };
}

// ============================================================
// Concrete Demolition Extractor
// ============================================================

function extractDemolition(transcript: string): Step2ExtractionResult {
  const extracted: Record<string, any> = {};
  const confident: string[] = [];
  const gaps: string[] = [];
  const details: Record<string, ExtractionDetail> = {};
  const lower = transcript.toLowerCase();

  // --- Methods ---
  const methods = fuzzyMatchMultiple(transcript, DEMOLITION_METHODS);
  if (methods.length > 0) {
    extracted.methods = methods;
    confident.push('methods');
    details.methods = { value: methods, source: methods.join(', '), confidence: 0.9 };
  } else {
    // Try keyword aliases
    const foundMethods: string[] = [];
    if (/\bbrokk\b/i.test(lower) || /\brobot\b/i.test(lower)) foundMethods.push('Brokk Demo');
    if (/\bjackhammer/i.test(lower) || /\bhammer/i.test(lower)) foundMethods.push('Jackhammering');
    if (foundMethods.length > 0) {
      extracted.methods = foundMethods;
      confident.push('methods');
      details.methods = { value: foundMethods, source: foundMethods.join(', '), confidence: 0.85 };
    } else {
      gaps.push('methods');
    }
  }

  // --- Removal ---
  const removalYn = detectYesNoNear(lower, 'removal') ?? detectYesNoNear(lower, 'remov');
  const removal = detectRemoval(transcript);
  if (removalYn !== null) {
    extracted.removal = removalYn === 'yes' ? 'Yes' : 'No';
    confident.push('removal');
    details.removal = { value: extracted.removal, source: 'removal', confidence: 0.85 };
  } else if (removal !== null) {
    extracted.removal = removal ? 'Yes' : 'No';
    confident.push('removal');
    details.removal = { value: extracted.removal, source: 'removal', confidence: 0.8 };
  } else {
    gaps.push('removal');
  }

  // --- Areas ---
  // Demolition areas are mostly free-form (areaVolume is text, thickness is number, material is fuzzy match)
  const areaSegments = splitIntoItemSegments(transcript, ['area', 'areas', 'section', 'volume']);
  const areas: any[] = [];

  for (const segment of areaSegments) {
    const area: any = {};
    let hasData = false;

    // Area volume — use the segment text itself (minus obvious keywords)
    area.areaVolume = segment.trim();
    hasData = true;

    // Thickness
    const numbers = extractAllNumbers(segment);
    const thickAssign = assignNumbersByProximity(segment, numbers,
      [{ field: 'thickness', keywords: ['thick', 'thickness', 'inches'], min: 1, max: 72 }]
    );
    if (thickAssign.thickness) {
      area.thickness = String(thickAssign.thickness.value);
    }

    // Material
    const mat = fuzzyMatch(segment, DEMOLITION_MATERIALS, 0.4);
    if (mat) {
      area.material = mat;
    } else {
      // Try keyword detection
      if (/\breinforced/i.test(segment) || /\bconcrete/i.test(segment)) area.material = 'Reinforced Concrete';
      else if (/\bblock/i.test(segment) || /\bbrick/i.test(segment)) area.material = 'Block/Brick';
    }

    if (hasData) areas.push(area);
  }

  if (areas.length > 0) {
    extracted.areas = areas;
    confident.push('areas');
    details.areas = { value: areas, source: `${areas.length} area(s)`, confidence: 0.75 };
  } else {
    gaps.push('areas');
  }

  return { jobType: 'CONCRETE DEMOLITION', extracted, confident, gaps, details };
}

// ============================================================
// GPR Scanning Extractor (trivial — entire transcript is quantity)
// ============================================================

function extractGPR(transcript: string): Step2ExtractionResult {
  const trimmed = transcript.trim();
  if (trimmed.length > 0) {
    return {
      jobType: 'GPR SCANNING',
      extracted: { quantity: trimmed },
      confident: ['quantity'],
      gaps: [],
      details: { quantity: { value: trimmed, source: trimmed, confidence: 0.9 } },
    };
  }
  return { jobType: 'GPR SCANNING', extracted: {}, confident: [], gaps: ['quantity'], details: {} };
}

// ============================================================
// Main Step 2 Dispatcher
// ============================================================

/**
 * Extract Step 2 work details for a specific job type from a free-speech transcript.
 */
export function bulkExtractStep2(jobType: string, transcript: string): Step2ExtractionResult {
  switch (jobType) {
    case 'CORE DRILLING': return extractCoreDrilling(transcript);
    case 'WALL CUTTING': return extractWallCutting(transcript);
    case 'SLAB SAWING': return extractSlabSawing(transcript);
    case 'HAND SAWING': return extractHandSawing(transcript);
    case 'WIRE SAWING': return extractWireSawing(transcript);
    case 'CONCRETE DEMOLITION': return extractDemolition(transcript);
    case 'GPR SCANNING': return extractGPR(transcript);
    default:
      return { jobType, extracted: {}, confident: [], gaps: [], details: {} };
  }
}

// ============================================================
// Step 2 Confirmation Prompt Builder
// ============================================================

/**
 * Build a natural language confirmation for Step 2 extracted data.
 */
export function buildStep2ConfirmationPrompt(
  jobType: string,
  extracted: Record<string, any>,
  confident: string[]
): string {
  if (confident.length === 0) {
    return "I didn't catch any of that. Let me ask you step by step.";
  }

  const parts: string[] = [];

  switch (jobType) {
    case 'CORE DRILLING':
      if (confident.includes('accessibility')) parts.push(`accessibility ${extracted.accessibility}`);
      if (confident.includes('locations') && extracted.locations?.length > 0) {
        parts.push(`drilling on ${extracted.locations.join(' and ')}`);
      }
      if (confident.includes('holes') && extracted.holes?.length > 0) {
        for (const h of extracted.holes) {
          let desc = '';
          if (h.quantity) desc += `${h.quantity} holes`;
          if (h.diameter) desc += `${desc ? ', ' : ''}${h.diameter}" diameter`;
          if (h.depth) desc += `${desc ? ', ' : ''}${h.depth}" deep`;
          if (h.aboveFiveFeet) {
            desc += ', above 5 feet';
            if (h.ladderLiftOption) desc += ` with ${h.ladderLiftOption}`;
          }
          if (desc) parts.push(desc);
        }
      }
      break;

    case 'WALL CUTTING':
      if (confident.includes('material')) parts.push(`${extracted.material}`);
      if (confident.includes('overcutsAllowed')) parts.push(`overcuts ${extracted.overcutsAllowed.toLowerCase()}`);
      if (confident.includes('cuts') && extracted.cuts?.length > 0) {
        for (const c of extracted.cuts) {
          if (c.linearCutOnly || c.cutType === 'Linear Feet') {
            let desc = '';
            if (c.linearFeet) desc += `${c.linearFeet} linear feet`;
            if (c.thickness) desc += `${desc ? ', ' : ''}${c.thickness}" thick`;
            if (desc) parts.push(desc);
          } else {
            let desc = '';
            if (c.quantity) desc += `${c.quantity} opening(s)`;
            if (c.length && c.width) desc += `${desc ? ', ' : ''}${c.length}' x ${c.width}'`;
            if (c.thickness) desc += ` x ${c.thickness}"`;
            if (desc) parts.push(desc);
          }
          if (c.removing) parts.push('removing material');
        }
      }
      break;

    case 'SLAB SAWING':
      if (confident.includes('material')) parts.push(`${extracted.material}`);
      if (confident.includes('overcutsAllowed')) parts.push(`overcuts ${extracted.overcutsAllowed.toLowerCase()}`);
      if (confident.includes('cuts') && extracted.cuts?.length > 0) {
        for (const c of extracted.cuts) {
          if (c.cutType === 'Linear Feet' || c.linearCutOnly) {
            let desc = '';
            if (c.linearFeet) desc += `${c.linearFeet} linear feet`;
            if (c.thickness) desc += `${desc ? ', ' : ''}${c.thickness}" thick`;
            if (desc) parts.push(desc);
          } else {
            let desc = '';
            if (c.quantity) desc += `${c.quantity} area(s)`;
            if (c.length && c.width) desc += `${desc ? ', ' : ''}${c.length}' x ${c.width}'`;
            if (c.thickness) desc += ` x ${c.thickness}"`;
            if (desc) parts.push(desc);
          }
        }
      }
      break;

    case 'HAND SAWING':
      if (confident.includes('material')) parts.push(`${extracted.material}`);
      if (confident.includes('locations') && extracted.locations?.length > 0) {
        parts.push(`at ${extracted.locations.join(' and ')}`);
      }
      if (confident.includes('overcutsAllowed')) parts.push(`overcuts ${extracted.overcutsAllowed.toLowerCase()}`);
      if (confident.includes('cuts') && extracted.cuts?.length > 0) {
        for (const c of extracted.cuts) {
          if (c.cutType === 'Linear Feet' || c.linearCutOnly) {
            let desc = '';
            if (c.linearFeet) desc += `${c.linearFeet} linear feet`;
            if (c.thickness) desc += `${desc ? ', ' : ''}${c.thickness}" deep`;
            if (desc) parts.push(desc);
          } else {
            let desc = '';
            if (c.quantity) desc += `${c.quantity} area(s)`;
            if (c.length && c.width) desc += `${desc ? ', ' : ''}${c.length}' x ${c.width}'`;
            if (c.thickness) desc += ` x ${c.thickness}"`;
            if (desc) parts.push(desc);
          }
        }
      }
      break;

    case 'WIRE SAWING':
      if (confident.includes('cuts') && extracted.cuts?.length > 0) {
        const descs = extracted.cuts.map((c: any) => c.description).filter(Boolean);
        if (descs.length > 0) parts.push(descs.join('; '));
      }
      break;

    case 'CONCRETE DEMOLITION':
      if (confident.includes('methods') && extracted.methods?.length > 0) {
        parts.push(extracted.methods.join(' and '));
      }
      if (confident.includes('removal')) parts.push(`removal: ${extracted.removal.toLowerCase()}`);
      if (confident.includes('areas') && extracted.areas?.length > 0) {
        for (const a of extracted.areas) {
          let desc = a.areaVolume || '';
          if (a.thickness) desc += `, ${a.thickness}" thick`;
          if (a.material) desc += `, ${a.material}`;
          if (desc) parts.push(desc);
        }
      }
      break;

    case 'GPR SCANNING':
      if (confident.includes('quantity')) parts.push(`scan area: ${extracted.quantity}`);
      break;
  }

  const summary = parts.join(', ');
  return `Got it for ${jobType.toLowerCase()} — ${summary}. Sound right?`;
}
