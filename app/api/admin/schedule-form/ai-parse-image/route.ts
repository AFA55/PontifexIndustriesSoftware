export const dynamic = 'force-dynamic';
// Vision extraction of a photographed paper job/quote ticket. One Sonnet
// vision call, returned synchronously (the modal waits on it). ~10–20s.
export const maxDuration = 60;

/**
 * POST /api/admin/schedule-form/ai-parse-image
 *
 * Scan a photo of a paper Patriot "Quotation / Job" ticket and extract the
 * schedule-form fields. Returns the SAME shape as the text parser
 * (/ai-parse) — { fields, confidence, summary } — so the existing AI Smart
 * Fill review UI + apply-to-form flow work unchanged. The estimator then
 * edits/adds anything and saves as normal (nothing here is final).
 *
 * Body: { image: string }  // data URL (data:image/jpeg;base64,...)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';

// Service codes the schedule form + text parser already understand.
const SERVICE_CODES = ['ECD', 'HFCD', 'HCD', 'DFS', 'WS/TS', 'CS', 'HHS/PS', 'WireSaw', 'GPR', 'Demo', 'Brokk'] as const;

// Human labels used to build the result summary (mirrors the modal's map).
const FIELD_LABELS: Record<string, string> = {
  service_types: 'Service Types', contractor_name: 'Customer/Contractor', site_address: 'Job Address',
  site_contact: 'Site Contact', contact_phone: 'Contact Phone', start_date: 'Start Date',
  estimated_cost: 'Estimated Cost', po_number: 'PO Number', water_available: 'Water Available',
  electricity_available: 'Electricity Available', inside_outside: 'Inside/Outside',
  overcutting_allowed: 'Overcutting Allowed', high_work: 'High Work', scaffolding_provided: 'Scaffolding',
  clean_up_required: 'Clean Up Required', cord_480: '480 Cord', plastic_needed: 'Plastic/Poly Needed',
  description: 'Job Description',
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const image: string = (body?.image ?? '').toString();
    if (!image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'A photo of the ticket is required' }, { status: 400 });
    }
    // Guard against an un-downscaled multi-MB upload (client downscales first).
    if (image.length > 12_000_000) {
      return NextResponse.json({ error: 'Image too large — retake or use a smaller photo' }, { status: 413 });
    }

    const { generateText, Output } = await import('ai');
    const { z } = await import('zod');

    const schema = z.object({
      contractor_name: z.string().optional().describe('Customer/contractor company name (near CONTRACTOR / NAME).'),
      site_address: z.string().optional().describe('Job site address/location (JOB NAME & LOCATION).'),
      site_contact: z.string().optional().describe('On-site contact person name (JOB CONTACT).'),
      contact_phone: z.string().optional().describe('Contact phone number.'),
      start_date: z.string().optional().describe('Job date as YYYY-MM-DD. A handwritten "7/24/25" means 2025-07-24.'),
      estimated_cost: z.string().optional().describe('Quoted/estimated dollar amount if written (digits only).'),
      po_number: z.string().optional().describe('Purchase order number if present.'),
      service_types: z.array(z.enum(SERVICE_CODES)).optional()
        .describe('Codes for the CHECKED service boxes only. Map: DEMO→Demo, CORE DRILL→ECD, FLAT SAW→DFS, TRACK SAW→WS/TS, WALL→WS/TS, WIRE SAW→WireSaw, HAND/PUSH SAW→HHS/PS, CHAIN SAW→CS, GPR/SCAN/X-RAY→GPR, BROKK→Brokk.'),
      water_available: z.boolean().optional(),
      electricity_available: z.boolean().optional(),
      inside_outside: z.enum(['inside', 'outside', 'both']).optional().describe('Which of INSIDE/OUTSIDE is circled.'),
      overcutting_allowed: z.boolean().optional(),
      high_work: z.boolean().optional(),
      scaffolding_provided: z.boolean().optional(),
      clean_up_required: z.boolean().optional(),
      cord_480: z.boolean().optional().describe('True if a 480 cord / power run is noted.'),
      plastic_needed: z.boolean().optional(),
      description: z.string().optional()
        .describe('The scope/measurement lines from the table AND any handwritten instructions/notes (e.g. sizes like 120x20 @ 4" SOG, "do not cut deeper", "start on trenches closest to exterior wall", equipment notes). Preserve them verbatim.'),
      low_confidence_keys: z.array(z.string()).optional()
        .describe('Keys of any fields you were unsure about (bad handwriting, ambiguous checkbox).'),
      summary: z.string().optional().describe('One short sentence of what this ticket is.'),
    });

    const prompt = `You are reading a PHOTOGRAPH of a paper "Patriot Concrete Cutting" QUOTATION / JOB ticket, filled out by hand. The photo may be rotated, skewed, or low-contrast — read it in whatever orientation it is.

Extract only what is actually written or clearly checked. Rules:
- A checkbox/service counts as selected ONLY if it has a clear check/tick/X. If unsure, leave it out and add its key to low_confidence_keys.
- service_types: include a code ONLY for checked service boxes, using the mapping in the field description.
- inside_outside: read which of INSIDE / OUTSIDE is circled ("both" if both).
- start_date: convert a handwritten date to YYYY-MM-DD (2-digit year 25 → 2025).
- Put the scope table line items (sizes, depths like 4" SOG) AND the handwritten job instructions/cautions/equipment notes into description, verbatim — do not paraphrase or invent quantities.
- Do NOT guess values that are blank. Omit any field you cannot read.
This is a first-pass draft the estimator will review and correct, so be accurate and conservative rather than complete.`;

    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-5',
      output: Output.object({ schema }),
      messages: [
        { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', image }] },
      ],
    });

    // Reshape to { fields, confidence, summary } (matches the text parser).
    const low = new Set((output.low_confidence_keys ?? []).map((k: string) => k));
    const fields: Record<string, unknown> = {};
    const confidence: Record<string, number> = {};
    const setField = (key: string, value: unknown) => {
      const empty = value === undefined || value === null || value === ''
        || (Array.isArray(value) && value.length === 0);
      if (empty) return;
      fields[key] = value;
      confidence[key] = low.has(key) ? 0.5 : 0.85;
    };

    setField('contractor_name', output.contractor_name?.trim());
    setField('site_address', output.site_address?.trim());
    setField('site_contact', output.site_contact?.trim());
    setField('contact_phone', output.contact_phone?.trim());
    setField('start_date', output.start_date?.trim());
    setField('estimated_cost', output.estimated_cost?.replace(/[^0-9.]/g, ''));
    setField('po_number', output.po_number?.trim());
    setField('service_types', output.service_types);
    for (const k of ['water_available', 'electricity_available', 'overcutting_allowed', 'high_work',
      'scaffolding_provided', 'clean_up_required', 'cord_480', 'plastic_needed'] as const) {
      if (typeof (output as any)[k] === 'boolean') setField(k, (output as any)[k]);
    }
    setField('inside_outside', output.inside_outside);
    setField('description', output.description?.trim());

    const fieldsFound = Object.keys(fields).length;
    const named = Object.keys(fields).filter((k) => k !== 'description').map((k) => FIELD_LABELS[k] || k);
    return NextResponse.json({
      success: true,
      data: {
        fields,
        confidence,
        fieldsFound,
        summary: output.summary?.trim()
          || (fieldsFound > 0 ? `Scanned ticket — found ${fieldsFound} field${fieldsFound !== 1 ? 's' : ''}: ${named.join(', ')}` : 'Could not read fields from this photo — try a clearer, straight-on shot.'),
      },
    });
  } catch (error: any) {
    console.error('Error in AI image parse:', error?.message);
    return NextResponse.json({ error: 'Could not read the ticket photo. Try a clearer, well-lit, straight-on picture.' }, { status: 500 });
  }
}
