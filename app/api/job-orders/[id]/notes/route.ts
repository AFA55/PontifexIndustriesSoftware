export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/job-orders/[id]/notes
 *
 * TWO AUDIENCES (founder, Aug 15): a note is either `internal` (the office
 * talking to itself) or `operator` (the office talking TO the crew). See
 * lib/job-note-audience.ts for the rule and supabase/migrations/20260815c… for
 * the RLS that enforces it a second time at the row level.
 *
 * GET was admin/ops-only. It is now open to any authenticated user and FILTERED
 * by audience — that is what puts office notes in front of the crew at all.
 * Because every read here goes through `supabaseAdmin` (service role, RLS
 * bypassed), the filtering below is the ONLY thing standing between an operator
 * and the office's private notes on this endpoint. Do not relax it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendNotification } from '@/lib/send-reminder';
import {
  CREW_REPLY_NOTE_TYPE,
  filterVisibleNotes,
  isOfficeRole,
  normalizeNoteAudience,
  notePreview,
  resolveNoteNotifyRecipients,
} from '@/lib/job-note-audience';
import { toLocalYMD } from '@/lib/dates';

/**
 * Is this user crewed on the job? All THREE assignment paths, because this
 * platform genuinely uses all three and a reader that only checks
 * `assigned_to` has caused four production bugs in a week:
 *   • job_orders.assigned_to / helper_assigned_to  — the job-level slots
 *   • job_daily_assignments                        — the per-day ledger the
 *                                                    board actually writes
 *   • job_crew                                     — extra crew added via "+"
 */
