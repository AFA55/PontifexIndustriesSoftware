# Takeoffs Module — Architecture Plan

**Date:** July 22, 2026
**Trigger:** Founder request — bring takeoffs in-house (Easy Takeoffs trial ended mid-bid). Upload drawings → measure → AI page analysis → scope layout, for Patriot project managers/estimators.
**Research base:** live walkthrough of the founder's Easy Takeoffs account (his real Wolfie's Drive Thru takeoff), a market scan of 8 takeoff tools, a technical-architecture study (pdf.js/overlay/calibration/data-model), and an AI-accuracy study (AECV-Bench + practitioner evidence). Full agent reports in the session transcript; key citations inline.

---

## 1. What the founder actually does today (ground truth from his account)

- 5 projects (Centerwell, Wolfie's Drive Thru, Qdoba, …), 17 documents, 70 MB — real GC bid sets (43-page IFP set, 23 MB).
- Real takeoff observed: **"gas lines" group, 60 linear measurements** (9'-8", 5'-5", 16'-6"…) on sheet P3 of the Wolfie's set, page scale `1" = 12.5'-0"`, 100 measurements across 2 pages.
- Easy Takeoffs' shape: project → folders → PDF docs → viewer with Takeoffs/Pages side panel; toolbar = select, calibrate, linear, curve, polygon area, count, angle, text, arrow, rectangle; groups with per-item rename/move/delete, color, hide-on-canvas, "Apply tool set" (templates); per-page item counts; Rev management; share + export; **AI = auto-name pages + auto-detect scales only** (5,000 pages/mo quota).
- **Why he's locked out: $39/mo / $399/yr paywall on measurement tools** after trial. That price is the alternative to building (honest-options table, §8).

## 2. What matters for a concrete-cutting sub (market synthesis)

Table stakes across all 8 tools: PDF viewing, per-page scale + calibrate-by-dimension, linear/area/count, color-coded condition groups with live totals, templates, annotated-PDF + CSV export, revision compare, sharing.

The trade needs almost none of the $2–3K/yr AI tier (room detection = interior trades). What it needs — and **no tool on the market has** — is:

> **Conditions that speak concrete cutting**: cut DEPTH, core DIAMETER, wall-vs-slab, over-cut allowance — with formula outputs (LF × depth = sq-ft of cut face) — and a GC-ready marked-scope PDF. Reviewers explicitly pan the AI tools for concrete/structural trades (Togal Trustpilot). Beam AI is the only vendor even marketing saw-cutting takeoffs, and only as a done-for-you service.

That gap is the product. And it chains directly into what we already have: takeoff conditions → quote lines → job ticket scope (`work_items` uses the same vocabulary: Core Drilling ×6, `linear_feet_cut`, `cut_depth_inches`, `core_size` — the ticket tables were built for this).

## 3. Architecture (technical synthesis)

### Rendering (v1: pure client-side pdf.js)
- pdf.js with **viewport-clipped re-render on gesture settle** (`getViewport({scale, offsetX, offsetY})` sized to screen), CSS-transform of the stale canvas during pan/zoom (60fps), debounced sharp re-render (~200ms).
- Page virtualization (current ±1 mounted, `page.cleanup()` on evict); dpr-aware canvas; thumbnails rendered once at upload, persisted to Storage.
- **Escape hatch designed in:** geometry lives in PDF page coordinates, so if 100-sheet scanned sets choke mobile later, we add a server-side tile pyramid (PlanGrid/Forge pattern: `{doc}/{page}/{z}/{x}_{y}.webp` in Storage) without touching a single measurement.

### Measurement overlay (SVG, single matrix)
- One SVG over the canvas; ALL shapes inside one `<g transform="matrix(k,0,0,k,tx,ty)">`; geometry always in page space. Pan/zoom mutates only k/tx/ty.
- Counter-scaled strokes/handles (`strokeWidth = 1.5/k`, handles `7/k`); invisible fat twin paths (`12/k`, `pointer-events:stroke`) so thin lines are tappable with gloves (≥44px rule).
- Tools: count (points), linear (polyline, shift = ortho constrain), area (polygon, shoelace formula + perimeter), vertex edit with midpoint-insert handles. One state machine: `idle | drawing | editing | panning | calibrating`.

### Scale calibration (the accuracy linchpin)
- `feet_per_point = (12/frac) / 72 / 12 × userUnit` for named scales; **calibrate-by-known-dimension is the PRIMARY flow** (bid sets are routinely fit-to-page/half-size printed — the title-block scale lies): draw a line over a printed dimension → enter `24' 6"` → derive scale → snap to nearest named scale if within ~2% → prompt a second verification dimension.
- Apply to: this page / all pages / selected (Bluebeam's affordance). Per-page scale + `scale_regions` jsonb for mixed-scale detail sheets (ship page-level; schema ready for regions).
- Uncalibrated pages show "Scale not set" and block measuring — a silently wrong scale corrupts every number after it.

### Data model (tenant-scoped, RLS via SECURITY DEFINER helpers)
```
takeoff_documents   (id, tenant_id, customer_id?, name, storage_path, page_count, status, created_by)
takeoff_pages       (id, tenant_id, document_id, page_number, width_pt, height_pt, rotation, user_unit,
                     sheet_number, sheet_title, discipline, scale_feet_per_point, scale_label,
                     scale_regions jsonb, page_text, page_text_runs jsonb, thumbnail_path)
takeoff_conditions  (id, tenant_id, document_id/project scope, name, measure_type count|linear|area,
                     unit EA|LF|SF|CY, color, unit_cost, waste_factor,
                     depth_in, core_diameter_in, surface wall|slab|curb,   ← the trade-specific gap
                     sort_order)
takeoff_measurements(id, tenant_id, condition_id, page_id, geometry jsonb (page coords),
                     quantity, raw_length_pt, raw_area_pt2, scale_used, label, created_by)
```
- Quantities denormalized for SQL rollups (`GROUP BY condition` = the estimate view); raw scale-free lengths kept so **recalibration is a one-statement recompute**, never a geometry re-read.
- Client computes live, server recomputes on save (shared ten-line TS: polyline length + shoelace).
- New bucket `takeoff-documents` (private). No PostGIS — jsonb is the right altitude.

### Plan intelligence from the text layer (deterministic, pre-AI)
- `page.getTextContent()` on upload → sheet number/title via Procore's heuristics (bottom-right 15%×25% of page, largest font run matching `/^[A-Z]{1,3}[-.]?\d{1,3}(\.\d{1,2})?$/`), discipline from letter prefix; always user-editable review table.
- Full page text into `page_text` + tsvector GIN index → "find every sheet that says SAW CUT" is a SQL query; stored run coordinates let us highlight the hit on the sheet.
- Delight feature: when the user draws a calibration line near a dimension string (`24'-6"`), pre-fill it.

## 4. The AI layer — "AI suggests, human confirms" (accuracy-first)

Benchmarks (AECV-Bench, 2026): vision models read drawing TEXT at ~95%, classify sheets/answer grounded questions at ~80-91% — but **count small symbols at 34-39%** and localize with IoU ~0.16. Every credible vendor sells "AI first pass, human review." Design accordingly:

**V1 (safe, ships with the module):**
1. **Sheet indexing** — auto-name/classify every page (grounded in text layer, Claude arbitrates ambiguity). Editable tags. [= Easy Takeoffs' whole AI, at commodity accuracy]
2. **Scale suggestion** — AI reads title-block scale as a SUGGESTION into the calibrate tool; never auto-applied.
3. **Page rundown ("what's on this sheet for us")** — Claude vision on a high-DPI render + the text layer: scope summary for a cutting sub, notes/schedules digest, every claim cites its sheet. Two-pass: overview → zoomed crops of note blocks/schedules.
4. **Callout extraction with pinned suggestions** — search text layer for trade phrases (SAW CUT, CORE DRILL, DEMO EXIST., EXPANSION JOINT, PENETRATION, X-RAY/SCAN); Claude classifies each hit; a **suggested pin lands at the exact text-layer coordinate** (deterministic position — no model coordinates). PM taps accept/move/reject; accepted pins become count measurements under a condition. Accept/reject telemetry = our accuracy log.
5. **Where-to-measure guidance** — "linear sawcut scope likely on S2.1 + the demo plan" (regions of interest, not auto-drawn geometry).

**V2 (guarded):** auto-count of drawn penetration symbols — high-DPI tiles + self-consistency voting (3-5 runs, disagreement = low confidence) + Set-of-Mark anchoring, shipped ONLY as highlighted candidates needing per-pin confirmation, never a bare number into a bid.

**Never:** AI-measured dimensions from pixels (models read printed dimension strings; they cannot measure), raw model bounding boxes, unconfirmed counts flowing into quotes.

Infra: reuse the AI Gateway pattern (`anthropic/claude-sonnet-5` like the ticket-analysis agent); page renders at 200-300 DPI, tiled to the vision resolution cap; `maxDuration` sized from day one (feedback-loop lesson: Vercel default killed a 25s+ agent).

## 5. Pontifex integration

- **Module key `takeoffs`** in `lib/features.ts` (`defaultOn: false` like hiring; Patriot switched on). Sidebar entry + admin card gated by role: `admin`, `super_admin`, `operations_manager`, `salesman` (estimators), + future `project_manager` role.
- **Route shape:** `/dashboard/takeoffs` (project list) → `/dashboard/takeoffs/[docId]` (viewer). API under `/api/takeoffs/*` via `requireAuth` + role check + explicit tenant filter (supabaseAdmin convention).
- **The payoff chain:** takeoff conditions/totals → one-click "Create quote" (`240 LF wall saw @ $X`) → on win, "Create job ticket" pre-filled with scope + the marked plan pages attached as job documents → operators see exactly what to cut. Artifex gets `search_takeoffs` and "what did we measure for Trehel?" tooling later.
- **Exports v1:** annotated PDF (sheets + colored scope overlay burned in — the deliverable a GC sees) + CSV of grouped totals.
- Desktop-first (estimating is a desk task), but the viewer must degrade to read-only + count pins on phones (44px targets already in the overlay design).

## 6. Build phases (each independently shippable + verifiable)

| Phase | Scope | Size |
|---|---|---|
| **T1 — Foundation** | Migrations (4 tables + bucket + RLS), upload flow, project/document list, pdf.js viewer with pan/zoom/virtualization, thumbnails, sheet-index extraction + review table | ~1 session |
| **T2 — Measurement core** | Calibration flow (named + by-dimension + verify), SVG overlay + linear/area/count tools, conditions CRUD with the trade fields (depth/diameter/surface), live totals panel, server recompute | ~1-2 sessions |
| **T3 — Deliverables** | Annotated-PDF export, CSV export, quote handoff (conditions → quote draft), text search across sheets | ~1 session |
| **T4 — AI v1** | Sheet auto-naming/classification, scale suggestion, page rundown, callout pins with accept/reject | ~1 session |
| **T5 — later** | Guarded auto-count, revision overlay/compare, tile-pyramid renderer for giant scanned sets, Artifex tools | as needed |

Verification per phase: real bid set (the founder's Wolfie's 43-page IFP set re-uploaded), cross-check measured LF against his Easy Takeoffs numbers (60 gas-line measurements = the reference dataset), mobile-responsive audit on the viewer, guardian review on every builder, `rls-policy-auditor` on the migration.

## 7. Accuracy guarantees (the founder's #1 requirement)

1. Calibration-first UX + mandatory verify-second-dimension prompt + "Scale not set" hard block.
2. Areas scale by the SQUARE of the scale factor (the classic takeoff bug — unit-tested).
3. Server-side recompute of every quantity; client can't corrupt totals.
4. Recalibration recomputes all quantities atomically from raw point-space values.
5. AI never writes a number into a takeoff — it suggests pins/regions/labels; a human accepts each one; accept-rate telemetry tells us when trust is earned.
6. Reference-set regression: the Wolfie's gas-line takeoff (60 measurements, known totals) becomes a fixture we re-measure after any geometry/scale code change.

## 8. Honest options (dev-decisions rule)

| Option | Cost | Timeline | Reversible? | Verdict |
|---|---|---|---|---|
| Keep Easy Takeoffs | $399/yr | today | yes | Cheapest short-term; zero platform value; his data stays in their silo; no ticket/quote integration; no real AI |
| Bluebeam Complete | $440/yr/user | today | yes | Industry standard, still no trade conditions, desktop-heavy |
| AI-tier tools (Togal/Kreo/STACK) | $2,000-3,000/yr/user | today | yes | Their AI targets interior trades; reviewers pan it for concrete/structural |
| **Build the module (this plan)** | ~4-5 build sessions | T1-T3 usable in ~3 sessions | code is ours | Fills a real market gap in the founder's own trade; feeds quotes/tickets; white-label = sellable to every future tenant; the strongest strategic fit with the non-compete positioning ("custom digital infrastructure", industry-agnostic bones with trade-specific conditions) |
| Bridge: pay $39/mo while building | +$39-78 total | — | yes | **Recommended combo** — unblocks his active bids during T1-T3 |

**Recommendation:** build (T1→T3 first, AI in T4), pay Easy Takeoffs for 1-2 months as the bridge so bidding never stalls. The founder decides on the bridge subscription — that's his card, not ours to press.
