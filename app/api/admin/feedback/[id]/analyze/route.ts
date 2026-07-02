export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/feedback/[id]/analyze
 *
 * Runs an AI investigation of a feedback/bug ticket and stores a DRAFT diagnosis
 * on the ticket. super_admin only — this crosses tenant boundaries by design (it
 * investigates the TICKET's tenant, not the caller's), so the narrower
 * `requireAdmin` used by the sibling PATCH/DELETE routes is not sufficient here.
 *
 * DRAFT-ONLY: the only mutation this route performs is writing `ai_analysis` +
 * `ai_analyzed_at` on the feedback_submissions row it was asked to analyze. It
 * never touches any other table, never changes `status`/`admin_response`, and
 * never contacts the customer. The agent's tools (lib/tools/ticket-analysis-tools.ts)
 * are read-only, so there is no code path here that can mutate tenant data.
 *
 * Non-streaming: the caller needs the analysis back to render it, so this awaits
 * the agent call directly rather than the fire-and-forget pattern used for logging.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { createTicketAnalysisAgent } from '@/lib/agents/ticket-analysis-agent';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  const { data: ticket, error: loadError } = await supabaseAdmin
    .from('feedback_submissions')
    .select('id, tenant_id, type, title, body, reporter_role, page_url, status')
    .eq('id', id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json(
      { error: 'Failed to load feedback item', details: loadError.message },
      { status: 500 }
    );
  }
  if (!ticket) {
    return NextResponse.json({ error: 'Feedback item not found' }, { status: 404 });
  }
  if (!ticket.tenant_id) {
    return NextResponse.json(
      { error: 'This ticket has no associated tenant to investigate.' },
      { status: 400 }
    );
  }

  const agent = createTicketAnalysisAgent(ticket.tenant_id);

  let analysis;
  try {
    const result = await agent.generate({
      prompt: `Investigate this ticket and produce your diagnosis.

Ticket type: ${ticket.type}
Title: ${ticket.title ?? '(none)'}
Reported by role: ${ticket.reporter_role ?? 'unknown'}
Page URL: ${ticket.page_url ?? 'unknown'}

Body:
${ticket.body}`,
    });
    analysis = result.output;
  } catch (err: any) {
    console.error('ticket analysis agent error:', err);
    return NextResponse.json(
      { error: 'AI analysis failed', details: err?.message ?? String(err) },
      { status: 502 }
    );
  }

  const analyzedAt = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('feedback_submissions')
    .update({ ai_analysis: analysis, ai_analyzed_at: analyzedAt })
    .eq('id', id);

  if (updateError) {
    console.error('ticket analysis save error:', updateError);
    return NextResponse.json(
      { error: 'Analysis succeeded but failed to save', details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: { ai_analysis: analysis, ai_analyzed_at: analyzedAt } });
}