async function isCrewOnJob(jobOrderId: string, userId: string): Promise<boolean> {
  const [slots, ledger, crew] = await Promise.all([
    supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobOrderId)
      .or(`assigned_to.eq.${userId},helper_assigned_to.eq.${userId}`)
      .maybeSingle(),
    supabaseAdmin
      .from('job_daily_assignments')
      .select('id')
      .eq('job_order_id', jobOrderId)
      .or(`operator_id.eq.${userId},helper_id.eq.${userId}`)
      .limit(1),
    supabaseAdmin
      .from('job_crew')
      .select('id')
      .eq('job_order_id', jobOrderId)
      .eq('user_id', userId)
      .limit(1),
  ]);

  return !!slots.data || !!ledger.data?.length || !!crew.data?.length;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;

    const office = isOfficeRole(auth.role);

    // Only pay for the crew lookup when it can change the answer.
    const crewMember = office ? false : await isCrewOnJob(jobOrderId, auth.userId);

    const { data: notes, error } = await supabaseAdmin
      .from('job_notes')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .neq('note_type', 'change_log')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching job notes:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    const visible = filterVisibleNotes(
      { userId: auth.userId, role: auth.role, isCrewOnJob: crewMember },
      notes || [],
    );

    return NextResponse.json({ success: true, data: visible, viewer_is_office: office });
  } catch (error) {
    console.error('Unexpected error in GET /api/job-orders/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Any authenticated user can post notes (operators post from their workflow)
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;
    const body = await request.json();

    if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      );
    }
    const content = body.content.trim();

    // The parent job — needed for the tenant stamp (this route never wrote one,
    // which left notes outside the tenant_isolation policy's reach) and for the
    // crew fan-out below.
    const { data: jobOrder } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, tenant_id, assigned_to, helper_assigned_to, project_manager_id')
      .eq('id', jobOrderId)
      .maybeSingle();

    if (!jobOrder) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    // Cross-tenant note injection guard: a non-super-admin may only write notes
    // on their own tenant's jobs.
    if (auth.role !== 'super_admin' && jobOrder.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    // ONLY THE OFFICE MAY ADDRESS THE CREW. An operator posting from their own
    // workflow writes an internal note for the office to read — letting field
    // users broadcast to a crew is a different feature with different rules.
    const office = isOfficeRole(auth.role);
    const audience = office ? normalizeNoteAudience(body.audience ?? body.noteType) : 'internal';

    const photoUrls: string[] = Array.isArray(body.photoUrls)
      ? body.photoUrls.filter((u: unknown): u is string => typeof u === 'string' && !!u)
      : [];

    // `noteType` stays the note's KIND ('manual', 'amendment', 'completion', …).
    // Audience is a separate column precisely so this list never has to be
    // consulted to answer "who can see it".
    //
    // ONE EXCEPTION, AND IT IS A SECURITY BOUNDARY. `crew_reply` is the only
    // kind that widens who may READ a note: `canViewNote` lets the whole crew
    // on a job see a crew reply, even though the reply itself stays
    // `audience: 'internal'`. So the kind has to be earned, not claimed — an
    // office author who set `noteType: 'crew_reply'` on an internal note would
    // hand the crew a note written for the office, using the one field this
    // route otherwise passes through untouched.
    //
    // Only a non-office author may write it. The office addresses the crew with
    // `audience: 'operator'`, which is the mechanism built for that.
    const requestedType =
      typeof body.noteType === 'string' && !['internal', 'operator'].includes(body.noteType)
        ? body.noteType
        : 'manual';
    const noteType =
      requestedType === CREW_REPLY_NOTE_TYPE && office ? 'manual' : requestedType;

    // Get author name from profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const authorName = profile?.full_name || auth.userEmail;

    const { data: note, error } = await supabaseAdmin
      .from('job_notes')
      .insert({
        job_order_id: jobOrderId,
        tenant_id: jobOrder.tenant_id ?? auth.tenantId ?? null,
        author_id: auth.userId,
        author_name: authorName,
        content,
        note_type: noteType,
        audience,
        photo_urls: photoUrls,
        metadata: body.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job note:', error);
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    // ── Notification — AWAITED, NOT FIRE-AND-FORGET ──────────────────────────
    // A note nobody is told about is the same as no note at all — that is half
    // of what the founder asked for here. Everything goes through
    // `sendNotification`, the ONE dispatcher (bell + push, honouring each
    // user's preferences). No smsPhone is passed: a text per note would be a
    // billed surprise, and these are not time-critical the way a dispatch is.
    //
    // This block used to float (`Promise.resolve(...).catch()`). On Vercel the
    // function's execution context can be frozen the moment the response is
    // returned, so a floating promise is a notification that sometimes simply
    // never happens — and "sometimes" is the worst possible property for the
    // office finding out the crew answered. It is awaited, wrapped in its own
    // try/catch: a failed bell must never fail a note that is already written.
    await (async () => {
      try {
        const jobNumber = jobOrder.job_number ?? jobOrderId;
        const preview = notePreview(content);
        const withPhotos = photoUrls.length
          ? ` (${photoUrls.length} attachment${photoUrls.length === 1 ? '' : 's'})`
          : '';

        // ── Crew → office ────────────────────────────────────────────────
        // The other half of the conversation. A reply stays `internal`, so it
        // is caught by KIND here, before the generic operator-note fan-out
        // below — which mails every admin in the tenant and would bury the one
        // person actually waiting on this answer.
        if (noteType === CREW_REPLY_NOTE_TYPE) {
          // Scoped by job_order_id, which was tenant-verified above (the parent
          // job was fetched and its tenant_id checked against the caller's), so
          // this cannot reach another tenant's rows. A tenant_id filter is
          // deliberately NOT added on top: notes written before this route
          // stamped a tenant have tenant_id NULL, and excluding them would
          // silently drop the very office author we are trying to notify.
          const { data: officeNotes } = await supabaseAdmin
            .from('job_notes')
            .select('author_id')
            .eq('job_order_id', jobOrderId)
            .eq('audience', 'operator')
            .order('created_at', { ascending: false })
            .limit(25);

          const recipients = resolveNoteNotifyRecipients(
            {
              officeNoteAuthorIds: (officeNotes ?? []).map(
                (n: { author_id: string | null }) => n.author_id,
              ),
              projectManagerId: jobOrder.project_manager_id ?? null,
            },
            { audience, authorId: auth.userId, noteType },
          );

          await Promise.all(
            recipients.map((userId) =>
              sendNotification({
                userId,
                tenantId: jobOrder.tenant_id ?? auth.tenantId ?? null,
                category: 'general',
                notificationType: 'crew_note_reply',
                inAppType: 'info',
                title: `Crew replied — ${jobNumber}`,
                message: `${authorName}: "${preview}"${withPhotos}`,
                jobOrderId,
                relatedEntityType: 'job_note',
                relatedEntityId: note.id,
                actionUrl: `/dashboard/admin/jobs/${jobOrderId}`,
              }),
            ),
          );
          return;
        }

        if (audience === 'operator') {
          // The CURRENT crew, from all three assignment paths. Ledger rows are
          // limited to today-or-later so a note does not chase someone who
          // worked day 1 of a job that has since moved on to other people.
          const today = toLocalYMD(new Date());
          const [crewRes, ledgerRes] = await Promise.all([
            supabaseAdmin
              .from('job_crew')
              .select('user_id')
              .eq('job_order_id', jobOrderId),
            supabaseAdmin
              .from('job_daily_assignments')
              .select('operator_id, helper_id')
              .eq('job_order_id', jobOrderId)
              .gte('assignment_date', today),
          ]);

          const recipients = resolveNoteNotifyRecipients(
            {
              job: jobOrder,
              crew: crewRes.data ?? [],
              dailyAssignments: ledgerRes.data ?? [],
            },
            { audience, authorId: auth.userId, noteType },
          );

          await Promise.all(
            recipients.map((userId) =>
              sendNotification({
                userId,
                tenantId: jobOrder.tenant_id ?? auth.tenantId ?? null,
                category: 'general',
                notificationType: 'job_note_for_crew',
                inAppType: 'info',
                title: `Note from the office — ${jobNumber}`,
                message: `${authorName}: "${preview}"${withPhotos}`,
                jobOrderId,
                relatedEntityType: 'job_note',
                relatedEntityId: note.id,
                actionUrl: `/dashboard/my-jobs/${jobOrderId}`,
              }),
            ),
          );
          return;
        }

        // Internal note. The office loop still wants to know a note landed —
        // but only when the FIELD wrote it (an operator's amendment is news;
        // an admin's own aside is not, and blasting every admin for it is how
        // the bell stops being read). The author never hears about their own.
        if (office) return;

        const { data: admins } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .in('role', ['super_admin', 'operations_manager', 'admin'])
          .eq('tenant_id', jobOrder.tenant_id ?? auth.tenantId ?? '');

        await Promise.all(
          (admins ?? [])
            .map((a: { id: string }) => a.id)
            .filter((id) => id !== auth.userId)
            .map((userId) =>
              sendNotification({
                userId,
                tenantId: jobOrder.tenant_id ?? auth.tenantId ?? null,
                category: 'general',
                notificationType: 'operator_note',
                inAppType: 'info',
                title: 'Operator Note Added',
                message: `${authorName} left a note on ${jobNumber}: "${preview}"${withPhotos}`,
                jobOrderId,
                relatedEntityType: 'job_note',
                relatedEntityId: note.id,
                actionUrl: `/dashboard/admin/jobs/${jobOrderId}`,
              }),
            ),
        );
      } catch {
        // Non-critical — the note is already saved; never turn a failed bell
        // into a failed note.
      }
    })();

    return NextResponse.json(
      { success: true, message: 'Note created', data: note },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/job-orders/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
