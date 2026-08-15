export const dynamic = 'force-dynamic';

/**
 * API Route: GET/PUT /api/my-profile/dashboard-cards
 *
 * The user's own dashboard layout preference — which built-in sections they
 * removed, and which ADMIN_CARDS shortcuts they added.
 *
 * This is a PREFERENCE endpoint, never a permission one. It stores ids and
 * nothing else; `lib/dashboard-cards.ts` intersects them with
 * `getCardPermission` at render time, so a stored id for a card the role
 * forbids renders nothing. The scrub below additionally refuses to persist an
 * id the app does not recognise.
 *
 * It lives apart from PATCH /api/my-profile on purpose: that route notifies
 * management of every self-edit, and "collapsed my commissions card" is not
 * something anyone should be paged about.
 *
 * Access: any authenticated user, own row only (`.eq('id', auth.userId)`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import { allKnownPmCardIds, sanitizeCardIds } from '@/lib/dashboard-cards';

const SELECT = 'dashboard_hidden_cards, dashboard_added_cards';

/** The column may not exist yet on an un-migrated environment — degrade, don't 500. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /dashboard_(hidden|added)_cards/.test(error.message ?? '');
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(SELECT)
      .eq('id', auth.userId)
      .maybeSingle();

    if (error) {
      if (isTableNotFoundError(error) || isMissingColumn(error)) {
        return NextResponse.json({ success: true, data: { hidden: [], added: [] } });
      }
      console.error('[my-profile/dashboard-cards GET] error:', error);
      return NextResponse.json({ error: 'Failed to load dashboard preferences' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        hidden: data?.dashboard_hidden_cards ?? [],
        added: data?.dashboard_added_cards ?? [],
      },
    });
  } catch (err) {
    console.error('[my-profile/dashboard-cards GET] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const known = allKnownPmCardIds();

    // Both keys are optional — the client sends only what changed.
    const update: Record<string, string[]> = {};
    if ('hidden' in body) update.dashboard_hidden_cards = sanitizeCardIds(body.hidden, known);
    if ('added' in body) update.dashboard_added_cards = sanitizeCardIds(body.added, known);

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update. Send "hidden" and/or "added" as arrays of card ids.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', auth.userId)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      if (isTableNotFoundError(error) || isMissingColumn(error)) {
        return NextResponse.json(
          { error: 'Dashboard preference columns not created yet. Run the migration first.' },
          { status: 501 }
        );
      }
      console.error('[my-profile/dashboard-cards PUT] error:', error);
      return NextResponse.json({ error: 'Failed to save dashboard preferences' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        hidden: data?.dashboard_hidden_cards ?? [],
        added: data?.dashboard_added_cards ?? [],
      },
    });
  } catch (err) {
    console.error('[my-profile/dashboard-cards PUT] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
