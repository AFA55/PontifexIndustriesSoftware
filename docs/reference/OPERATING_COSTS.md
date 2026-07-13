# Operating Costs — the founder's cheat sheet (Jul 13, 2026)

> What each platform action costs US, where it's metered, and what we bill.
> Live numbers: Platform Hub → AI & Usage (per tenant, per month).

## Unit prices (what we pay)

| Thing | Provider | Unit cost | Metered in |
|---|---|---|---|
| Artifex chat turn | Anthropic via Vercel AI Gateway (Haiku 4.5) | ~$0.001–0.01 per turn (tokens) | `ai_usage` (model `anthropic/*`) |
| Artifex voice reply | ElevenLabs (turbo v2.5, Creator plan ≈ $22/200k chars) | ~$0.00011 per character (~$0.02–0.05 per spoken reply) | `ai_usage` (model `elevenlabs/*`, chars in output_tokens) |
| Drive-time lookup | Google Routes API | ~$0.005–0.01 per call | `ai_usage` (model `google/*`) |
| SMS segment | Twilio, toll-free (833) 695-4288 | ~$0.008–0.01 per segment | `message_usage` (raw_cost) |
| Email | Resend (admin.pontifexindustries.com) | free tier / ~$0.001 | `message_usage` (channel email) |
| Vercel build | Vercel | **~$1–2 per push to main** (86% of the bill) | nowhere — discipline only |
| Supabase | Pro plan | flat monthly | — |

## What we BILL tenants (margin)

- **SMS**: billed_amount per segment (margin = billed − raw). Monthly cron
  (`/api/cron/messaging-billing`, 1st of month) charges the tenant's usage card;
  $1 minimum, no card → skip + audit log.
- **Hiring ad spend**: markup via `hiring_billing.ad_spend_markup` (default 1.5×).
  Raw cost NEVER shown to tenants.
- **AI + voice**: currently absorbed as our operating cost (not billed). Decide
  at Phase 3 close whether to fold into plan tiers or meter.

## Where to look

- **Platform Hub cockpit tile**: month total + AI/Voice/SMS split (owner only).
- **Hub → AI & Usage**: per-tenant breakdown incl. SMS margin (owner only).
- **Hub → tenant → Billing tab**: that tenant's subscription + usage costs.
- **Tenant's own view** (`/dashboard/admin/subscription`): message counts +
  billed amounts ONLY — raw costs and margin never render on tenant surfaces.

## Rules of thumb

- A month of ONE active tenant using Artifex voice heavily ≈ **$5–15** in AI+voice.
- Voice costs ~2× the LLM behind it (July: voice $0.64 vs AI $0.40).
- The bill that actually hurts is **Vercel builds** — batch commits, one push per
  session (`DEPLOYMENT_COST.md`).
