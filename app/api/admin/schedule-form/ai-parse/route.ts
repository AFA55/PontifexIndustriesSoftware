/**
 * POST /api/admin/schedule-form/ai-parse
 * AI Natural Language Job Parser
 *
 * Takes a natural language description of a job and extracts structured fields.
 * Handles concrete cutting industry terminology:
 * - Service types (core drilling, wall saw, floor saw, chain saw, GPR, etc.)
 * - Core drilling specs (qty, diameter, depth)
 * - Linear sawing (linear feet, depth)
 * - Customer/contractor names
 * - Addresses and locations
 * - Dates and scheduling
 * - Job conditions (water, power, inside/outside, etc.)
 * - Difficulty and cost estimates
 *
 * Body: { text: string }
 * Returns: { fields: Partial<FormData>, confidence: Record<string, number>, rawText: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';

// ─── Service type mappings ─────────────────────────────────────────────

const SERVICE_TYPE_PATTERNS: { pattern: RegExp; code: string }[] = [
  { pattern: /\b(electric\s+core\s+drill|ecd|electric\s+drill)\b/i, code: 'ECD' },
  { pattern: /\b(high\s+freq|hfcd|high\s+frequency|hf\s+core)\b/i, code: 'HFCD' },
  { pattern: /\b(hydraulic\s+core|hcd|hydraulic\s+drill)\b/i, code: 'HCD' },
  { pattern: /\b(core\s+drill|coring|core\s+hole|drill\s+hole)/i, code: 'ECD' }, // default core drilling to electric
  { pattern: /\b(diesel\s+floor\s+saw|dfs|floor\s+saw|flat\s+saw)\b/i, code: 'DFS' },
  { pattern: /\b(wall\s+saw|track\s+saw|ws|ts|wall\/track)\b/i, code: 'WS/TS' },
  { pattern: /\b(chain\s+saw|cs|chain\s+cut)\b/i, code: 'CS' },
  { pattern: /\b(hand\s+saw|push\s+saw|handheld|hand\s+held|hhs|partner\s+saw|stihl)\b/i, code: 'HHS/PS' },
  { pattern: /\b(wire\s+saw|wire\s+cut|diamond\s+wire)\b/i, code: 'WireSaw' },
  { pattern: /\b(gpr|ground\s+penetrating|x-ray|xray|scan|scanning)\b/i, code: 'GPR' },
  { pattern: /\b(demo|demolition|selective\s+demo)\b/i, code: 'Demo' },
  { pattern: /\b(brokk|robot)\b/i, code: 'Brokk' },
];

// ─── Parser functions ──────────────────────────────────────────────────

function parseServiceTypes(text: string): { types: string[]; confidence: number } {
  const found = new Set<string>();
  for (const { pattern, code } of SERVICE_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      found.add(code);
    }
  }
  return {
    types: Array.from(found),
    confidence: found.size > 0 ? 0.9 : 0,
  };
}

function parseCoreHoles(text: string): { holes: { qty: string; bit_size: string; depth: string }[]; confidence: number } {
  const holes: { qty: string; bit_size: string; depth: string }[] = [];

  // Patterns like "3 cores at 6 inches 8 deep", "4x 8" holes 12" deep"
  // "drill 5 6-inch holes 10 inches deep"
  const patterns = [
    // "3 cores at 6 inches 8 deep"
    /(\d+)\s*(?:cores?|holes?)\s*(?:at|@)\s*(\d+(?:\.\d+)?)\s*(?:inch|in|"|''|diameter)?\s*(?:,?\s*(\d+(?:\.\d+)?)\s*(?:inch|in|"|''|deep|depth)?)?/gi,
    // "4x 8" holes 12" deep"
    /(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:inch|in|"|'')?\s*(?:holes?|cores?)?\s*(?:,?\s*(\d+(?:\.\d+)?)\s*(?:inch|in|"|''|deep|depth)?)?/gi,
    // "drill 5 6-inch holes 10 inches deep"
    /(?:drill|core)\s*(\d+)\s*(\d+(?:\.\d+)?)\s*-?\s*(?:inch|in|"|'')?\s*(?:holes?|cores?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:inch|in|"|''|deep|depth)?)?/gi,
    // "6 inch core drill 3 holes 12 deep"
    /(\d+(?:\.\d+)?)\s*(?:inch|in|"|'')\s*(?:core\s*)?(?:drill|holes?)\s*(\d+)\s*(?:holes?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:inch|in|"|''|deep|depth)?)?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Determine which group is qty and which is diameter based on context
      const g1 = match[1];
      const g2 = match[2];
      const g3 = match[3] || '';

      // If g1 is small (likely qty) and g2 is a diameter
      const qty = parseInt(g1) <= 50 ? g1 : g2;
      const size = parseInt(g1) <= 50 ? g2 : g1;

      holes.push({
        qty: qty,
        bit_size: size,
        depth: g3 || '12', // default to 12" if not specified
      });
    }
  }

  // Deduplicate
  const unique = holes.filter((h, i, arr) =>
    arr.findIndex(x => x.qty === h.qty && x.bit_size === h.bit_size && x.depth === h.depth) === i
  );

  return {
    holes: unique,
    confidence: unique.length > 0 ? 0.85 : 0,
  };
}

function parseSawCuts(text: string): { cuts: { linear_feet: string; depth: string; num_cuts: string }[]; confidence: number } {
  const cuts: { linear_feet: string; depth: string; num_cuts: string }[] = [];

  // "50 linear feet at 6 inches deep", "cut 30 feet 4 inch deep"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:linear\s+)?(?:feet|ft|foot|lf)\s*(?:at|@)?\s*(\d+(?:\.\d+)?)\s*(?:inch|in|"|'')\s*(?:deep|depth)?/gi,
    /cut\s*(\d+(?:\.\d+)?)\s*(?:feet|ft|foot|lf)\s*(\d+(?:\.\d+)?)\s*(?:inch|in|"|'')\s*(?:deep|depth)?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      cuts.push({
        linear_feet: match[1],
        depth: match[2],
        num_cuts: '1',
      });
    }
  }

  return {
    cuts,
    confidence: cuts.length > 0 ? 0.8 : 0,
  };
}

function parseCustomer(text: string): { name: string; confidence: number } {
  // "for ABC Construction", "customer is XYZ Corp", "contractor ABC"
  const patterns = [
    /(?:for|customer|contractor|company|client)\s+(?:is\s+)?([A-Z][A-Za-z\s&'.,-]+?)(?:\s+(?:at|on|in|needs?|wants?|job|project|located|address|next|this|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|starting|scheduled|estimated|difficulty|water|power|electric|inside|outside|contact|phone|PO)|\.|,|$)/i,
    /([A-Z][A-Za-z\s&'.,-]+?)\s+(?:needs?|wants?|is\s+requesting|requested|called|phoned)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 2 && match[1].trim().length < 60) {
      // Clean trailing common words that aren't part of company names
      let name = match[1].trim();
      name = name.replace(/\s+(next|this|tomorrow|today|on|at|in|the)$/i, '').trim();
      if (name.length > 2) {
        return { name, confidence: 0.7 };
      }
    }
  }
  return { name: '', confidence: 0 };
}

function parseAddress(text: string): { address: string; confidence: number } {
  // Look for address-like patterns — require a street suffix to avoid false positives
  const streetSuffix = '(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Place|Pl|Circle|Cir|Court|Ct|Highway|Hwy|Parkway|Pkwy)';
  const patterns = [
    // "at 450 Main Street" — requires number + street name + street suffix
    new RegExp(`(?:at|address|location|located\\s+at|site\\s+at|job\\s+(?:at|site))\\s+(\\d+\\s+[A-Za-z]+(?:\\s+[A-Za-z]+){0,3}\\s+${streetSuffix}[.,]?\\s*(?:[A-Za-z\\s]+,?\\s*[A-Z]{2}\\s*\\d{5})?)`, 'i'),
    // Standalone numbered address with street suffix
    new RegExp(`(\\d{1,5}\\s+[A-Z][A-Za-z]+(?:\\s+[A-Za-z]+){0,3}\\s+${streetSuffix}[.,]?\\s*(?:[A-Za-z\\s]+,?\\s*[A-Z]{2}\\s*\\d{5})?)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 8) {
      return { address: match[1].trim(), confidence: 0.75 };
    }
  }
  return { address: '', confidence: 0 };
}

function parseDate(text: string): { date: string; confidence: number } {
  const today = new Date();

  // "next Tuesday", "this Friday", "tomorrow", "March 25"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Tomorrow
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { date: d.toISOString().split('T')[0], confidence: 0.95 };
  }

  // Next [day]
  const nextDayMatch = text.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (nextDayMatch) {
    const targetDay = dayNames.indexOf(nextDayMatch[1].toLowerCase());
    const d = new Date(today);
    const currentDay = d.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    d.setDate(d.getDate() + daysUntil);
    return { date: d.toISOString().split('T')[0], confidence: 0.9 };
  }

  // This [day]
  const thisDayMatch = text.match(/\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (thisDayMatch) {
    const targetDay = dayNames.indexOf(thisDayMatch[1].toLowerCase());
    const d = new Date(today);
    const currentDay = d.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    d.setDate(d.getDate() + daysUntil);
    return { date: d.toISOString().split('T')[0], confidence: 0.85 };
  }

  // "March 25" or "March 25th" or "3/25"
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthMatch = text.match(new RegExp(`\\b(${months.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  if (monthMatch) {
    const monthIdx = months.indexOf(monthMatch[1].toLowerCase());
    const day = parseInt(monthMatch[2]);
    const year = today.getFullYear();
    const d = new Date(year, monthIdx, day);
    if (d < today) d.setFullYear(year + 1);
    return { date: d.toISOString().split('T')[0], confidence: 0.9 };
  }

  // "3/25" or "3-25"
  const slashDate = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slashDate) {
    const month = parseInt(slashDate[1]) - 1;
    const day = parseInt(slashDate[2]);
    const year = slashDate[3] ? (slashDate[3].length === 2 ? 2000 + parseInt(slashDate[3]) : parseInt(slashDate[3])) : today.getFullYear();
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      return { date: d.toISOString().split('T')[0], confidence: 0.85 };
    }
  }

  return { date: '', confidence: 0 };
}

function parseCost(text: string): { cost: string; confidence: number } {
  // "$5,000" or "5000 dollars" or "estimated at 3500" or "quote 2500"
  const patterns = [
    /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars|bucks)/i,
    /(?:estimated?|quote[d]?|price[d]?|cost)\s*(?:at|of|is|:)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return { cost: match[1].replace(/,/g, ''), confidence: 0.85 };
    }
  }
  return { cost: '', confidence: 0 };
}

function parseDifficulty(text: string): { rating: number; confidence: number } {
  // "difficulty 7" or "rated 8" or "hard job" or "easy job"
  const numMatch = text.match(/(?:difficulty|rating|rated|level)\s*(?:of|at|is|:)?\s*(\d{1,2})/i);
  if (numMatch) {
    const val = parseInt(numMatch[1]);
    if (val >= 1 && val <= 10) return { rating: val, confidence: 0.9 };
  }

  if (/\b(?:very\s+easy|simple|basic|straightforward)\b/i.test(text)) return { rating: 2, confidence: 0.6 };
  if (/\b(?:easy|standard|routine|normal)\b/i.test(text)) return { rating: 3, confidence: 0.6 };
  if (/\b(?:moderate|medium|average)\b/i.test(text)) return { rating: 5, confidence: 0.6 };
  if (/\b(?:hard|difficult|challenging|tough|complex)\b/i.test(text)) return { rating: 7, confidence: 0.6 };
  if (/\b(?:very\s+hard|extremely\s+difficult|critical|dangerous)\b/i.test(text)) return { rating: 9, confidence: 0.6 };

  return { rating: 0, confidence: 0 };
}

function parseConditions(text: string): Record<string, boolean | string> {
  const conditions: Record<string, boolean | string> = {};

  if (/\bwater\s+(?:is\s+)?available\b/i.test(text)) conditions.water_available = true;
  if (/\bno\s+water\b/i.test(text)) conditions.water_available = false;
  if (/\b(?:power|electric|electricity)\s+(?:is\s+)?available\b/i.test(text)) conditions.electricity_available = true;
  if (/\bno\s+(?:power|electric|electricity)\b/i.test(text)) conditions.electricity_available = false;
  if (/\binside\b/i.test(text) && !/\binside\s+(?:and|&|or)\s+outside\b/i.test(text)) conditions.inside_outside = 'inside';
  if (/\boutside\b/i.test(text) && !/\binside\s+(?:and|&|or)\s+outside\b/i.test(text)) conditions.inside_outside = 'outside';
  if (/\bovercut(?:ting)?\s+(?:is\s+)?(?:ok|okay|allowed|fine)\b/i.test(text)) conditions.overcutting_allowed = true;
  if (/\bno\s+overcut/i.test(text)) conditions.overcutting_allowed = false;
  if (/\bhigh\s+work\b/i.test(text)) conditions.high_work = true;
  if (/\bscaffold(?:ing)?\b/i.test(text)) conditions.scaffolding_provided = true;
  if (/\b(?:lift|man\s+lift|scissor\s+lift)\b/i.test(text)) conditions.high_work = true;
  if (/\bclean\s*up\b/i.test(text)) conditions.clean_up_required = true;
  if (/\borientation\b/i.test(text)) conditions.orientation_required = true;
  if (/\bbadge|badging\b/i.test(text)) conditions.badging_required = true;
  if (/\bpermit\b/i.test(text)) conditions.permit_required = true;
  if (/\b480\b/i.test(text)) conditions.cord_480 = true;
  if (/\bplastic\b|hang\s+poly/i.test(text)) conditions.plastic_needed = true;

  return conditions;
}

function parsePONumber(text: string): { po: string; confidence: number } {
  // "PO 12345" or "P.O. number ABC-123" or "purchase order 5678"
  const match = text.match(/(?:p\.?o\.?\s*(?:#|number|num)?|purchase\s+order)\s*[:.]?\s*([A-Za-z0-9-]+)/i);
  if (match) {
    return { po: match[1], confidence: 0.9 };
  }
  return { po: '', confidence: 0 };
}

function parseContactPhone(text: string): { phone: string; confidence: number } {
  // Phone number patterns
  const match = text.match(/(?:phone|call|contact|cell|mobile|number)\s*(?:is|:)?\s*([\d\s().-]{10,})/i)
    || text.match(/(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (match) {
    return { phone: match[1].trim(), confidence: 0.8 };
  }
  return { phone: '', confidence: 0 };
}

function parseContactName(text: string): { name: string; confidence: number } {
  const match = text.match(/(?:contact|site\s+contact|on\s*site|meet|ask\s+for)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (match) {
    return { name: match[1].trim(), confidence: 0.75 };
  }
  return { name: '', confidence: 0 };
}

// ─── Main handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return NextResponse.json({ error: 'Text input too short' }, { status: 400 });
    }

    const cleanText = text.trim();

    // Parse all fields
    const serviceTypes = parseServiceTypes(cleanText);
    const coreHoles = parseCoreHoles(cleanText);
    const sawCuts = parseSawCuts(cleanText);
    const customer = parseCustomer(cleanText);
    const address = parseAddress(cleanText);
    const date = parseDate(cleanText);
    const cost = parseCost(cleanText);
    const difficulty = parseDifficulty(cleanText);
    const conditions = parseConditions(cleanText);
    const poNumber = parsePONumber(cleanText);
    const contactPhone = parseContactPhone(cleanText);
    const contactName = parseContactName(cleanText);

    // Build the response fields
    const fields: Record<string, unknown> = {};
    const confidence: Record<string, number> = {};

    if (serviceTypes.types.length > 0) {
      fields.service_types = serviceTypes.types;
      confidence.service_types = serviceTypes.confidence;
    }

    if (coreHoles.holes.length > 0) {
      // Build scope_details for the first detected core drilling type
      const coreType = serviceTypes.types.find(t => ['ECD', 'HFCD', 'HCD'].includes(t)) || 'ECD';
      fields.scope_details = {
        [coreType]: {
          holes: JSON.stringify(coreHoles.holes),
        },
      };
      confidence.scope_details = coreHoles.confidence;
    }

    if (sawCuts.cuts.length > 0 && !coreHoles.holes.length) {
      const sawType = serviceTypes.types.find(t => ['DFS', 'WS/TS', 'HHS/PS', 'CS'].includes(t)) || 'HHS/PS';
      fields.scope_details = {
        [sawType]: {
          cuts: JSON.stringify(sawCuts.cuts),
        },
      };
      confidence.scope_details = sawCuts.confidence;
    }

    if (customer.name) {
      fields.contractor_name = customer.name;
      confidence.contractor_name = customer.confidence;
    }

    if (address.address) {
      fields.site_address = address.address;
      confidence.site_address = address.confidence;
    }

    if (date.date) {
      fields.start_date = date.date;
      confidence.start_date = date.confidence;
    }

    if (cost.cost) {
      fields.estimated_cost = cost.cost;
      confidence.estimated_cost = cost.confidence;
    }

    if (difficulty.rating > 0) {
      fields.difficulty_rating = difficulty.rating;
      confidence.difficulty_rating = difficulty.confidence;
    }

    if (poNumber.po) {
      fields.po_number = poNumber.po;
      confidence.po_number = poNumber.confidence;
    }

    if (contactPhone.phone) {
      fields.contact_phone = contactPhone.phone;
      confidence.contact_phone = contactPhone.confidence;
    }

    if (contactName.name) {
      fields.site_contact = contactName.name;
      confidence.site_contact = contactName.confidence;
    }

    // Conditions
    for (const [key, value] of Object.entries(conditions)) {
      fields[key] = value;
      confidence[key] = 0.7;
    }

    // Always include the raw text as description if we detected anything
    if (Object.keys(fields).length > 0) {
      fields.description = cleanText;
      confidence.description = 1.0;
    }

    const fieldsFound = Object.keys(fields).length;

    return NextResponse.json({
      success: true,
      data: {
        fields,
        confidence,
        fieldsFound,
        rawText: cleanText,
        summary: fieldsFound > 0
          ? `Found ${fieldsFound} field${fieldsFound !== 1 ? 's' : ''}: ${Object.keys(fields).filter(k => k !== 'description').join(', ')}`
          : 'Could not extract structured data from the input',
      },
    });
  } catch (error) {
    console.error('Error in AI parse:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
