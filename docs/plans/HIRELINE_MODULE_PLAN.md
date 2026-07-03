# Hireline-Style Hiring Module — Build Plan

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

## 5. Open questions for the founder
1. MVP ships without auto-publishing to Facebook (you paste the generated ad into Meta Ads
   Manager, ~2 min/job). Confirm that's acceptable to start.
2. Do you want the apply page on pontifexindustries.com (`/apply/...`) or a per-tenant
   subdomain later?
3. Interview scheduling: worth it in Phase 1, or wait? (Hireline gates it behind calendar connect.)
