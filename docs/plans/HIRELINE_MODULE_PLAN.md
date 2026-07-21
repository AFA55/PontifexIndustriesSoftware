# Hireline-Style Hiring Module — Build Plan

> **⚠️ ARCHITECTURE UPDATE (Jul 21, 2026):** §5.1's standalone-product model (OPIFEX front-door
> tenant + self-serve signup) was RETIRED — Opifex is now a platform feature (module), per the
> founder. Tenants get hiring via `features.hiring`; tenant creation happens only in the Platform
> Hub. See `docs/plans/OPIFEX_FEATURE_PLAN.md`. The module internals below (ad kit, ADEA
> guardrails, billing spread, agency Meta model, publish queue) remain accurate.

> Founder ask (Jul 2, 2026): duplicate what Hireline does inside Pontifex so any tenant can run
> hiring/recruiting ads, PLUS two improvements Hireline lacks: (1) one-click **translation** of
> finalized ad/screener copy, (2) better up-front **screening** (his words: filter out applicants
> who can't do the work — see the Legal Guardrail section for how we do this the lawful way).
>
> Source: live walkthrough of Patriot's real Hireline account (app.hireline.com) on Jul 2, 2026,
> driven in the founder's Chrome with his permission. All features below are VERIFIED seen, not guessed.

## 1. What Hireline actually is (verified feature map)

**Positioning:** "Reach the 97% of candidates that aren't on job boards" — it runs **social-media
job ads** (Facebook/Instagram style), not job-board postings. Operated by Whitestone Technologies.

### 1.1 Object model
- **Organization** (= our tenant) — has Members, Branding (logo + primary/accent color), Billing.
  Org switcher supports multiple orgs per user ("separate org for a different customer account").
- **Job** — the central object. A job IS an ad campaign + application form + candidate pipeline.
- **Candidate/Applicant** — belongs to a job; statuses `Unreviewed | Shortlisted | Rejected`.

### 1.2 Job creation (wizard, "Step 1 of 3")
1. Choose source: **"Paste a job post link"** (recommended — imports details + auto-targeting)
   or **"Start from scratch"**.
2. Scratch path = TWO fields only: **Job Title + Job Description** (free text). Copy verbatim:
   "Hireline will extract the top selling points from your job's description... based on
   historical data on what gets the right candidates to apply. Be detailed! e.g. being explicit
   about the work schedule (Mon-Fri, 9-6) helps."
3. (Step 3 not entered — presumably location/budget/review.)
Everything downstream (ad creative, screeners, application form) is AI-generated from that
description. Language follows the input language (support confirmed: write the description in
Spanish → ad + application come out in Spanish). **No job duplicate button** (support confirmed).

### 1.3 Job detail — 5 tabs
- **Home**: funnel dashboard — Impressions → Clicks (w/ click %) → Candidates (w/ apply %),
  ad-spend chart (group by day/week/month), recent candidates, paused-state banner w/ Reactivate.
  Patriot real numbers: 8,061 impressions → 267 clicks (3.3%) → 31 candidates (11.6% apply).
- **Ad Setup**: live Facebook-post-style ad PREVIEW (sponsored post mock w/ fake engagement) +
  4 collapsible generation layers:
  1. BASIC DETAILS (title + description)
  2. BRANDING (org logo + primary/accent colors — Patriot's real logo appears in the creative)
  3. TARGETING (geographic areas the ad runs in)
  4. GENERATION INSTRUCTIONS (free-text instructions; "only affect text content and ordering")
  "Changes to any section will regenerate your ad." · "We'll test multiple versions to find the
  best performers" (multi-variant).
  The generated creative itself contains: HIRING headline, role, location + "Travel Required",
  ✔ requirement bullets ("Experience Preferred, Not Required", "Must Lift 60+ lbs & Work
  Outdoors"), pay band banner ($18–$20+/Hr), BENEFITS list, Apply Now CTA.
- **Screeners** (route: `/settings/application`): ordered questions, two types —
  **FREE RESPONSE** and **SINGLE CHOICE**; single-choice can be flagged **Auto-reject**
  ("Candidates who fail an auto-reject question are automatically disqualified").
  UI copy: "Candidates apply on their phones, so keep questions concise." Edit + Preview buttons.
  FOLLOW-UP QUESTIONS (asked *after* applying, by text + email): Resume upload (optional,
  on/off), Location (optional, on/off). Contact block (name/phone/email) is always asked;
  phone says "We may contact you by text or call."
- **Candidates**: tab filters Unreviewed/Shortlisted/Rejected w/ counts, search, **Export**,
  columns: candidate (avatar+resume icons), status, comments, applied-at. Row click → slide-over:
  - Responses tab (every screener Q&A) + Resume tab
  - HISTORY timeline: "Clicked ad on Social Media" → "Submitted Application" (timestamp + tz)
    → "Schedule an Interview?" w/ one-click **Send interview invite** (gated on connecting a
    calendar in job settings)
  - INTERNAL COMMENTS (team-only), Reject / Shortlist buttons, prev/next arrows, copy + open icons
- **Settings**: close job (confirm dialog: stops campaigns, prevents new applies, irreversible,
  candidates remain), on/off toggle per job (Paused/Draft/active states seen).

### 1.4 Dashboard (org home)
Org-wide analytics: Candidates & Ad Spend chart (day/week/month), recent candidates across jobs,
links into pipeline. Also a "Connect your Calendar" nag (interview scheduling).

### 1.5 Billing (the business model — important)
**Pure ad-spend passthrough with threshold billing. NO subscription fee visible.**
- Invoices are small per-job ad-spend line items (e.g. "Construction Laborer... Jun 28–29: $21.37").
- Charged on the 1st of the month, OR when owed ≥ threshold, OR when all jobs paused —
  whichever first. Threshold auto-escalates with lifetime spend: $25 default → $50 (at $100+)
  → $250 (at $500+); >$250 by support request.
- Patriot's whole history Mar→Jul 2026: ~$345 total for 44 candidates ≈ **$8/candidate**.
- Daily budget per job; ads stop when budget runs out (FAQ).
- Org billing page: credit balance, multiple cards w/ default, invoice+receipt PDFs.

## 2. Founder's two improvements over Hireline

### 2.1 Translation button (his #1 pain)
Hireline's answer to Spanish is "rewrite the whole job in Spanish as a NEW job." We do better:
- On any finalized ad + screener set: **Translate** → pick target language (es/en first) →
  Claude translates ad copy, screener questions, choice options, and the public application page
  — as a linked **language variant** of the same job (one pipeline, candidates tagged by language
  variant), not a disconnected duplicate.
- Round-trip preserved: edit English master → offer re-translate; manual overrides stick.
- This also gives us the job-duplicate button Hireline lacks (duplicate = copy job w/ all layers).

### 2.2 Screening (⚖️ LEGAL GUARDRAIL — read before building)
Founder's words: old people applying who can't do the work; wants to "filter by age."
**We must NOT build an age-based filter.** Federal law (ADEA) prohibits using age (40+) as a
hiring filter; collecting DOB pre-offer is a discrimination red flag; auto-rejecting on age
would expose Patriot (and Pontifex as the tool vendor) to real liability. What we build instead —
which solves the actual problem (capability) legally, the same way Hireline's own generated ad
does it ("Must Lift 60+ lbs & Work Outdoors"):
- **Minimum-age eligibility** question (legal, standard): "Are you 18 or older?" — single choice,
  auto-reject. (18+ is a lawful floor for hazardous construction work.)
- **Physical-requirements auto-reject screeners**: "This role requires repeatedly lifting 60+ lbs,
  working outdoors in heat, and being on your feet 10+ hrs. Can you perform these essential job
  functions?" Yes/No, auto-reject on No. Bona-fide job requirements = lawful, and self-select
  out the applicants he's worried about.
- Availability/travel/schedule auto-rejects (same as Patriot's current Hireline screeners).
- Our screener-suggestion AI must NEVER generate age/DOB questions; add to the system prompt and
  validate (blocklist: age, DOB, birth year, "how old").
Explain this to any tenant in the UI: a small note on the screener builder ("Age-based screening
is prohibited under the ADEA — use capability questions instead. These are pre-written for you.").

## 3. What we reuse from Pontifex (already built)
- Tenancy = orgs (tenant_id + RLS everywhere) · Branding = `tenant_branding` (logo + colors)
- AI = Vercel AI SDK + Claude already wired (Artifex, ticket analysis) → ad copy + screener
  generation + translation
- Public unauthenticated pages pattern (request-access, /sms-opt-in, portal/[token]) → public
  apply page `/apply/[jobSlug]`
- Storage buckets + signed URLs → resume uploads
- Resend email + (post-Twilio) SMS → post-apply resume/location follow-ups, notifications
- Pipeline UI pattern (feedback_submissions status flow) → candidate pipeline
- Stripe → if we ever charge for the module (Phase 3; NOT needed for Patriot dogfood)

## 4. Build phases

### Phase 1 — MVP (dogfood with Patriot; NO Meta API)
Job builder (title + description → Claude generates ad copy blocks + suggested screeners) →
screener editor (free/single-choice, auto-reject, follow-ups, legal note + blocklist) → public
mobile-first apply page → candidate pipeline (statuses, slide-over, comments, history, export CSV)
→ **ad-kit output**: rendered ad creative (branded HTML→PNG) + primary text/headline variants to
paste into Meta Ads Manager, with a "mark as running" toggle + manual spend field so the funnel
dashboard still works (impressions/clicks via manual entry or UTM-tracked link clicks + applies
we measure ourselves).
Tables: `hiring_jobs`, `hiring_screener_questions`, `hiring_candidates`,
`hiring_candidate_responses`, `hiring_events` (history), all tenant_id + RLS.
**Translation variant support lands in Phase 1** (it's founder's top ask and it's just Claude).

### Phase 2 — Meta integration (only if manual paste becomes the bottleneck)
Marketing API: campaign create, budget, geo targeting, creative upload, insights pull
(impressions/clicks/spend auto-sync). Needs: Meta Business verification + app review
(weeks, founder-action heavy), ad account + page per tenant or agency model. Decide then:
agency-managed ad accounts (Pontifex runs ads for tenants) vs. tenant-connected accounts.

### Phase 3 — productize (multi-tenant sellable)
Interview scheduling (calendar connect), billing model (ad-spend passthrough w/ threshold, like
Hireline, via Stripe metered billing), campaigns overview page, module gating via `features` jsonb.

## 5. Business model & GTM (founder decisions, Jul 3 2026)

### 5.1 The product is a standalone-feeling company under Pontifex
- Facebook page: **"Pontifex Industries Job Board"** (mirrors Hireline's page naming — see 5.3).
- Entry point: company code **HIRE** → login page branded **"Pontifex Industries Job Board"**
  → inside, the Hireline-style app. New customers can **self-sign-up** from that page.
- Recommended architecture (reuses everything we have): each hiring customer that signs up gets
  their own **tenant** with `features = { hiring: true }` only — full RLS isolation for free,
  no new isolation model. `HIRE` is the branded front door + marketing shell, not a shared
  bucket of customers' data. (One customer = one org, same as Hireline's Organizations.)
- **Payments collected in-product** (Stripe): card on file at signup, metered ad-spend billing
  with an escalating threshold exactly like Hireline ($25 → $50 → $250), charged on the 1st /
  at threshold / when all jobs pause. Stripe customer + saved payment method per hiring tenant;
  invoices retrievable in-app.

### 5.2 Revenue = the ad-spend spread (how Hireline actually makes money)
Hireline charges no subscription — their margin is the spread between what Meta charges them
and what they bill the customer. From Patriot's real account:
- Billed to Patriot: ~$345 lifetime for ~15.5k impressions / ~435 clicks across 3 jobs
  → implied **$22 CPM / $0.79 CPC billed**.
- US Meta benchmarks for blue-collar recruitment ads run roughly **$10–18 CPM / $0.40–0.90 CPC**
  actual auction cost (2025–26 ranges; exact spend is only visible in their ad account).
- Implied gross margin on ad spend: **roughly 20–100%, most plausibly ~40–60%** — consistent
  with typical programmatic-recruitment reseller take rates (30–50%).
- Our pricing: match their headline economics (~$8–12/candidate effective for trades roles),
  bill ad-spend passthrough at a configurable markup (default ~1.5×), show the customer only
  the billed number (like Hireline). Software COGS ≈ $0 (existing Vercel/Supabase/Claude stack),
  so the spread is nearly all margin. A per-tenant `ad_spend_markup` column keeps this tunable.

### 5.3 Meta architecture — validated from the Ads Library (Jul 3)
The founder pulled Hireline's live ads in the Facebook Ad Library. Confirmed:
- ALL customer ads run from **Hireline-owned pages** ("Hireline Construction Jobs", "Hireline",
  "Hireline for Business") — customers' brands appear only INSIDE the creative (verified across
  South Jersey Heating and Cooling, Whitacre Rebar, Wagner Mechanical, etc.).
- So: **one Meta Business + one page + one ad account, agency-style, run by us** — customers
  never touch Meta. This kills the hardest Phase-2 problem (per-tenant Meta onboarding).
  Pontifex equivalent: page "Pontifex Industries Job Board", one ad account, all client
  campaigns under it, client branding in the creative.
- Their ads run across FB/IG/Messenger/Audience Network; format matches the generated creative
  we captured (HIRING headline / ✔ bullets / pay banner / benefits / Apply Now).
- They also run their own B2B acquisition ads ("Still relying on job boards to hire?").

### 5.4 Sequencing note
Phase 1 (build now): product + pipeline + translation + Stripe billing rails + the HIRE-branded
signup/login funnel. Ads run manually from the "Pontifex Industries Job Board" page via Ads
Manager (founder creates the page — 10 min, free). Phase 2: Meta Marketing API automation under
that same single ad account (business verification + app review, founder-action heavy).

## 6. Phase 2 — connecting the ad platforms (step-by-step, agreed Jul 3)

FB + IG = ONE integration (Meta Marketing API; Instagram is a placement). TikTok = second.

### 6.1 Meta (Facebook + Instagram) — ~2–4 wks, mostly verification/review wait
1. FOUNDER (~30 min): create FB Page "Pontifex Industries Job Board"; in Business Manager add it
   to the PontifexIndustriesLLC portfolio; create+link IG account (@pontifexjobboard).
2. FOUNDER (starts the long pole): Business verification in Business Manager → Security Center
   (LLC docs, domain, domain email). Days–2 weeks.
3. FOUNDER+CLAUDE: Meta developer app (type Business); App Review for ads_management, ads_read,
   business_management @ Advanced Access (Claude drafts use-case + screencast script). 1–4 wks.
4. FOUNDER (~15 min): create the ONE agency ad account in the portfolio + payment method;
   create System User; long-lived token → Vercel env (META_SYSTEM_USER_TOKEN, META_AD_ACCOUNT_ID,
   META_PAGE_ID). Founder pastes values; never in code.
5. CLAUDE (1 session): lib/ads/meta.ts + POST /api/hiring/jobs/[id]/publish (creative render →
   Campaign → Ad Set → Ad → link /apply/[slug]?utm_source=...), pause/resume tied to job status,
   daily insights cron → impressions/clicks + spend ledger (raw_cost×markup). NON-NEGOTIABLE:
   special_ad_categories=["EMPLOYMENT"] on every campaign (US law; limits targeting to ~15mi+
   radius, no age/gender — aligns with our ADEA guardrail).
6. First live test: Patriot laborer job @ $5–10/day, verify end-to-end, then real budgets.

### 6.2 TikTok — ~1–2 wks
1. FOUNDER (~20 min): TikTok Business Center + Ads Manager account + payment.
2. FOUNDER+CLAUDE: developer app on TikTok for Business → Marketing API access (~1–2 wks;
   Claude drafts the application).
3. CLAUDE: lib/ads/tiktok.ts + same publish/sync plumbing (TIKTOK_ACCESS_TOKEN,
   TIKTOK_ADVERTISER_ID env).
CAVEATS (tell customers honestly): TikTok is video-first — start with Smart Creative /
image-to-video templates fed by our ad kit; and TikTok minimums (~$50/day campaign, ~$20/day
ad group) far exceed Meta's (~$1/day) — FB+IG is the default recommendation for small shops,
TikTok for volume/younger-workforce hiring.

### 6.3 Already future-proofed in Phase 1 (no rework when tokens land)
Per-channel copy on every job (FB text / IG placement / TikTok caption), channels[] selection,
per-channel spend ledger, funnel fields the insights cron will fill. Publishing goes from
copy-paste to one click the day the env vars exist.

## 7. Open questions for the founder
1. ~~MVP without Meta auto-publish OK?~~ → Confirmed by the agency model: manual Ads Manager
   under the ONE Pontifex ad account to start.
2. Do you want the apply page on pontifexindustries.com (`/apply/...`) or a per-tenant
   subdomain later?
3. Interview scheduling: worth it in Phase 1, or wait? (Hireline gates it behind calendar connect.)
4. Default markup on ad spend (plan assumes 1.5×) — your call, tunable per tenant.
