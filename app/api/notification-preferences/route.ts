import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * User notification-preferences API.
 *
 * Backed by the `notification_preferences` table:
 *   id, user_id, category, push_enabled (default true),
 *   sms_enabled (default false), email_enabled (default false), updated_at
 *   UNIQUE(user_id, category) + RLS (users manage their own rows).
 *
 * GET  -> returns all 6 categories, falling back to defaults for any
 *         category the user has not customized yet.
 * PUT  -> upserts a single category's three toggles for the current user.
 */

export const dynamic = 'force-dynamic';

// The 6 supported notification categories. Order is the UI display order.
const CATEGORIES = [
  'clock_in_reminder',
  'work_performed_reminder',
  'time_off_status',
  'job_dispatched',
  'document_to_sign',
  'maintenance_update',
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(CATEGORIES);

// Column defaults mirror the table definition.
const DEFAULTS = { push_enabled: true, sms_enabled: false, email_enabled: false };

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('category, push_enabled, sms_enabled, email_enabled')
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: 'Failed to load notification preferences.' }, { status: 500 });
  }

  // Index existing rows by category, then project the full set of 6 with
  // defaults filled in for any the user hasn't customized.
  const byCategory = new Map<string, { push_enabled: boolean; sms_enabled: boolean; email_enabled: boolean }>();
  for (const row of data || []) {
    byCategory.set(row.category, {
      push_enabled: !!row.push_enabled,
      sms_enabled: !!row.sms_enabled,
      email_enabled: !!row.email_enabled,
    });
  }

  const result = CATEGORIES.map((category) => {
    const existing = byCategory.get(category);
    return {
      category,
      push_enabled: existing ? existing.push_enabled : DEFAULTS.push_enabled,
      sms_enabled: existing ? existing.sms_enabled : DEFAULTS.sms_enabled,
      email_enabled: existing ? existing.email_enabled : DEFAULTS.email_enabled,
    };
  });

  return NextResponse.json({ success: true, data: result });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: {
    category?: unknown;
    push_enabled?: unknown;
    sms_enabled?: unknown;
    email_enabled?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const category = body.category;
  if (typeof category !== 'string' || !CATEGORY_SET.has(category)) {
    return NextResponse.json({ error: 'Invalid notification category.' }, { status: 400 });
  }

  // Coerce the three flags to booleans (default false if absent/garbage,
  // except we keep explicit booleans). UI always sends explicit booleans.
  const push_enabled = body.push_enabled === true;
  const sms_enabled = body.sms_enabled === true;
  const email_enabled = body.email_enabled === true;

  const { error } = await supabaseAdmin
    .from('notification_preferences')
    .upsert(
      {
        user_id: auth.userId,
        category: category as Category,
        push_enabled,
        sms_enabled,
        email_enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category' }
    );

  if (error) {
    return NextResponse.json({ error: 'Failed to save notification preference.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
