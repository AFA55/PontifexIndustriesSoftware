export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { parseStorageRef } from '@/lib/job-ticket-photos';
import { appendUniquePhotoUrls, countAlreadyPresent } from '@/lib/job-photo-append';

const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager', 'supervisor'];

/** Crew membership (job_crew, any role) — co-operators attach their work photos
 *  and helpers can view them. Crew rows are created tenant-scoped server-side,
 *  so a (job, user) match cannot cross tenants. */
async function isCrewMember(jobId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_crew')
    .select('id')
    .eq('job_order_id', jobId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Check authorization: must be assigned to job or admin
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('assigned_to, helper_assigned_to, photo_urls, tenant_id')
      .eq('id', jobId)
      .single();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    let isAssigned = job.assigned_to === auth.userId || job.helper_assigned_to === auth.userId;
    // Admin branch must ALSO be same-tenant — otherwise an admin in tenant A
    // could append photos to tenant B's job by id (security audit M1 IDOR).
    const isAdmin = ADMIN_ROLES.includes(profile?.role || '')
      && (!auth.tenantId || job.tenant_id === auth.tenantId);
    if (!isAssigned && !isAdmin) {
      isAssigned = await isCrewMember(jobId, auth.userId);
    }
    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: 'You are not authorized to upload photos for this job' }, { status: 403 });
    }

    const body = await request.json();
    const { photo_urls } = body;

    if (!photo_urls || !Array.isArray(photo_urls)) {
      return NextResponse.json({ error: 'photo_urls array required' }, { status: 400 });
    }

    // VALIDATE WHAT GOES IN, not just what comes out.
    //
    // This endpoint used to append any array of strings it was handed, and the
    // gate is only "assigned to this job" — so any operator could store an
    // arbitrary URL on a job. Those strings are later parsed for a bucket and a
    // path and read with the SERVICE-ROLE client (which ignores storage RLS)
    // when the dispatch ticket is printed, and operators may print dispatch
    // tickets. A crafted URL therefore meant reading another company's files.
    //
    // parseStorageRef is now origin- and bucket-locked; this is the same rule
    // applied at the door, so the bad value never reaches the row. Defence at
    // both ends: the reader must not trust stored data, and the writer must not
    // store data the reader would refuse.
    const rejected = photo_urls.filter(
      (u: unknown) => typeof u !== 'string' || parseStorageRef(u) === null
    );
    if (rejected.length > 0) {
      return NextResponse.json(
        {
          error:
            'Each photo must be an uploaded job or scope photo from this workspace.',
          rejected_count: rejected.length,
        },
        { status: 400 }
      );
    }

    // Append what is genuinely new.
    //
    // The work-performed screen retries this POST when the response is lost
    // (weak LTE, or its 20 s abort firing after the write already landed), so
    // "append everything I was handed" turns one submission into two identical
    // photos: day-complete then reports four photos for two, and the ticket
    // prints four photo pages. See lib/job-photo-append.ts for why exact-string
    // matching is sufficient here rather than merely convenient.
    const existing = job.photo_urls || [];
    const merged = appendUniquePhotoUrls(existing, photo_urls);
    const alreadyPresent = countAlreadyPresent(existing, photo_urls);
    if (alreadyPresent > 0) {
      // Visible, not silent: a retry that adds nothing should look like a retry
      // in the logs, not like a successful upload of new work.
      console.log(
        `photos: ${alreadyPresent} of ${photo_urls.length} already on job ${jobId} — treated as a retry`
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({ photo_urls: merged, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (updateError) {
      console.error('Error saving photos:', updateError);
      return NextResponse.json({ error: 'Failed to save photos' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { photo_urls: merged } });
  } catch (error) {
    console.error('Error in photos API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Check authorization: must be assigned to job or admin
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('assigned_to, helper_assigned_to, photo_urls, tenant_id')
      .eq('id', jobId)
      .single();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    let isAssigned = job.assigned_to === auth.userId || job.helper_assigned_to === auth.userId;
    // Same-tenant, exactly as the POST branch above (security audit M1 IDOR).
    // The POST was fixed and this read was left behind, so an admin in tenant A
    // could still enumerate tenant B's job photos by id. day-complete now reads
    // this endpoint on every load, so it is no longer a rarely-touched path.
    const isAdmin = ADMIN_ROLES.includes(profile?.role || '')
      && (!auth.tenantId || job.tenant_id === auth.tenantId);
    if (!isAssigned && !isAdmin) {
      isAssigned = await isCrewMember(jobId, auth.userId);
    }
    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: 'You are not authorized to view photos for this job' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: { photo_urls: job.photo_urls || [] } });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
