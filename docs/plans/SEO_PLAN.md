# Pontifex Industries — SEO & Positioning Plan (v2: Custom Solutions)

**Status:** PLAN — for review before implementation. Repositioned per founder direction (Jun 2026):
Pontifex is **NOT** a concrete-cutting product. Pontifex is a **custom software solutions company** that builds
software around how a business actually works — with **Patriot Concrete Cutting as the flagship case study**.

---

## The repositioning (the core change)
**Old (wrong):** "Concrete cutting software." → pigeonholes us to one trade we don't even operate in.
**New (right):** "We build **custom software solutions** that fit your business — instead of forcing your team
onto generic, off-the-shelf tools." The homepage **leads with the problem**, sells the **custom approach**, and
**proves it with Patriot** (a real company we built a full custom operations platform for, integrated into their team).

Why this is stronger:
- It's true to what you do (bespoke builds), and uncaps the market (any business, any industry — not just cutting).
- Patriot becomes *proof*, not the product: "here's a real, end-to-end platform we built for a real company."
- Custom work = no fixed price list → the **"remove Pricing → book a consultation / demo"** decision becomes obvious.
- Local angle gets stronger: businesses search "**custom software developer near me / [city]**" — and your Upstate-SC
  presence + in-person discovery sessions are a real edge national dev shops can't match.

---

## Narrative (problem → approach → proof → CTA)
**Hero (problem-led):**
- **H1 (recommended):** "Custom Software Built Around How Your Business Actually Works"
- **Subhead:** "Off-the-shelf tools force your team to change for the software. We do the opposite — Pontifex designs and builds custom software that fits your operation, integrates with your team, and replaces the spreadsheets, paper, and disconnected apps slowing you down."
- **CTA:** "Book a Free Consultation" (primary) · "See What We Built for Patriot" (secondary → case study)
- **Local-roots line (honest, not stuffed):** "Based in Upstate South Carolina — we work hands-on with the teams we build for."

**Section flow:**
```
H1: Custom software built around how your business actually works   (the problem + promise)
H2: The Problem — Your business isn't generic. Your software shouldn't be.
    (spreadsheets, paper, 5 disconnected apps, no single source of truth, software that fights your process)
H2: How We Work — Discover → Design → Build → Integrate → Support
    (a custom build tailored to YOUR workflow, rolled out to your team, not bolted on)
H2: Case Study — Patriot Concrete Cutting   ← the proof (links to full case study page)
    (what they ran before → what we built → results: one platform for scheduling, dispatch, GPS timecards,
     equipment, job logs, invoicing, customer portal — built around their crews)
H2: What We Can Build — operations platforms, field/crew apps, scheduling & dispatch, custom dashboards,
    integrations, mobile apps  (capability, not a fixed product)
H2: Who It's For — service/field/trades/operations businesses outgrowing spreadsheets & generic SaaS
H2: Why Custom (vs off-the-shelf) — fits your process, owns your data, scales with you
H2: FAQ   ← FAQPage JSON-LD
H2: Final CTA — Book a Free Consultation
```

---

## The Patriot case study (the centerpiece content)
A dedicated, meaty page: **`/work/patriot-concrete-cutting`** (or `/case-studies/...`). This is the single most
valuable SEO + sales asset — real proof, ranks for "custom software case study," and lets the homepage stay broad.
Structure: **The Company → The Problem (before) → What We Built → How We Integrated It Into Their Team → Results/Impact →
Screenshots → Pull-quote.** Mark it up with `Article` + (optionally) `CaseStudy` schema. It also captures the vertical
("concrete cutting operations") *without* pigeonholing the brand.

---

## Keyword targets (repositioned)
**Primary (home/title):** custom software development · custom software solutions · custom business software · bespoke software development · custom operations / workflow software.
**Problem / long-tail (high intent):** "replace spreadsheets with custom software", "software built for my business", "custom software for my company", "off-the-shelf software doesn't fit", "custom field service / operations app".
**Local (Phase 1 line + Phase 3 pages):** custom software development company Greenville SC / Upstate SC / Spartanburg SC / South Carolina.
**Case-study / authority (blog + case page):** "custom software case study", "build vs buy software", "custom software ROI", "how to digitize field operations", concrete-cutting-operations angle via the Patriot page.

> Note: keep "concrete cutting" presence **only** through the Patriot case study + maybe one industries mention — not as the brand promise.

