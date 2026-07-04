export const dynamic = 'force-dynamic';

/**
 * API Route: /api/hiring/publish-requests
 *  GET — Platform Hub approval queue: every publish request across all
 *        tenants, newest first, with tenant name + job/ad-kit essentials
 *        rendered inline (the platform owner can't open another tenant's
 *        dashboard, so the queue card must carry everything needed to run
 *        the ad manually in Ads Manager).
 *
 * Auth: requireSuperAdmin — publish requests are platform-level review
 * items, not tenant data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { PUBLISH_REQUEST_STATUSES, type PublishRequestStatus } from '@/lib/hiring/types';

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const statusParam = request.nextUrl.searchParams.get('status');
  if (statusParam && !PUBLISH_REQUEST_STATUSES.includes(statusParam as PublishRequestStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${PUBLISH_REQUEST_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    let query = supabaseAdmin
      .from('hiring_publish_requests')
      .select(
        `*,
         tenants ( name, company_code ),
         hiring_jobs ( title, slug, location, status, ad_headline, ad_primary_text, ad_tiktok_caption, ad_bullets, channels, daily_budget )`
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (statusParam) query = query.eq('status', statusParam);

    const { data, error } = await query;
    if (error) {
      console.error('hiring/publish-requests GET error:', error);
      return NextResponse.json({ error: 'Failed to load publish requests' }, { status: 500 });
    }

    const requests = (data || []).map((row: any) => {
      const { tenants, hiring_jobs, ...req } = row;
      return {
        ...req,
        tenant_name: tenants?.name ?? 'Unknown company',
        tenant_company_code: tenants?.company_code ?? null,
        job: hiring_jobs
          ? {
              title: hiring_jobs.title,
              slug: hiring_jobs.slug,
              location: hiring_jobs.location,
              status: hiring_jobs.status,
              ad_headline: hiring_jobs.ad_headline,
              ad_primary_text: hiring_jobs.ad_primary_text,
              ad_tiktok_caption: hiring_jobs.ad_tiktok_caption,
              ad_bullets: hiring_jobs.ad_bullets || [],
              channels: hiring_jobs.channels || [],
              daily_budget: hiring_jobs.daily_budget,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data: { requests } });
  } catch (err) {
    console.error('Unexpected error in hiring/publish-requests GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
