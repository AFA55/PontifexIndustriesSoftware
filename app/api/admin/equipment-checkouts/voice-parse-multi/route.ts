export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/equipment-checkouts/voice-parse-multi
 *
 * LLM-based MULTI-ITEM voice parse for the NATIVE voice-checkout flow
 * (components/equipment/NativeVoiceCheckout.tsx). Companion to the existing
 * deterministic single-phrase `../voice-parse/route.ts` — that endpoint is
 * UNTOUCHED and keeps serving the web VoiceMic component (one short phrase
 * per mic tap, regex + trigram scoring, no LLM).
 *
 * Real-world native speech is messier and often multi-item in one breath:
 *   "zack gas power pack number 4, baker scaffold, chainsaw 4, 2 chains and
 *   binders, done"
 * A brittle keyword/regex parser does not hold up here, so this route calls
 * Claude (via the Vercel AI Gateway) with the tenant's REAL equipment names/
 * aliases + REAL operator names supplied as grounding context, and forces a
 * structured (Zod-schema-validated) response — never free-text regex'd
 * client-side. Low temperature, single-shot, no chat loop.
 *
 * Body: { transcript: string }
 *
 * Returns:
 *   {
 *     success: true,
 *     checkinAll: boolean,           // true for "check in all" / "done" / "that's it" style commands
 *     items: [{
 *       spokenText: string,          // the exact phrase segment this item came from
 *       itemNameOrId: string | null, // resolved equipment.id if matched, else the best-guess name
 *       itemMatched: boolean,        // true if itemNameOrId is a real equipment.id
 *       quantity: number,            // defaults to 1
 *       operatorNameOrId: string | null,
 *       operatorMatched: boolean,    // true if operatorNameOrId is a real profiles.id
 *       confidence: 'high'|'medium'|'low',
 *     }],
 *   }
 *
 * The CALLER (NativeVoiceCheckout) is responsible for showing every item to
 * the user on a confirm screen before calling checkoutEquipmentItem() /
 * checkinEquipmentItem() — this route only parses, it NEVER writes to
 * equipment_checkouts. Low/medium-confidence or unmatched items must be
 * editable/removable in that confirm step, never silently auto-committed.
 *
 * Model: per docs/plans/ARTIFEX_PLAN.md (this repo's verified Vercel AI
 * Gateway spec) — Claude Haiku 4.5 via the gateway, chosen there for speed
 * (matters for a "fastest way to sign out equipment" UX) and cost. Kept as a
 * named constant so it's a one-line change if the gateway's supported slug
 * format shifts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const VOICE_ROLES = new Set(['shop_manager', 'admin', 'super_admin', 'operations_manager', 'supervisor']);

// See file header — verified in docs/plans/ARTIFEX_PLAN.md ("Model selection
// (VERIFIED — cost-critical)"). Haiku 4.5: ~80-120 tok/s, $1/M in · $5/M out.
const MODEL = 'anthropic/claude-haiku-4-5-20251001';

const MAX_TRANSCRIPT_LEN = 2000;

const ParsedItemSchema = z.object({
  spokenText: z.string().describe('The exact words from the transcript this item was extracted from.'),
  itemNameOrId: z
    .string()
    .nullable()
    .describe(
      'The equipment.id (UUID) from the provided EQUIPMENT LIST if a confident match was found; ' +
      'otherwise the best-guess plain-text name as heard (never invent a UUID).'
    ),
  itemMatched: z.boolean().describe('True only if itemNameOrId is a real UUID copied from the EQUIPMENT LIST.'),
  // No .default() here on purpose: a defaulted field is emitted as NOT
  // required in the JSON schema handed to the model, which weakens
  // structured-output reliability. Keep it required in the schema and
  // normalize missing/invalid values defensively after parsing instead (see
  // the sanitizedItems map below) — same defense-in-depth pattern used for
  // itemMatched/operatorMatched.
  quantity: z.number().int().min(1).max(999).describe('How many of this item, e.g. "2 chains and binders" -> 2. Use 1 if not specified.'),
  operatorNameOrId: z
    .string()
    .nullable()
    .describe(
      'The profiles.id (UUID) from the provided OPERATOR LIST if a confident match was found; ' +
      'otherwise the best-guess plain-text name as heard, or null if no operator was mentioned for this item.'
    ),
  operatorMatched: z.boolean().describe('True only if operatorNameOrId is a real UUID copied from the OPERATOR LIST.'),
  confidence: z.enum(['high', 'medium', 'low']),
});

