/**
 * Voice Parser Utilities for PontiBot
 *
 * Handles fuzzy matching, date/time/number extraction from natural speech.
 * All functions are pure — no side effects, easy to test.
 */

// ============================================================
// FUZZY MATCHING
// ============================================================

/**
 * Simple fuzzy match — checks if the spoken text contains or closely matches
 * any of the valid options. Returns the best match or null.
 */
export function fuzzyMatch(
  spoken: string,
  validOptions: string[],
  threshold: number = 0.5
): string | null {
  const normalized = spoken.toLowerCase().trim();

  // First pass: exact substring match (most common case)
  for (const option of validOptions) {
    const optionLower = option.toLowerCase();
    if (normalized.includes(optionLower) || optionLower.includes(normalized)) {
      return option;
    }
  }

  // Second pass: word overlap scoring
  const spokenWords = normalized.split(/\s+/);
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const option of validOptions) {
    const optionWords = option.toLowerCase().split(/\s+/);

    // Count matching words
    let matchCount = 0;
    for (const spokenWord of spokenWords) {
      for (const optionWord of optionWords) {
        if (
          spokenWord === optionWord ||
          optionWord.startsWith(spokenWord) ||
          spokenWord.startsWith(optionWord) ||
          levenshteinDistance(spokenWord, optionWord) <= 2
        ) {
          matchCount++;
          break;
        }
      }
    }

    const score = matchCount / Math.max(spokenWords.length, optionWords.length);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = option;
    }
  }

  return bestMatch;
}

/**
 * Match multiple options from a spoken phrase.
 * e.g. "columns and slab on grade" → ["Columns", "Slab on Grade"]
 */
export function fuzzyMatchMultiple(
  spoken: string,
  validOptions: string[]
): string[] {
  const matches: string[] = [];
  const normalized = spoken.toLowerCase().trim();

  for (const option of validOptions) {
    const optionLower = option.toLowerCase();
    // Check if the spoken text contains this option
    if (normalized.includes(optionLower)) {
      matches.push(option);
    }
  }

  // If no exact substring matches, try fuzzy on each segment
  if (matches.length === 0) {
    // Split on "and", commas, "also"
    const segments = normalized.split(/\s*(?:and|,|also|plus)\s*/);
    for (const segment of segments) {
      const match = fuzzyMatch(segment.trim(), validOptions, 0.4);
      if (match && !matches.includes(match)) {
        matches.push(match);
      }
    }
  }

  return matches;
}

