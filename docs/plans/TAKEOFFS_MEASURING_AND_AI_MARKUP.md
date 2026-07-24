# Takeoffs — Measuring Engine Upgrade + AI Draft Markup (Option A)

> Founder-directed, Jul 24 2026. Builds on `TAKEOFFS_MODULE_PLAN.md`. This doc
> captures the finances findings, the founder's decisions, and the phased build.
> Two research agents (pro-tool research + our-feature audit) fed the measuring
> section — synthesize their output before building the measuring upgrades.

## The founder's asks (decoded)
1. **Finances** — what large-file storage + AI analysis actually cost.
2. **Learning system** — the software learns from what Patriot measures/scopes
   (incl. **demo/demolition**) so future analysis proposes markups "the Patriot way."
3. **Page-targeted analysis** — before analyzing, AI lists the sheets; the estimator
   picks page numbers + says what to look for; analysis runs only on those pages.
4. **"Mark out what we need to do"** — not just describe scope; the AI should place
   draft markups ON the drawing. **Decision: Option A** — AI drafts, human confirms.
5. **Better measuring** (Jul 24 follow-up) — multi-point measuring, more measure
   modes, a clearer place to set the linear condition, more professional layout;
   benchmark against real takeoff tools (research agent running).

## Finances (grounded in the live code)
- **Storage ≈ free.** Supabase Pro ($25/mo, already paid) includes 100 GB. Plan-set
  PDFs are 20–100 MB (upload cap 100 MB). 50 takeoffs/mo @ 50 MB = 30 GB/yr — inside
  the included quota. Overage is $0.021/GB → pennies even at heavy use.
- **AI cost depends entirely on TEXT vs VISION:**
  - Text-only (today — reads the text layer of up to 500 pages, 350k-char cap,
    `anthropic/claude-sonnet-5`): **~$0.05–$0.65 per document.**
  - Vision on the WHOLE set (image of every page): **~$5–$15 per document.** ⚠️
  - Vision on ONLY the pages the estimator picks: **~$0.05–$0.30 per document.** ✅
- **Conclusion:** page-targeting (ask #3) is the cost gate that makes mark-out (ask #4)
  affordable AND more accurate (focused pages beat 500-page broadscan). Sonnet 5 intro
  pricing $2/$10 per MTok through 2026-08-31, then $3/$15.

## Accuracy honesty (drives Option A)
Vision models read drawing TEXT ~95% reliably but LOCATE/COUNT small symbols only
~34–39% on their own (AECV-Bench + our plan notes). So a fully-automatic markup tool
would be wrong too often for a bid. Option A keeps the human as the gate: AI drafts,
estimator confirms/nudges/deletes; nothing is a real measurement until confirmed.

## Architecture — two-phase, page-targeted, draft markup
**Phase 1 (cheap, text — mostly exists):** analyze route reads the text layer, returns
a sheet index + which sheets look relevant. UI: a page-picker where the estimator
selects pages + types what to look for (e.g. "wall saw cuts + core holes on A-3, A-4").

**Phase 2 (vision, targeted — NEW):** `POST /api/takeoffs/documents/[id]/mark`
`{ page_numbers[], instructions }`. The CLIENT already renders pages with pdf.js →
render each selected page to a PNG (~2000px long edge) and upload. Server sends the
image(s) to `anthropic/claude-sonnet-5` (vision) with `Output.object`, asking for, per
detected item: `{ name, measure_type, surface, depth_in?, core_diameter_in?, work_type,
evidence, confidence, geometry_norm }` where `geometry_norm` is NORMALIZED [0..1] image
coords (top-left origin). Server maps norm→PDF points via `page.width_pt/height_pt`
(x_pt = x_norm*width_pt) so a suggestion renders exactly where a hand-drawn one would.

**Persist as drafts (NEW table `takeoff_ai_markups`):** status suggested|accepted|rejected,
geometry in PDF points, work_type tag (cutting|coring|demo|other), instructions,
confidence. Render on the SVG overlay in a distinct dashed "suggested" style with
Accept / Reject per item. **Accept** → create condition (if new) + measurement via the
existing endpoints, mark accepted, link `accepted_measurement_id`. This accept/reject
record IS the learning signal.

**Learning (asks #2/#4):** Phase 2 pulls the tenant's recent ACCEPTED markups/conditions
(esp. same work_type / demo) and includes them as few-shot context so proposals match
how Patriot actually scopes. Per-tenant, tenant_id-scoped. Demo is just a work_type tag.

## Measuring-engine upgrade (ask #5 — pending research synthesis)
Feed from the two agents (pro-tool research + our-feature audit). Expected work items
(confirm against their reports before building), all additive, geometry stays in
PDF-point coords, server recomputes quantity on save:
- Editable vertices (drag a point after drawing) + undo-last-point mid-draw.
- More measure modes: **area** (deduction/cutout), segment mode, maybe arc.
- On-drawing labels: per-segment + total length, count numbers.
- Ortho / 45° snap toggle.
- Stronger condition panel: define/pick the active linear condition (with depth →
  derived qty) before measuring; live per-condition running total while drawing.
- Layout closer to a pro tool (thumbnails, toolbar, properties, live quantity summary).

## Build order (each step shippable + verifiable)
1. **Measuring-engine upgrades** (from the audit) — highest daily value, no AI cost.
   ✅ **BATCH 1 BUILT (Jul 24, on preview branch):** area mode (polygon shoelace,
   `raw_area_pt` migration), vertex-drag editing, Backspace undo-point, Shift/45° snap,
   on-drawing length/area labels + live running total, mobile/tablet conditions sheet,
   Area option in ConditionForm. Guardian-reviewed; fixed double-save race,
   post-drag swallowed-click, and added server geometry-type-mismatch 400s.
2. **Page-targeting Phase 1 UI** — page-picker + "what to look for." (next)
3. **Draft markup Phase 2** — migration `takeoff_ai_markups`, `/mark` vision endpoint,
   client render-to-image + draft overlay + Accept/Reject. (next)
4. **Learning loop** — few-shot from accepted markups; work_type incl. demo.

## Side feature — Ticket photo scanning (Jul 24, on same preview branch)
Founder tried to "scan a ticket" and it failed: AI Smart Fill (`schedule-form`) only
read typed/dictated TEXT via the regex parser `/api/admin/schedule-form/ai-parse`.
Added a VISION path: `/api/admin/schedule-form/ai-parse-image` (Sonnet, `requireSalesStaff`,
returns the SAME `{fields, confidence, summary}` shape) + a "Scan a paper ticket" photo
button in `AISmartFillModal.tsx` (client downscales to ≤1800px JPEG). Extracted fields
flow into the EXISTING editable schedule form → estimator edits/adds → saves as normal.
Reads the Patriot quotation form (checked services, site/contact, date, PO, water/power,
inside-outside, 480 cord, cleanup, scope notes). Conservative extraction (draft to review).

## Non-negotiables (dev-decisions)
- Geometry ALWAYS PDF-point coords; server recomputes every quantity on save.
- Every `supabaseAdmin` query carries `.eq('tenant_id', guard.tenantId)` — that IS the
  boundary. New table gets tenant_id + RLS via SECURITY DEFINER helpers.
- New table migration is additive + idempotent; rls-policy-auditor before merge.
- Mobile tap targets ≥44px. Verify PDF/measuring flows in the preview before pushing.
- Every push to main is billed — batch, confirm before pushing.
