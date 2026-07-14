export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/schedule-board/scan-ticket — paper ticket -> digital draft.
 *
 * Founder Jul 13: "we have paper tickets — I need a way to convert regular
 * tickets into digital tickets by scanning the image."
 *
 * Takes a photo of a paper job ticket (data-URL JPEG/PNG, client downscales),
 * runs a vision extraction, and returns the fields the Quick Add form can
 * prefill. EXTRACTION IS A DRAFT, NEVER A CREATE: the human reviews every
 * field in the Quick Add modal before anything is saved — same review-first
 * philosophy as Artifex ticket creation.
 *
 * Gate: schedule-board access (same surface that hosts Quick Add).
 * Cost: one Haiku vision call (~fractions of a cent), metered to ai_usage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_IMAGE_BYTES = 6_000_000; // ~6MB data-URL ceiling (client downscales first)

const ticketSchema = z.object({
  contractorName: z.string().nullable().describe('Customer / contractor / company name on the ticket'),
  startDate: z.string().nullable().describe('Job start date as YYYY-MM-DD if legible'),
  endDate: z.string().nullable().describe('Job end date as YYYY-MM-DD if present'),
  address: z.string().nullable().describe('Jobsite address'),
  scope: z.string().nullable().describe('Scope / description of work, verbatim-ish'),
  contactName: z.string().nullable().describe('Site contact person'),
  contactPhone: z.string().nullable().describe('Contact phone number'),
  jobTypeGuess: z.string().nullable().describe('Best guess at the service type written on the ticket (e.g. wall sawing, core drilling)'),
  equipment: z.array(z.string()).describe('Equipment items listed on the ticket, empty if none'),
  illegibleNotes: z.string().nullable().describe('Anything important you could NOT read confidently'),
});

export async function POST(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) {
    return NextResponse.json({ error: 'Tenant scope required.' }, { status: 403 });
  }

  let image = '';
  try {
    const body = await request.json();
    image = typeof body?.image === 'string' ? body.image : '';
  } catch {
    /* falls through to validation */
  }
  if (!image.startsWith('data:image/')) {
    return NextResponse.json({ error: 'image (data URL) is required' }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large — retake a bit further away.' }, { status: 413 });
  }

  try {
    const { object, usage } = await generateObject({
      model: 'anthropic/claude-haiku-4.5',
      schema: ticketSchema,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image },
            {
              type: 'text',
              text: 'This is a photo of a paper job ticket from a concrete-cutting / field-services company. Extract the fields exactly as written (dates as YYYY-MM-DD; leave a field null if you cannot read it confidently — NEVER guess names, numbers, or dates). List any equipment written on it.',
            },
          ],
        },
      ],
    });

    // Meter the vision call like every other AI op (fire-and-forget).
    Promise.resolve(
      supabaseAdmin.from('ai_usage').insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        model: 'anthropic/claude-haiku-4.5',
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        cached_tokens: 0,
        cost_usd: ((usage?.inputTokens ?? 0) * 1 + (usage?.outputTokens ?? 0) * 5) / 1_000_000,
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: object });
  } catch (err) {
    console.error('[scan-ticket] extraction failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not read the ticket — try a clearer photo.' }, { status: 502 });
  }
}