const ParseResultSchema = z.object({
  checkinAll: z
    .boolean()
    .describe(
      'True ONLY when the transcript is a check-in/return command with no specific items named, ' +
      'e.g. "check in all", "checking everything in", "done", "that\'s it", "all back". ' +
      'False whenever specific equipment items are being checked OUT (even if the word "done" ' +
      'appears at the end just to terminate the utterance, e.g. "...2 chains and binders, done" ' +
      'is checkinAll=false with 4 items, because items were named).'
    ),
  items: z.array(ParsedItemSchema),
});

export type VoiceParseMultiResult = z.infer<typeof ParseResultSchema>;

function buildSystemPrompt(): string {
  return `You are a structured-data extractor for a construction-equipment checkout voice command system. \
A shop worker spoke a command that was transcribed by on-device speech recognition (so it may contain \
minor mis-transcriptions of equipment names). Your ONLY job is to extract a structured list of equipment \
checkout items, resolving each spoken item and operator name against the EQUIPMENT LIST and OPERATOR LIST \
provided in the user message.

Rules (follow exactly — this drives a real inventory-tracking action, accuracy matters more than coverage):
1. Segment the transcript into individual equipment items. A single utterance often names several items \
   in one breath, separated by commas, "and", or just running together.
2. For EACH item, try to match it against the EQUIPMENT LIST (by name, short_name + unit_number, asset_tag, \
   or alias — allow for phonetic/transcription mis-hearing, e.g. "FS5000" vs "FS 5000" vs "F S five thousand"). \
   If you find a confident match, set itemMatched=true and itemNameOrId to that equipment's exact id (UUID) \
   from the list. NEVER invent or guess a UUID — if you are not confident, set itemMatched=false and put your \
   best-guess plain-text name in itemNameOrId instead.
3. If an operator's name is mentioned for an item (e.g. "...to Zack", "...with Carlos"), match it against the \
   OPERATOR LIST the same way (allow first-name-only matches). Set operatorMatched=true only with a real id. \
   If no operator is mentioned for an item, operatorNameOrId is null and operatorMatched is false.
4. Extract quantity when explicit ("2 chains and binders" -> quantity 2). Default to 1.
5. Set confidence per item: "high" = itemMatched true and unambiguous; "medium" = itemMatched true but the \
   phrase was ambiguous, OR itemMatched false but you have a strong guess; "low" = unclear / multiple \
   plausible matches / mostly unintelligible.
6. Detect checkinAll: true ONLY for a bare check-in/return command with no specific items named (e.g. \
   "check in all", "checking everything in", "done", "that's it", "all back", "return everything"). If ANY \
   specific equipment item is named in the utterance, checkinAll MUST be false even if the utterance also \
   ends with a wrap-up word like "done".
7. Never fabricate items that were not actually said. If the transcript is empty, unintelligible, or contains \
   no equipment-checkout intent, return an empty items array and checkinAll=false.
8. Respond ONLY via the structured schema — no prose, no explanation.`;
}

