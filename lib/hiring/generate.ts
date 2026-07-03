/**
 * Hiring module — AI generation helpers (ad kit + translation).
 *
 * Uses generateObject (structured output) via the Vercel AI Gateway, same
 * setup as app/api/admin/equipment-checkouts/voice-parse-multi/route.ts.
 * Model: Sonnet 5 — ad copy quality matters and these run on-demand (a button
 * click), not per chat turn, so the cost profile is fine (mirrors the
 * ticket-analysis agent's reasoning).
 *
 * ⚖️ ADEA guardrail: the system prompt forbids age/DOB questions, and every
 * suggested screener is ALSO run through containsProhibitedScreenerContent()
 * by the callers (defense in depth) — see lib/hiring/types.ts.
 *
 * Usage logging: every call writes to ai_usage fire-and-forget (source
 * 'hiring_generate' / 'hiring_translate') — never blocks the response.
 */
import { generateObject } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  containsProhibitedScreenerContent,
  type HiringJob,
  type HiringScreenerQuestion,
} from '@/lib/hiring/types';

/** Gateway model slug — same family/format as lib/agents/ticket-analysis-agent.ts. */
export const HIRING_GENERATION_MODEL = 'anthropic/claude-sonnet-5';

// Sonnet pricing for the cost_usd column ($3/M input, $15/M output).
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