---

## PHASE 1 — Homepage + case study + technical SEO (the "push")
1. **Pricing → consultation:** 308 redirect `/pricing → /request-demo`; remove the "Pricing" nav/footer links; reframe the primary CTA to **"Book a Free Consultation"** (request-demo page repurposed as the consultation/contact funnel). *(Custom work has no price list — this is on-message now.)*
2. **Rewrite the hero + page** to the problem-led custom-solutions narrative above; **move the founder/origin story** below as the "why we get it" trust block.
3. **Build the Patriot case study page** (`/work/patriot-concrete-cutting`) — the proof asset.
4. **Server-render** the hero, problem, case-study teaser, and FAQ (today the homepage is 100% client-rendered — crawlers/AI see almost nothing).
5. **`app/sitemap.ts` + `app/robots.ts`** (neither exists today; allow AI crawlers, disallow `/dashboard`,`/api`,`/login`).
6. **JSON-LD:** `Organization` + `ProfessionalService` (software development, areaServed Upstate SC) + `FAQPage`; `Article` on the case study.
7. **Metadata/title/canonical/OG:** title `Custom Software Development | Pontifex Industries`, title template, 150–160-char description, self-canonical, reconcile OG; per-page metadata for case study + consultation; branded `opengraph-image`.

All Phase 1 = one batch → one Vercel build. Safe for the Apple review (web-only; native binary/icon/metadata untouched).

## PHASE 2 — Local foundations (mostly your action)
- **Google Business Profile** as a Service-Area Business — category **"Software Company / Custom Software Development"**, service area = Greenville, Spartanburg, Anderson, Greer, Mauldin, Easley. You do in-person discovery/consults = qualifies honestly.
- **Directories/citations:** Clutch + DesignRush + GoodFirms (the review sites buyers use for dev shops), LinkedIn, Bing Places. (G2/Capterra matter less for a custom-dev firm than for a product — Clutch is the key one.)
- **Local backlinks:** Greenville Chamber, Spartanburg Chamber, Carolinas AGC (Patriot's world), Upstate tech/founder groups.
- **Reviews:** get Patriot + early clients to leave Clutch/Google reviews (testimonials = the #1 trust lever for custom dev).

## PHASE 3 — Geo + industry pages (code, on-demand — never batch/thin)
- Local: `/locations/south-carolina/greenville`, `/spartanburg`, … — genuinely unique, "custom software development in {city}", local proof, `areaServed` schema. Build on demand only. Upstate SC → rest of SC (Columbia/Charleston) → Georgia (Atlanta/Savannah/Augusta).
- Industry/solution pages as the portfolio grows: `/industries/field-service`, `/industries/construction`, `/what-we-build/scheduling-dispatch`, etc. — each backed by real capability/proof.
- `{competitor/alternative}` and "build vs buy" comparison content for bottom-funnel intent.

---

## Decisions for sign-off
1. **H1:** recommended *"Custom Software Built Around How Your Business Actually Works"* — or a punchier *"Software That Fits Your Business — Not the Other Way Around"*?
2. **Primary CTA wording:** "Book a Free Consultation" (recommended for custom work) vs keep "Request a Demo".
3. **Case study URL:** `/work/patriot-concrete-cutting` (recommended) vs `/case-studies/patriot`.
4. **Scope of the first push:** full Phase 1 (home rewrite + Patriot case study page + pricing redirect + technical SEO) in one build — yes?

---

## ADDITION (Jun 2026) — the "agentic automations" angle
The founder frames the product as **"agentic personal software solutions and automations."** This v2 plan sold "custom software" but omitted the **AI/agentic + automations** edge — a real differentiator vs generic dev shops. Weave it throughout:
- **Hero subhead:** "custom software **and agentic automations**."
- **"What We Build" pillar — Agentic automations:** AI that does the repetitive work (voice→data parsing, timecard chasing, document generation, smart scheduling). We already ship voice equipment checkout, voice-to-text logs, and skill-based smart scheduling — *proof* we build AI features, not just CRUD.
- **Keywords:** add "AI workflow automation," "agentic software," "AI automation consultant [Upstate SC]."
- **FAQ:** add "Do you build AI automations?" → yes, with the Patriot voice/scheduling examples.
> Full execution checklist (homepage section-by-section + technical SEO + local) now lives in **`SEO_HOMEPAGE_PLAN.md`**.
