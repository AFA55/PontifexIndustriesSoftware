export const dynamic = 'force-dynamic';
// The response returns immediately; the budget is for the after() analysis
// (Sonnet over up-to-500 pages of extracted text). Vercel's 25s default
// killed exactly this pattern once before (feedback loop, Jul 21).
export const maxDuration = 120;

/**
 * POST /api/takeoffs/documents/[id]/analyze — AI scope analysis.
 *
 * "AI suggests, human confirms" (plan §4): the model reads each sheet's
 * EXTRACTED TEXT LAYER (~95%-reliable modality per AECV-Bench) — sheet
 * numbers, titles, notes, schedules — and produces:
 *   - a document-level rundown of the concrete-cutting scope it sees
 *   - per-sheet summaries + which sheets matter for the trade
 *   - suggested conditions (e.g. "Wall Saw — 12in") the estimator can
 *     one-tap create. It NEVER draws measurements or emits quantities.
 * Result lands on takeoff_documents.ai_scope_summary; client polls.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('takeoff_documents')
    .select('id, name, status')
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (doc.status === 'analyzing') {
    return NextResponse.json({ error: 'Analysis already running' }, { status: 409 });
  }

  const { data: pages } = await supabaseAdmin
    .from('takeoff_pages')
    .select('id, page_number, sheet_number, sheet_title, discipline, page_text')
    .eq('document_id', id)
    .eq('tenant_id', guard.tenantId)
    .order('page_number');
  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: 'No pages registered yet' }, { status: 400 });
  }

  await supabaseAdmin
    .from('takeoff_documents')
    .update({ status: 'analyzing' })
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);

  const tenantId = guard.tenantId;

  after(async () => {
    try {
      const { generateText, Output } = await import('ai');
      const { z } = await import('zod');

      const sheetBlocks = pages
        .map((p: any) => {
          const label = [p.sheet_number, p.sheet_title].filter(Boolean).join(' — ') || `Page ${p.page_number}`;
          const text = (p.page_text ?? '').slice(0, 6000);
          return `=== PAGE ${p.page_number} (${label})${p.discipline ? ` [${p.discipline}]` : ''} ===\n${text || '(no extractable text — likely a scanned/raster sheet)'}`;
        })
        .join('\n\n');

      const schema = z.object({
        documentSummary: z.string().describe('Plain-English rundown of the project and the concrete-cutting/demolition scope found across the set. Cite sheet numbers for every claim.'),
        keySheets: z.array(
          z.object({
            page_number: z.number(),
            reason: z.string().describe('Why this sheet matters for a cutting/coring sub.'),
          })
        ).describe('Sheets an estimator should open first.'),
        pageSummaries: z.array(
          z.object({
            page_number: z.number(),
            summary: z.string().describe('1-2 sentences: what is on this sheet, cutting-relevant items first.'),
          })
        ),
        suggestedConditions: z.array(
          z.object({
            name: z.string(),
            measure_type: z.enum(['linear', 'count']),
            surface: z.enum(['wall', 'slab', 'curb', 'other']).optional(),
            depth_in: z.number().optional(),
            core_diameter_in: z.number().optional(),
            evidence: z.string().describe('The note/callout text and sheet that justifies this condition.'),
          })
        ).describe('Scope buckets worth creating — ONLY where the text evidence supports them.'),
      });

      const { output } = await generateText({
        model: 'anthropic/claude-sonnet-5',
        output: Output.object({ schema }),
        prompt: `You are an estimator's assistant for a CONCRETE CUTTING & CORING subcontractor reading a construction bid set. Below is the extracted text layer of every sheet (text extraction from drawings is reliable; you are NOT looking at images, so never claim to see graphics — reason only from the text).

Identify scope relevant to the trade: saw cutting (slab/wall/curb), core drilling, penetrations, demolition of existing concrete, trenching, expansion/control joints, x-ray/scanning notes, dowel drilling. Note depths, diameters, and dimensions WHEN THE TEXT STATES THEM — never invent numbers. Every claim must cite its sheet (page number or sheet number). If a sheet has no extractable text, say it needs manual review. Do not estimate quantities — that is the human's job with the measuring tools.

Document: ${doc.name}

${sheetBlocks}`.slice(0, 350000),
      });

      // Persist per-page summaries + document rundown.
      for (const ps of output.pageSummaries ?? []) {
        const page = pages.find((p: any) => p.page_number === ps.page_number);
        if (page) {
          await supabaseAdmin
            .from('takeoff_pages')
            .update({ ai_page_summary: ps.summary.slice(0, 2000) })
            .eq('id', page.id)
            .eq('tenant_id', tenantId);
        }
      }
      await supabaseAdmin
        .from('takeoff_documents')
        .update({
          status: 'analyzed',
          ai_scope_summary: {
            documentSummary: output.documentSummary,
            keySheets: output.keySheets,
            suggestedConditions: output.suggestedConditions,
          },
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    } catch (err: any) {
      console.warn('[takeoffs] scope analysis failed:', err?.message);
      await supabaseAdmin
        .from('takeoff_documents')
        .update({ status: 'ready' })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .then(() => {}, () => {});
    }
  });

  return NextResponse.json({ success: true, message: 'Analysis started' }, { status: 202 });
}
