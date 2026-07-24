export const dynamic = 'force-dynamic';
// One-sheet vision analysis: reads the CURRENT page image + its text layer and
// suggests cutting/coring/demo scope (incl. implied cross-trade scope) as soft
// markups the estimator confirms. Per-page keeps cost + confusion down vs. the
// whole-set text scan. Returned synchronously (client shows a spinner). ~10–25s.
export const maxDuration = 90;

/**
 * POST /api/takeoffs/documents/[id]/mark-page
 * Body: { page_id: string, image: string (dataURL), instructions?: string }
 *
 * "AI suggests, human confirms." The model REASONS about where concrete
 * cutting/coring/demolition is required — including scope only IMPLIED by other
 * trades (e.g. an existing line on a plumbing sheet marked for removal means the
 * slab above it must be saw-cut). It returns suggestions with geometry in
 * normalized [0..1] image coords + a rationale; we map to PDF-point coords so a
 * suggestion renders exactly where a hand-drawn measurement would.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

// Cheap in-instance guard against double-fired billed vision calls (double-click,
// two tabs on the same warm lambda). Not a global limiter — just kills the
// common accidental-duplicate case so we don't pay twice for one click.
const inFlight = new Set<string>();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pageId = (body?.page_id ?? '').toString();
  const image: string = (body?.image ?? '').toString();
  const instructions: string = (body?.instructions ?? '').toString().slice(0, 500);
  if (!pageId) return NextResponse.json({ error: 'page_id is required' }, { status: 400 });
  if (!image.startsWith('data:image/')) return NextResponse.json({ error: 'A rendered page image is required' }, { status: 400 });
  if (image.length > 12_000_000) return NextResponse.json({ error: 'Page image too large' }, { status: 413 });

  const { data: page } = await supabaseAdmin
    .from('takeoff_pages')
    .select('id, document_id, page_number, width_pt, height_pt, sheet_number, sheet_title, discipline, page_text')
    .eq('id', pageId)
    .eq('document_id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const flightKey = `${guard.userId}:${pageId}`;
  if (inFlight.has(flightKey)) {
    return NextResponse.json({ error: 'Already reading this sheet — hang on a moment.' }, { status: 429 });
  }
  inFlight.add(flightKey);

  try {
    const { generateText, Output } = await import('ai');
    const { z } = await import('zod');

    const schema = z.object({
      pageSummary: z.string().describe('2-4 sentences: the sheet discipline (demo vs new), what the legend/keynotes tell you, and the cutting/coring/demo scope you see or infer. Say plainly when scope is IMPLIED by another trade, and note what you examined so silence is informative.'),
      suggestions: z.array(z.object({
        name: z.string().describe('Short scope-bucket name, e.g. "Saw cut over existing 4in waste line", "Core 6in for new roof drain", "Demo existing equipment pad".'),
        measure_type: z.enum(['linear', 'count', 'area']),
        work_type: z.enum(['cutting', 'coring', 'demo', 'trench', 'other']),
        surface: z.enum(['wall', 'slab', 'curb', 'other']).optional(),
        depth_in: z.number().optional().describe('Only if a depth/thickness is stated or clearly implied.'),
        core_diameter_in: z.number().optional().describe('Core/penetration diameter if stated.'),
        rationale: z.string().describe('WHY this is scope. For implied scope, name the trade cue and why it means we cut (e.g. "existing waste line marked for removal → slab must be saw-cut to reach it").'),
        evidence: z.string().optional().describe('The SPECIFIC on-sheet evidence: quote the exact keynote/note text or describe the linework, plus its location (grid ref or nearby room/label). If you cannot cite evidence you actually see, do not emit the suggestion.'),
        confidence: z.number().describe('0..1. Be honest — an explicit "sawcut" note is high; cross-trade inference is lower.'),
        points: z.array(z.object({ x: z.number(), y: z.number() }))
          .describe('Location on THIS sheet in normalized coords (x and y each 0..1, origin = top-left of the image). polyline/cut = the path (>=2 pts); area/demo/trench = the boundary (>=3 pts); count = one point per core/penetration.'),
      })).describe('Only real, evidence-backed scope. Few high-confidence beats many guesses. Empty if nothing cuttable.'),
    });

    const prompt = `You are a senior estimator for a CONCRETE CUTTING, CORING & SELECTIVE-DEMOLITION subcontractor, reviewing ONE construction sheet (image + its extracted text below). Concrete drawings almost never say "cut here." Your job is to INFER where saw-cutting, wall-sawing, core drilling, or concrete removal will be REQUIRED — by reading what OTHER trades' work implies. Reason about intent; do not just read labels.

GROUND YOURSELF FIRST (before suggesting anything):
1. Identify the sheet discipline and whether it is a DEMOLITION, NEW-WORK, or combined sheet.
2. Read this sheet's LEGEND and KEYNOTES. The legend is authoritative for what each line type / hatch means on THIS sheet — do NOT assume "dashed = demo." Note the abbreviations in use ((E)=existing, (N)=new, (R)/REM=remove/relocate, etc. as this sheet defines them).

THEN infer concrete scope using these cue → scope rules:
- Existing pipe/conduit/duct shown TO BE REMOVED or RELOCATED that runs under/through a slab or wall → SAW-CUT + REMOVE the concrete above/around it (a cut line following the run, often a removal area).
- NEW underground pipe/conduit/storm/sanitary/electrical line in a slab-on-grade → TRENCH: two parallel saw-cuts a trench-width apart along the run.
- NEW penetration (pipe riser, floor drain, cleanout, conduit stub-up, roof drain) through EXISTING concrete with no cast-in sleeve → CORE DRILL (a point per penetration; diameter from the note/schedule if given).
- Rows in a PENETRATION / SLEEVE SCHEDULE → one core per row.
- Keynote verbs "remove/demolish existing slab, curb, pad, sidewalk" → SLAB/PAD REMOVAL (perimeter saw-cut + break out) → a removal area.
- New door/opening in an existing concrete or CMU wall → WALL SAW opening.
- Explicit "sawcut & patch / cut & cap / core & seal" notes → the stated operation (high confidence).

RULES THAT MATTER MORE THAN COVERAGE:
- BE CONSERVATIVE. A few high-confidence, well-evidenced suggestions beat many speculative ones. If unsure whether concrete cutting is actually implied, mark it low confidence or omit it. An EMPTY list is a valid, useful answer.
- EVERY suggestion MUST cite specific evidence you can actually see (quote the exact keynote/note text or describe the linework) plus its location (grid ref / nearby room). No citable evidence → do not emit it.
- Place geometry on THIS sheet where the evidence appears — the reason and the cut are on the same sheet. Coordinates are approximate pointers a human will refine; being the right TYPE in the right PLACE matters more than exact dimensions.
- Do not invent scale, dimensions, or schedule values. If size is unknown, say so in the evidence/rationale.
- Cap it at the ~15 strongest suggestions for this sheet.
${instructions ? `\nThe estimator specifically wants you to look for: ${instructions}\n` : ''}
Sheet: ${page.sheet_number ?? ''} ${page.sheet_title ?? ''} ${page.discipline ? `(${page.discipline})` : ''} — page ${page.page_number}
Extracted text of this sheet (read the keynotes/schedules here — cite exact quotes):
${(page.page_text ?? '(no extractable text — rely on the image)').slice(0, 12000)}`;

    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-5',
      output: Output.object({ schema }),
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', image }] }],
    });

    const W = Number(page.width_pt);
    const H = Number(page.height_pt);
    const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
    const geomType = (mt: string) => (mt === 'linear' ? 'polyline' : mt === 'area' ? 'polygon' : 'count');
    const minPts = (mt: string) => (mt === 'area' ? 3 : mt === 'linear' ? 2 : 1);

    const suggestions = (output.suggestions ?? [])
      .map((s: any) => {
        const pts = (s.points ?? [])
          .filter((p: any) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
          .map((p: any) => [clamp01(p.x) * W, clamp01(p.y) * H] as [number, number]);
        return {
          name: (s.name ?? 'Suggested scope').toString().slice(0, 120),
          measure_type: s.measure_type,
          work_type: s.work_type,
          surface: s.surface,
          depth_in: typeof s.depth_in === 'number' ? s.depth_in : undefined,
          core_diameter_in: typeof s.core_diameter_in === 'number' ? s.core_diameter_in : undefined,
          rationale: (s.rationale ?? '').toString().slice(0, 600),
          evidence: (s.evidence ?? '').toString().slice(0, 400),
          confidence: typeof s.confidence === 'number' ? Math.min(1, Math.max(0, s.confidence)) : 0.5,
          geometry: { type: geomType(s.measure_type), points: pts },
        };
      })
      .filter((s: any) => s.geometry.points.length >= minPts(s.measure_type))
      .sort((a: any, b: any) => b.confidence - a.confidence)
      .slice(0, 15);

    return NextResponse.json({
      success: true,
      data: { pageSummary: output.pageSummary ?? '', suggestions },
    });
  } catch (err: any) {
    console.warn('[takeoffs] mark-page failed:', err?.message);
    return NextResponse.json({ error: 'Could not analyze this sheet. Try again.' }, { status: 500 });
  } finally {
    inFlight.delete(flightKey);
  }
}
