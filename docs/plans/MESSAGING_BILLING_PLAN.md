# Messaging Margin Billing — SMS/Email usage → Stripe (Jul 8, 2026)

> Founder's model: our software sends SMS (Twilio toll-free (833) 695-4288, approved Jul 8)
> and email (Resend) on tenants' behalf. We meter every send, bill tenants monthly with a
> markup, cover provider fees, and keep the spread. Same philosophy as Opifex ad-spend margin.

## Current Stripe state (analyzed Jul 8)
- `lib/stripe.ts` lazy server client (secret key in Vercel ✅, in use by subscription + hiring
  billing flows) · publishable key added Jul 5 ✅ · hiring module already does card-on-file +
  SetupIntent + off-session PaymentIntents with race-hardened settle logic (`lib/hiring/settle.ts`).
- CONCLUSION: all Stripe rails needed for messaging billing already exist and are battle-tested.

## Phase 1 — METER (✅ SHIPPED Jul 8, accruing from day one)
- `message_usage` table: tenant_id, channel(sms/email), provider, segments, raw_cost,
  billed_amount (= raw × `tenants.messaging_markup`, default **2.5×**), source, invoiced.
- `lib/sms.ts` meters every successful Twilio/Telnyx send when the call site passes
  `tenantId` + `source` (fire-and-forget; can never fail a send). Wired: customer status SMS.
- Economics at defaults: SMS raw ≈ $0.0079/segment → billed ≈ $0.0198 → **~$0.012 margin/segment**.
  Email (Resend ≈ $0.0004) → meter later at ~$0.002 billed.

## Phase 2 — remaining call-site adoption (post-demo, mechanical)
Add `tenantId` + `source` at: send-completion-sms, customer-survey, portal-links,
signature routes, sms-opt-in(-request), send-reminder email paths, `lib/email.ts` sendEmail
(email metering mirror of meterSms).

## Phase 3 — the billing pipeline (reuse hiring machinery)
1. Monthly cron (`/api/cron/messaging-billing`, 1st of month): per tenant, sum uninvoiced
   `billed_amount` from message_usage → if ≥ $1: create a Stripe **invoice item** on the
   tenant's existing Stripe customer (subscription tenants get it on their next invoice;
   card-on-file tenants get an off-session charge via the settle pattern) → mark rows invoiced.
2. Tenant-facing: "Messaging usage" card in Settings→Billing (counts + billed total, NEVER raw
   cost — same margin-privacy rule as hiring, enforced by service-role-only reads on the table).
3. Guardrails: monthly per-tenant cap alert (e.g. >$200 → platform alert, not silent charge);
   idempotent invoice-item creation keyed on (tenant, month); guardian review REQUIRED (money).

## Phase 4 — margin dashboard (Platform Hub)
Owner view: per-tenant messages sent, raw cost, billed, margin. Feeds the same
revenue-tracking story as Opifex ad spend.