/**
 * Levenshtein edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================================
// JOB TYPE MATCHING
// ============================================================

const JOB_TYPE_ALIASES: Record<string, string> = {
  // Core Drilling — plus common speech-to-text mishearings
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
  'wall song': 'WALL CUTTING',

  // Slab Sawing — plus common mishearings
  'slab sawing': 'SLAB SAWING',
  'slab saw': 'SLAB SAWING',
  'slab cutting': 'SLAB SAWING',
  'flat sawing': 'SLAB SAWING',
  'flat saw': 'SLAB SAWING',
  'slab sewing': 'SLAB SAWING',
  'slab sowing': 'SLAB SAWING',
  'slab soaring': 'SLAB SAWING',
  'slab song': 'SLAB SAWING',
  'flat sewing': 'SLAB SAWING',

  // Hand Sawing — plus common mishearings (most-reported issue!)
  'hand sawing': 'HAND SAWING',
  'hand saw': 'HAND SAWING',
  'hand cutting': 'HAND SAWING',
  'hand sewing': 'HAND SAWING',
  'hand sowing': 'HAND SAWING',
  'hand soaring': 'HAND SAWING',
  'hand song': 'HAND SAWING',
  'handsawing': 'HAND SAWING',
  'handsewing': 'HAND SAWING',
  'hands awing': 'HAND SAWING',
  'hands owing': 'HAND SAWING',
  'hand sign': 'HAND SAWING',
  'hands on': 'HAND SAWING',

  // Wire Sawing — plus common mishearings
  'wire sawing': 'WIRE SAWING',
  'wire saw': 'WIRE SAWING',
  'wire cutting': 'WIRE SAWING',
  'wire sewing': 'WIRE SAWING',
  'wire sowing': 'WIRE SAWING',
  'wire soaring': 'WIRE SAWING',
  'wire song': 'WIRE SAWING',

  // Concrete Demolition — plus common mishearings
  'concrete demolition': 'CONCRETE DEMOLITION',
  'demolition': 'CONCRETE DEMOLITION',
  'demo': 'CONCRETE DEMOLITION',
  'concrete demo': 'CONCRETE DEMOLITION',
  'demoing': 'CONCRETE DEMOLITION',
  'demolishing': 'CONCRETE DEMOLITION',

  // GPR Scanning — plus common mishearings
  'gpr scanning': 'GPR SCANNING',
  'gpr': 'GPR SCANNING',
  'ground penetrating radar': 'GPR SCANNING',
  'scanning': 'GPR SCANNING',
  'radar': 'GPR SCANNING',
  'gpr scan': 'GPR SCANNING',
  'ground penetrating': 'GPR SCANNING',
  'g.p.r.': 'GPR SCANNING',
  'gp are': 'GPR SCANNING',

  // Shop Ticket — plus common mishearings
  'shop ticket': 'SHOP TICKET',
  'shop': 'SHOP TICKET',
  'shop work': 'SHOP TICKET',
};

const VALID_JOB_TYPES = [
  'CORE DRILLING', 'WALL CUTTING', 'SLAB SAWING', 'HAND SAWING',
  'WIRE SAWING', 'CONCRETE DEMOLITION', 'GPR SCANNING', 'SHOP TICKET',
];

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
    .replace(/\bcutting\b/g, 'cutting')
    .replace(/\bdemoing\b/g, 'demolition')
    .replace(/\bdemolishing\b/g, 'demolition');
}

export function matchJobType(spoken: string): string | null {
  const normalized = spoken.toLowerCase().trim();

  // Check aliases first (exact substring match)
  for (const [alias, jobType] of Object.entries(JOB_TYPE_ALIASES)) {
    if (normalized.includes(alias)) {
      return jobType;
    }
  }

  // Second pass: phonetic normalization then re-check aliases
  const phonetic = phoneticNormalize(normalized);
  if (phonetic !== normalized) {
    for (const [alias, jobType] of Object.entries(JOB_TYPE_ALIASES)) {
      if (phonetic.includes(alias)) {
        return jobType;
      }
    }
  }

  // Fall back to fuzzy match against valid types (lowered threshold)
  return fuzzyMatch(spoken, VALID_JOB_TYPES, 0.35);
}

// ============================================================
// YES / NO DETECTION
// ============================================================

const YES_WORDS = ['yes', 'yeah', 'yep', 'yup', 'sure', 'correct', 'affirmative', 'absolutely', 'right', 'that\'s it', 'that\'s right', 'do it', 'go ahead', 'sounds good'];
const NO_WORDS = ['no', 'nah', 'nope', 'negative', 'not', 'none', 'skip', 'pass', 'next'];
const DONE_WORDS = ['done', 'that\'s it', 'that\'s all', 'we\'re good', 'good', 'nothing else', 'no more', 'all done', 'that is it', 'that is all', 'we are good', 'move on', 'next'];

export function detectYesNo(spoken: string): 'yes' | 'no' | null {
  const normalized = spoken.toLowerCase().trim();

  for (const word of YES_WORDS) {
    if (normalized.includes(word)) return 'yes';
  }
  for (const word of NO_WORDS) {
    if (normalized.includes(word)) return 'no';
  }

  return null;
}

export function detectDone(spoken: string): boolean {
  const normalized = spoken.toLowerCase().trim();
  return DONE_WORDS.some(word => normalized.includes(word));
}

// ============================================================
// DATE PARSING
// ============================================================

/**
 * Parse natural language dates like "tomorrow", "next Monday", "February 20th", "2/20"
 */