function buildUserPrompt(transcript: string, equipment: any[], operators: any[]): string {
  const equipmentList = equipment
    .map((e) => {
      const display = e.short_name && e.unit_number ? `${e.short_name} #${e.unit_number}` : e.name;
      const aliases = Array.isArray(e.aliases) && e.aliases.length ? ` (aliases: ${e.aliases.join(', ')})` : '';
      const tag = e.asset_tag ? ` [asset_tag: ${e.asset_tag}]` : '';
      return `- id: ${e.id} | ${display}${tag}${aliases}`;
    })
    .join('\n');

  // Data minimization: never send a raw email address to the third-party
  // model. full_name should be set for every active profile, but if it's
  // missing fall back to the email's local-part (not the full address) —
  // still enough for the model to fuzzy-match a spoken first name against.
  const operatorList = operators
    .map((p) => `- id: ${p.id} | ${p.full_name || p.email?.split('@')[0] || 'operator'}`)
    .join('\n');

  return `TRANSCRIPT:\n"""\n${transcript}\n"""\n\nEQUIPMENT LIST (this tenant's active equipment):\n${equipmentList || '(none)'}\n\nOPERATOR LIST (this tenant's active operators/apprentices):\n${operatorList || '(none)'}\n\nExtract the structured checkout items now.`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!VOICE_ROLES.has(auth.role)) {
    return NextResponse.json(
      { error: 'Forbidden. Voice checkout requires shop_manager / supervisor / admin.' },
      { status: 403 }
    );
  }
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const transcript = String(body.transcript || '').trim().slice(0, MAX_TRANSCRIPT_LEN);
  if (!transcript) return NextResponse.json({ error: 'transcript is required' }, { status: 400 });

  // Grounding context: the tenant's REAL equipment + operators, so the model
  // resolves names instead of hallucinating them. Same active-only filter as
  // the deterministic voice-parse route for consistency.
  const [{ data: allEquipment }, { data: allOperators }] = await Promise.all([
    supabaseAdmin
      .from('equipment')
      .select('id, name, short_name, unit_number, aliases, asset_tag, kind, status')
      .eq('tenant_id', auth.tenantId)
      .not('status', 'in', '("retired","out_of_service")')
      .limit(500),
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('tenant_id', auth.tenantId)
      .in('role', ['operator', 'apprentice'])
      .eq('active', true),
  ]);

  const equipmentList = allEquipment ?? [];
  const operatorList = allOperators ?? [];

  try {
    const { object } = await generateObject({
      model: gateway(MODEL),
      schema: ParseResultSchema,
      temperature: 0.1,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(transcript, equipmentList, operatorList),
    });

    // Defense in depth: strip any itemMatched/operatorMatched=true that
    // doesn't actually correspond to a real id from the lists we sent. The
    // model should never fabricate a UUID, but we don't trust it blindly —
    // this is a real inventory-write action downstream.
    const equipmentIds = new Set(equipmentList.map((e) => e.id));
    const operatorIds = new Set(operatorList.map((p) => p.id));
    const sanitizedItems = object.items.map((item) => {
      const itemMatched = item.itemMatched && !!item.itemNameOrId && equipmentIds.has(item.itemNameOrId);
      const operatorMatched = item.operatorMatched && !!item.operatorNameOrId && operatorIds.has(item.operatorNameOrId);
      return {
        ...item,
        itemMatched,
        operatorMatched,
        // quantity has no schema-level default (see ParsedItemSchema comment) —
        // normalize any missing/invalid value to 1 here instead.
        quantity: Number.isFinite(item.quantity) && item.quantity >= 1 ? Math.floor(item.quantity) : 1,
        // Downgrade confidence if we had to correct a fabricated match.
        confidence:
          (item.itemMatched && !itemMatched) || (item.operatorMatched && !operatorMatched)
            ? ('low' as const)
            : item.confidence,
      };
    });

    return NextResponse.json({
      success: true,
      checkinAll: object.checkinAll,
      items: sanitizedItems,
      transcript,
    });
  } catch (err: unknown) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.error('voice-parse-multi: model did not return valid structured output', err.text);
      return NextResponse.json(
        { error: 'Could not understand the voice command. Please try again or enter items manually.' },
        { status: 422 }
      );
    }
    console.error('voice-parse-multi error:', err);
    return NextResponse.json({ error: 'Voice parsing failed' }, { status: 500 });
  }
}
