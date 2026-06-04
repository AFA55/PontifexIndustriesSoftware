# SEO + Homepage Execution Plan — Jun 2026
**Companion to `SEO_PLAN.md`** (strategy). This is the **implementation-ready checklist** from the SEO audit. **Status:** PLAN — execute next session. **Positioning (locked):** Pontifex = **custom software solutions company** building software around how a business actually works, **+ agentic personal-software automations**, with **Patriot Concrete Cutting as the flagship case study** (proof, not product).

> ⚠️ The current public site still says **"niche construction / concrete cutting"** throughout — off-message for the repositioning. And the homepage is fully `'use client'`, so crawlers/AI engines see an empty shell. Both must change.

---

## 1. Homepage rewrite — `app/page.tsx` (section by section)
Current off-message spots → change to:
- **Badge (~485)** "Operations Software for Niche Construction" → **"Custom Software & AI Automations · Upstate SC"**
- **H1 (~491)** → **"Custom Software Built Around How Your Business Actually Works"** (optional emphasis: *"…plus the agentic automations that run it for you."*)
- **Subhead (~503)** → "Off-the-shelf tools force your team to change for the software. We do the opposite — Pontifex designs and builds **custom software and agentic automations** that fit your operation, integrate with your team, and replace the spreadsheets, paper, and disconnected apps slowing you down."
- **Hero CTAs (~513–526)** → primary **"Book a Free Consultation"** (`/request-demo`); secondary **"See What We Built for Patriot"** (`/work/patriot-concrete-cutting`). Drop scroll-only "See How It Works" as primary.
- **Local line (new)** → "Based in Upstate South Carolina — we work hands-on with the teams we build for."
- **Stat strip (~533–536)** → capability proof: "End-to-end custom platforms" · "AI agents & automations" · "Built around your workflow."
- **Narrative order (problem → approach → proof → CTA):** Problem ("Your business isn't generic. Your software shouldn't be.") → How We Work (Discover→Design→Build→Integrate→Support) → **What We Build** (operations platforms, field/crew apps, scheduling/dispatch, dashboards, integrations, **+ agentic automations**: voice parsing, timecard chasing, doc generation) → Patriot case study link → Who It's For → Why Custom → FAQ → Final CTA.
- **Origin story (~611–645)** → move below as trust block; KEEP the line (~632) "AI changed that math… custom, wired into how you actually work" (already on-message).
- **Final CTA (~1143–1170)** → drop "niche construction" language → custom-solutions + automations close.
- **Remove Pricing links** (header ~437, footer ~1201). **Fix broken image** `/founder-photo.jpg` (~577) → use existing `public/andres-profile.jpeg`.
- **Footer NAP (~1216)** → add consistent location + phone (currently email only) for local SEO.

## 2. Technical SEO — QUICK WINS (one batch / one build)
- **Rewrite `app/layout.tsx` metadata (~20–86):** title `Custom Software Development & AI Automations | Pontifex Industries` + `title.template '%s | Pontifex Industries'`; new description (custom solutions + agentic); replace concrete keywords with: *custom software development, bespoke software, operations/workflow software, agentic automations, AI workflow automation, custom software developer Upstate SC/Greenville SC*; add `alternates.canonical`.
- **Create `app/robots.ts`** — allow all incl. AI crawlers (GPTBot, ClaudeBot, PerplexityBot); disallow `/dashboard`, `/api`, `/login`, `/company-login`, `/shop-login`, `/setup`, `/setup-account`, `/offer`, `/portal`, `/nfc-clock`; link sitemap.
- **Create `app/sitemap.ts`** — homepage, `/work/patriot-concrete-cutting`, `/request-demo`, legal pages; exclude app/auth.
- **Create `app/opengraph-image.tsx`** (`next/og`, 1200×630, bridge-P + tagline) — stop using the 512² icon for OG.
- **JSON-LD** (server-injected): `Organization`, `ProfessionalService`/`LocalBusiness` (`areaServed`: Greenville/Spartanburg/Anderson/Greer/Mauldin/Easley; `serviceType: "Custom Software Development"`), `FAQPage` (matches homepage FAQ), `Article` (case study).
- **Per-route metadata + canonical** on `/request-demo` and the new case-study page (copy the `app/privacy/page.tsx` pattern — the one correctly-configured page).
- **308 redirect `/pricing → /request-demo`** (next.config/middleware). **Noindex** `/offer` + `/patriot` (internal/named pages) via `robots:{index:false}`.

## 3. Technical SEO — LARGER EFFORTS
- **Server-render the homepage** (highest-impact): server-component shell (hero/problem/how-we-work/case-study teaser/FAQ as SSR HTML) + client islands only for framer-motion. Crawlers currently see nothing.
- **Build `/work/patriot-concrete-cutting`** — the centerpiece case study (Company → Before → What We Built → Integration → Results → screenshots w/ alt → quote → Article schema). Note: existing `/patriot` is the internal crew page, NOT this.
- **Core Web Vitals:** `GoogleMapsProvider` wraps all pages (`layout.tsx:108`) — scope it OUT of marketing pages; defer framer-motion; ensure LCP H1 is SSR text.

## 4. Local SEO
- **Google Business Profile** as Service-Area Business, category "Custom Software Development," service area = Upstate SC cities.
- Target: "custom software developer near me," "custom software development company Greenville/Spartanburg/Upstate SC," "AI automation consultant Upstate SC."
- **NAP consistency** across GBP, footer, Organization JSON-LD, Clutch/DesignRush/GoodFirms/LinkedIn/Bing Places.
- Phase 3: per-city geo pages only when genuinely unique.

## 5. Also update `SEO_PLAN.md`
Add the **"agentic personal-software automations"** angle (the v2 plan omits it) — see the appended section there.

## Files
- Edit: `app/page.tsx`, `app/layout.tsx`, `app/request-demo/page.tsx` (broaden `CompanyType` ~29, reword "concrete cutting" ~297), `app/pricing/page.tsx` (redirect), `next.config`/middleware.
- Create: `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/work/patriot-concrete-cutting/page.tsx`.
- Asset: add real `public/founder-photo.jpg` or repoint to `andres-profile.jpeg`.
- Pattern reference: `app/privacy/page.tsx` (metadata + canonical).