export function parseDate(spoken: string): string | null {
  const normalized = spoken.toLowerCase().trim();
  const today = new Date();

  // "today"
  if (normalized.includes('today')) {
    return formatDate(today);
  }

  // "tomorrow"
  if (normalized.includes('tomorrow')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  // "day after tomorrow"
  if (normalized.includes('day after tomorrow')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }

  // "next [day of week]"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const nextDayMatch = normalized.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
  if (nextDayMatch) {
    const targetDay = dayNames.indexOf(nextDayMatch[1].toLowerCase());
    const currentDay = today.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    return formatDate(d);
  }

  // Just day name (this week or next occurrence)
  for (let i = 0; i < dayNames.length; i++) {
    if (normalized.includes(dayNames[i])) {
      const currentDay = today.getDay();
      let daysAhead = i - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      const d = new Date(today);
      d.setDate(d.getDate() + daysAhead);
      return formatDate(d);
    }
  }

  // "month day" or "month dayth" — e.g. "February 20th", "March 5"
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  for (let m = 0; m < monthNames.length; m++) {
    const monthRegex = new RegExp(`${monthNames[m]}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
    const monthMatch = normalized.match(monthRegex);
    if (monthMatch) {
      const day = parseInt(monthMatch[1]);
      const year = today.getFullYear();
      const d = new Date(year, m, day);
      // If the date is in the past, assume next year
      if (d < today) {
        d.setFullYear(year + 1);
      }
      return formatDate(d);
    }
  }

  // Numeric date patterns: "2/20", "2-20", "02/20/2026"
  const numericMatch = normalized.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (numericMatch) {
    const month = parseInt(numericMatch[1]) - 1;
    const day = parseInt(numericMatch[2]);
    let year = numericMatch[3] ? parseInt(numericMatch[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    return formatDate(new Date(year, month, day));
  }

  // "the 20th", "the fifth"
  const ordinalMatch = normalized.match(/the\s+(\d{1,2})(?:st|nd|rd|th)/);
  if (ordinalMatch) {
    const day = parseInt(ordinalMatch[1]);
    // Assume current month
    const d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) {
      d.setMonth(d.getMonth() + 1);
    }
    return formatDate(d);
  }

  return null;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Format a YYYY-MM-DD date string for display
 */
export function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================
// TIME PARSING
// ============================================================

/**
 * Parse spoken time into HH:MM format
 * Handles: "7am", "7:30", "7 30", "eight o'clock", "noon", "eight in the morning"
 */
export function parseTime(spoken: string): string | null {
  const normalized = spoken.toLowerCase().trim();

  // "noon"
  if (normalized.includes('noon')) return '12:00';

  // "midnight" (unlikely for construction but handle it)
  if (normalized.includes('midnight')) return '00:00';

  // Pattern: "X:XX am/pm" or "X XX am/pm"
  const timeRegex = /(\d{1,2})[\s:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i;
  const timeMatch = normalized.match(timeRegex);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3]?.replace(/\./g, '').toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    // If no am/pm and hours <= 6, assume PM (construction usually starts AM though)
    // For safety: if hours < 6 and no am/pm, assume PM
    // But construction crews start early, so if hours >= 5, keep as-is (AM)

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Pattern: "X am/pm" (no minutes)
  const simpleTimeRegex = /(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|o'clock|o clock)/i;
  const simpleMatch = normalized.match(simpleTimeRegex);
  if (simpleMatch) {
    let hours = parseInt(simpleMatch[1]);
    const suffix = simpleMatch[2]?.replace(/\./g, '').replace(/'/g, '').toLowerCase();

    if (suffix === 'pm' && hours < 12) hours += 12;
    if (suffix === 'am' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:00`;
  }

  // Pattern: just a number "7", "8" — assume AM for construction
  const justNumber = normalized.match(/^(\d{1,2})$/);
  if (justNumber) {
    let hours = parseInt(justNumber[1]);
    // Assume AM for construction scheduling (5-11 = AM, 12 = noon, 1-4 = PM)
    if (hours >= 1 && hours <= 4) hours += 12;
    return `${String(hours).padStart(2, '0')}:00`;
  }

  // Word numbers
  const wordToNum: Record<string, number> = {
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'one': 1, 'two': 2,
    'three': 3, 'four': 4,
  };

  for (const [word, num] of Object.entries(wordToNum)) {
    if (normalized.includes(word)) {
      let hours = num;
      const isPM = normalized.includes('pm') || normalized.includes('p.m') ||
                   normalized.includes('afternoon') || normalized.includes('evening');
      const isAM = normalized.includes('am') || normalized.includes('a.m') ||
                   normalized.includes('morning');

      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      // Default: if 1-4 and no indicator, assume PM. 5-12 assume AM.
      if (!isPM && !isAM && hours >= 1 && hours <= 4) hours += 12;

      // Check for "thirty", "fifteen" etc.
      let minutes = 0;
      if (normalized.includes('thirty') || normalized.includes('30')) minutes = 30;
      else if (normalized.includes('fifteen') || normalized.includes('15')) minutes = 15;
      else if (normalized.includes('forty-five') || normalized.includes('45')) minutes = 45;

      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Format HH:MM for display — "7:00 AM"
 */
export function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ============================================================
// NUMBER PARSING
// ============================================================

/**
 * Parse spoken numbers: "8", "eight", "8 and a half", "about 10"
 */
export function parseNumber(spoken: string): number | null {
  const normalized = spoken.toLowerCase().trim();

  // Direct number
  const numMatch = normalized.match(/(\d+\.?\d*)/);
  if (numMatch) {
    let value = parseFloat(numMatch[1]);
    // Check for "and a half"
    if (normalized.includes('half') || normalized.includes('and a half')) {
      value += 0.5;
    }
    return value;
  }

  // Word numbers
  const wordNumbers: Record<string, number> = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
    'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
    'eighty': 80, 'ninety': 90, 'hundred': 100,
  };

  for (const [word, num] of Object.entries(wordNumbers)) {
    if (normalized.includes(word)) {
      let value = num;
      if (normalized.includes('half') || normalized.includes('and a half')) {
        value += 0.5;
      }
      return value;
    }
  }

  return null;
}

// ============================================================
// PRIORITY MATCHING
// ============================================================

export function matchPriority(spoken: string): 'high' | 'medium' | 'low' | null {
  const normalized = spoken.toLowerCase().trim();

  if (normalized.includes('high') || normalized.includes('urgent') || normalized.includes('rush')) {
    return 'high';
  }
  if (normalized.includes('medium') || normalized.includes('normal') || normalized.includes('regular')) {
    return 'medium';
  }
  if (normalized.includes('low') || normalized.includes('not urgent') || normalized.includes('whenever')) {
    return 'low';
  }

  return null;
}

// ============================================================
// PARKING / ENVIRONMENT MATCHING
// ============================================================

export function matchParking(spoken: string): 'close' | 'far' | null {
  const normalized = spoken.toLowerCase().trim();

  if (normalized.includes('close') || normalized.includes('near') || normalized.includes('right there') || normalized.includes('nearby')) {
    return 'close';
  }
  if (normalized.includes('far') || normalized.includes('carry') || normalized.includes('unload') || normalized.includes('walk')) {
    return 'far';
  }

  return null;
}

export function matchEnvironment(spoken: string): 'outdoor' | 'indoor' | null {
  const normalized = spoken.toLowerCase().trim();

  if (normalized.includes('indoor') || normalized.includes('inside') || normalized.includes('in door')) {
    return 'indoor';
  }
  if (normalized.includes('outdoor') || normalized.includes('outside') || normalized.includes('out door')) {
    return 'outdoor';
  }

  return null;
}

// ============================================================
// NAME MATCHING (operators/admins)
// ============================================================

/**
 * Match a spoken name against a list of team members.
 * Handles first name, last name, or full name matching.
 */
export function matchName(
  spoken: string,
  people: Array<{ id: string; full_name: string }>
): { id: string; full_name: string } | null {
  const normalized = spoken.toLowerCase().trim();

  // Exact full name match
  for (const person of people) {
    if (normalized.includes(person.full_name.toLowerCase())) {
      return person;
    }
  }

  // First name match
  for (const person of people) {
    const firstName = person.full_name.split(' ')[0].toLowerCase();
    if (normalized.includes(firstName) && firstName.length >= 3) {
      return person;
    }
  }

  // Last name match
  for (const person of people) {
    const parts = person.full_name.split(' ');
    const lastName = parts[parts.length - 1].toLowerCase();
    if (normalized.includes(lastName) && lastName.length >= 3) {
      return person;
    }
  }

  // Fuzzy match on full names
  const names = people.map(p => p.full_name);
  const match = fuzzyMatch(spoken, names, 0.4);
  if (match) {
    return people.find(p => p.full_name === match) || null;
  }

  return null;
}

// ============================================================
// SKIP DETECTION
// ============================================================

export function detectSkip(spoken: string): boolean {
  const normalized = spoken.toLowerCase().trim();
  return ['skip', 'pass', 'next', 'none', 'no', 'nah', 'nothing'].some(
    word => normalized === word || normalized.startsWith(word + ' ')
  );
}

// ============================================================
// PHONE NUMBER EXTRACTION
// ============================================================

export function parsePhoneNumber(spoken: string): string | null {
  // Remove non-digit characters and common filler words
  const cleaned = spoken.replace(/[^0-9]/g, '');

  if (cleaned.length >= 7 && cleaned.length <= 11) {
    // Format as (XXX) XXX-XXXX if 10 digits
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return cleaned;
  }

  return null;
}

// ============================================================
// DOLLAR AMOUNT PARSING
// ============================================================

export function parseDollarAmount(spoken: string): number | null {
  const normalized = spoken.toLowerCase().trim();

  // Remove dollar signs, commas
  const cleaned = normalized.replace(/[$,]/g, '');

  // Direct number match
  const numMatch = cleaned.match(/(\d+\.?\d*)/);
  if (numMatch) {
    const value = parseFloat(numMatch[1]);

    // Handle "thousand" multiplier
    if (cleaned.includes('thousand') || cleaned.includes('k')) {
      return value * 1000;
    }

    return value;
  }

  return null;
}
