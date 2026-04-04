export const dynamic = 'force-dynamic';

/**
 * API Route: /api/consent
 * POST — Record a consent event
 * GET — Fetch user's consent records
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { recordGpsConsent } from '@/lib/consent';
import { GPS_CONSENT_VERSION } from '@/lib/legal/gps-consent';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { consentType, documentVersion, granted, context, contextId } = body;

    if (!consentType || !documentVersion) {
      return NextResponse.json(
        { error: 'consentType and documentVersion are required' },
        { status: 400 }
      );
    }

    const validTypes = ['privacy_policy', 'terms_of_service', 'esign_consent', 'gps_tracking'];
    if (!validTypes.includes(consentType)) {
      return NextResponse.json(
        { error: `Invalid consentType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // For GPS consent, also update the profile
    if (consentType === 'gps_tracking' && granted !== false) {
      const success = await recordGpsConsent(
        auth.userId!,
        documentVersion || GPS_CONSENT_VERSION,
        request.headers.get('x-forwarded-for') || undefined,
        request.headers.get('user-agent') || undefined
      );

      return NextResponse.json({
        success,
        message: success ? 'GPS consent recorded' : 'Failed to record GPS consent',
      });
    }

    // General consent record
    const { error } = await supabaseAdmin
      .from('consent_records')
      .insert({
        user_id: auth.userId,
        consent_type: consentType,
        document_version: documentVersion,
        granted: granted ?? true,
        context: context || null,
        context_id: contextId || null,
        ip_address: request.headers.get('x-forwarded-for') || null,
        user_agent: request.headers.get('user-agent') || null,
      });

    if (error) {
      console.error('Error recording consent:', error);
      return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Consent recorded' });
  } catch (error: any) {
    console.error('Error in consent POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const consentType = searchParams.get('type');

    let query = supabaseAdmin
      .from('consent_records')
      .select('*')
      .eq('user_id', auth.userId!)
      .order('created_at', { ascending: false });

    if (consentType) {
      query = query.eq('consent_type', consentType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching consent records:', error);
      return NextResponse.json({ error: 'Failed to fetch consent records' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in consent GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