function logAiUsage(
  tenantId: string,
  userId: string,
  source: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined
): void {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  Promise.resolve(
    supabaseAdmin.from('ai_usage').insert({
      tenant_id: tenantId,
      user_id: userId,
      model: HIRING_GENERATION_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: 0,
      cost_usd: inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN,
      source,
    })
  )
    .then(() => {})
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Ad-kit generation
// ---------------------------------------------------------------------------

const ScreenerSuggestionSchema = z.object({
  question: z.string().describe('The screener question exactly as shown to the applicant. Concise — candidates apply on their phones.'),
  qtype: z.enum(['free_response', 'single_choice']),
  options: z
    .array(z.string())
    .describe('Answer options for single_choice questions (2-5 short options). Empty array for free_response.'),
  auto_reject: z
    .boolean()
    .describe('True if choosing a disqualifying answer should automatically reject the candidate.'),
  auto_reject_answers: z
    .array(z.string())
    .describe('The exact option strings (copied verbatim from options) that disqualify. Empty unless auto_reject is true.'),
});

const AdKitSchema = z.object({
  ad_headline: z.string().describe('Short punchy hiring headline for the ad creative, e.g. "NOW HIRING: Concrete Laborers — Dallas".'),
  ad_primary_text: z
    .string()
    .describe('Facebook/Instagram post primary text (~400 characters): opens with a hook, uses a few tasteful emoji, sells the role, ends with a clear apply CTA.'),
  ad_tiktok_caption: z
    .string()
    .describe('Short, punchy TikTok caption with 3-5 relevant hashtags.'),
  ad_bullets: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe('3-5 checkmark bullets for the ad creative: the strongest requirements and selling points (pay, schedule, "No Experience Needed", etc). No leading checkmark character — the UI renders it.'),
  requirements: z.array(z.string()).describe('Concrete, bona-fide job requirements extracted or reasonably inferred from the description (e.g. "Must lift 60+ lbs", "Valid driver\'s license").'),
  benefits: z.array(z.string()).describe('Benefits/selling points (e.g. "Weekly pay", "Overtime available", "PTO"). Empty if none can be inferred.'),
  pay_min: z.number().nullable().describe('Lower bound of the pay band if stated or confidently inferable from the description; else null. Never invent a number.'),
  pay_max: z.number().nullable().describe('Upper bound of the pay band; else null.'),
  pay_period: z.enum(['hour', 'year', 'week', 'day', 'project']).nullable().describe('Period the pay band is quoted in, if pay was found; else null.'),
  schedule_text: z.string().nullable().describe('Work schedule in plain text if stated (e.g. "Mon-Fri, 7am-5pm"); else null.'),
  suggested_screeners: z
    .array(ScreenerSuggestionSchema)
    .min(4)
    .max(6)
    .describe('4-6 application screener questions per the SCREENER RULES.'),
});

export type GeneratedAdKit = z.infer<typeof AdKitSchema>;

const AD_KIT_SYSTEM_PROMPT = `You are the ad-kit generator for a social-media recruiting platform (Facebook/Instagram/TikTok job ads for blue-collar and skilled-trades roles). Given a job title, description, and optional steering instructions, you produce the complete ad kit and application screener questions.

WRITING RULES:
- Write like a high-performing social recruiting ad, not a corporate job board post: direct, energetic, concrete numbers (pay, schedule) up front when available.
- ad_primary_text: ~400 characters, opens with a hook line, a few tasteful emoji (not emoji soup), ends with a clear "Apply now" style CTA.
- ad_tiktok_caption: short and punchy, ends with 3-5 relevant hashtags.
- ad_bullets: the 3-5 strongest, most concrete requirement/selling-point lines.
- NEVER invent pay numbers, benefits, or schedule details that are not stated or strongly implied by the description. Use null / empty arrays when unknown.
- LANGUAGE: write EVERYTHING (ad copy, bullets, requirements, benefits, screener questions and options) in the TARGET LANGUAGE specified in the user message. If it is 'es', write natural Latin-American Spanish.

SCREENER RULES (legally load-bearing — follow exactly):
- Produce 4-6 questions total. Concise — candidates apply on their phones.
- ALWAYS include this single_choice auto-reject question: "Are you 18 or older?" (translated to the target language) with options Yes/No, auto_reject on "No". An 18+ minimum is the ONE lawful age floor.
- When the job is physical (construction, labor, lifting, outdoor work, being on your feet), ALWAYS include a single_choice auto-reject essential-job-functions question that lists the concrete physical demands from the description (e.g. "This role requires repeatedly lifting 60+ lbs, working outdoors, and being on your feet 10+ hours. Can you perform these essential job functions?") with Yes/No options, auto_reject on "No".
- Other good screeners: availability/schedule fit, travel/commute willingness, relevant experience (free_response or single_choice), required license/certification.
- NEVER ask about age, date of birth, birth year, or "how old" the applicant is — age-based screening is ILLEGAL under the ADEA (US federal law). Capability and eligibility questions are the lawful equivalents. Also never ask about race, religion, national origin, marital status, or disability status.
- auto_reject_answers must contain strings copied EXACTLY from that question's options array.
- single_choice questions need 2-5 options; free_response questions have an empty options array.`;

export interface AdKitResult {
  kit: GeneratedAdKit;
  /** Suggested screeners that passed the ADEA blocklist (others silently dropped). */
  safeScreeners: GeneratedAdKit['suggested_screeners'];
}

export async function generateAdKit(params: {
  job: Pick<HiringJob, 'title' | 'description' | 'location' | 'generation_instructions' | 'language'>;
  tenantName: string;
  tenantId: string;
  userId: string;
}): Promise<AdKitResult> {
  const { job, tenantName, tenantId, userId } = params;

  const userPrompt = [
    `COMPANY NAME: ${tenantName}`,
    `TARGET LANGUAGE: ${job.language || 'en'}`,
    `JOB TITLE: ${job.title}`,
    job.location ? `LOCATION: ${job.location}` : null,
    `JOB DESCRIPTION:\n"""\n${job.description || '(no description provided — work from the title alone, inventing nothing specific)'}\n"""`,
    job.generation_instructions
      ? `GENERATION INSTRUCTIONS (steering from the employer — affects text content and ordering only):\n${job.generation_instructions}`
      : null,
    'Generate the complete ad kit and screeners now.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { object, usage } = await generateObject({
    model: gateway(HIRING_GENERATION_MODEL),
    schema: AdKitSchema,
    temperature: 0.7,
    system: AD_KIT_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  logAiUsage(tenantId, userId, 'hiring_generate', usage);

  // ⚖️ Defense in depth: drop any suggested screener that trips the ADEA
  // blocklist, and normalize single_choice invariants.
  const safeScreeners = object.suggested_screeners
    .filter((s) => !containsProhibitedScreenerContent(`${s.question} ${s.options.join(' ')}`))
    .map((s) => ({
      ...s,
      options: s.qtype === 'single_choice' ? s.options : [],
      auto_reject: s.qtype === 'single_choice' ? s.auto_reject : false,
      auto_reject_answers:
        s.qtype === 'single_choice' && s.auto_reject
          ? s.auto_reject_answers.filter((a) => s.options.includes(a))
          : [],
    }))
    // A single_choice question with <2 options is malformed — drop it.
    .filter((s) => s.qtype === 'free_response' || s.options.length >= 2);

  return { kit: object, safeScreeners };
}

// ---------------------------------------------------------------------------
// Translation (language variant of a job + its screeners)
// ---------------------------------------------------------------------------

const TranslationSchema = z.object({
  title: z.string(),
  description: z.string(),
  ad_headline: z.string().nullable(),
  ad_primary_text: z.string().nullable(),
  ad_tiktok_caption: z.string().nullable(),
  ad_bullets: z.array(z.string()),
  requirements: z.array(z.string()),
  benefits: z.array(z.string()),
  schedule_text: z.string().nullable(),
  screeners: z
    .array(
      z.object({
        question: z.string(),
        options: z
          .array(z.string())
          .describe('Translated options in the SAME order and count as the source question\'s options.'),
      })
    )
    .describe('One entry per source screener, in the SAME order as provided.'),
});

export type TranslatedJobContent = z.infer<typeof TranslationSchema>;

const TRANSLATE_SYSTEM_PROMPT = `You are a professional translator for a recruiting-ads platform. Translate the provided job posting content into the TARGET LANGUAGE. Rules:
- Natural, native-sounding copy for job ads — not literal word-for-word translation. For 'es', use Latin-American Spanish.
- Preserve meaning, tone, emoji, numbers, pay figures, and formatting exactly.
- Keep hashtags relevant (translate or localize them when natural).
- For null fields, return null. For empty arrays, return empty arrays.
- SCREENERS: return exactly one entry per source screener, in the same order. Each translated options array MUST have the same count and order as the source options (option N translates option N) — downstream auto-reject logic maps answers by index.
- Return ONLY the structured object.`;

export interface TranslateJobResult {
  translated: TranslatedJobContent;
  /**
   * Per-screener translated options aligned by index with the source screeners
   * (falls back to source text when the model's arrays are misaligned).
   */
  screenerTranslations: { question: string; options: string[] }[];
}

export async function translateJobContent(params: {
  job: Pick<
    HiringJob,
    | 'title'
    | 'description'
    | 'ad_headline'
    | 'ad_primary_text'
    | 'ad_tiktok_caption'
    | 'ad_bullets'
    | 'requirements'
    | 'benefits'
    | 'schedule_text'
    | 'language'
  >;
  screeners: Pick<HiringScreenerQuestion, 'question' | 'options'>[];
  targetLanguage: string;
  tenantId: string;
  userId: string;
}): Promise<TranslateJobResult> {
  const { job, screeners, targetLanguage, tenantId, userId } = params;

  const sourcePayload = {
    title: job.title,
    description: job.description,
    ad_headline: job.ad_headline,
    ad_primary_text: job.ad_primary_text,
    ad_tiktok_caption: job.ad_tiktok_caption,
    ad_bullets: job.ad_bullets,
    requirements: job.requirements,
    benefits: job.benefits,
    schedule_text: job.schedule_text,
    screeners: screeners.map((s) => ({ question: s.question, options: s.options })),
  };

  const { object, usage } = await generateObject({
    model: gateway(HIRING_GENERATION_MODEL),
    schema: TranslationSchema,
    temperature: 0.2,
    system: TRANSLATE_SYSTEM_PROMPT,
    prompt: `SOURCE LANGUAGE: ${job.language || 'en'}\nTARGET LANGUAGE: ${targetLanguage}\n\nSOURCE CONTENT (JSON):\n${JSON.stringify(sourcePayload, null, 2)}\n\nTranslate now.`,
  });

  logAiUsage(tenantId, userId, 'hiring_translate', usage);

  // Align screener translations by index; fall back to source when misaligned
  // so a model slip never corrupts the variant's screener set.
  const screenerTranslations = screeners.map((src, i) => {
    const t = object.screeners[i];
    const options =
      t && Array.isArray(t.options) && t.options.length === src.options.length
        ? t.options
        : src.options;
    return { question: t?.question || src.question, options };
  });

  return { translated: object, screenerTranslations };
}
