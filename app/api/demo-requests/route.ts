export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { requireSuperAdmin } from '@/lib/api-auth';

/** Where new platform-demo leads are sent. These are PONTIFEX software leads (not tenant traffic). */
const DEMO_LEAD_NOTIFY_EMAIL = 'pontifexindustries@gmail.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      company_type,
      team_size,
      biggest_challenge,
      first_name,
      last_name,
      email,
      phone,
      company_name,
    } = body;

    // Validate required fields
    if (!first_name?.trim()) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!company_name?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Insert into demo_requests table.
    // NOTE: the table's real columns are name/company/trade_type/company_size/message —
    // the funnel's richer field names are mapped onto them here. (A previous version
    // inserted the funnel field names directly → 42703 → every submission 500'd.)
    const fullName = [first_name.trim(), last_name?.trim()].filter(Boolean).join(' ');
    const { data, error } = await supabaseAdmin
      .from('demo_requests')
      .insert({
        name: fullName,
        company: company_name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        trade_type: company_type || null,
        company_size: team_size || null,
        message: biggest_challenge || null,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save demo request:', error);
      return NextResponse.json(
        { error: 'Failed to save your request. Please try again.' },
        { status: 500 }
      );
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        action: 'demo_request_created',
        details: {
          demo_request_id: data.id,
          email: email.trim().toLowerCase(),
          company_name: company_name.trim(),
          company_type,
          team_size,
        },
      })
    ).then(() => {}).catch(() => {});

    // Fire-and-forget founder notification — a lead should never sit unseen.
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    Promise.resolve(
      sendEmail({
        to: DEMO_LEAD_NOTIFY_EMAIL,
        subject: `🔔 New demo request: ${company_name.trim()}`,
        html: `
          <h2>New demo request</h2>
          <table style="border-collapse:collapse">
            <tr><td style="padding:6px 12px 6px 0;color:#666">Name</td><td>${esc(fullName)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#666">Company</td><td>${esc(company_name.trim())}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#666">Email</td><td><a href="mailto:${esc(email.trim())}">${esc(email.trim())}</a></td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#666">Phone</td><td>${esc(phone?.trim() || '—')}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#666">Type</td><td>${esc(company_type || '—')}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#666">Team size</td><td>${esc(team_size || '—')}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#666">Challenge</td><td>${esc(biggest_challenge || '—')}</td></tr>
          </table>
          <p>View &amp; manage: <a href="https://www.pontifexindustries.com/dashboard/platform/demo-requests">Platform Hub → Demo Requests</a></p>
        `,
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { id: data.id },
    });
  } catch (err) {
    console.error('Demo request error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

const VALID_STATUSES = ['new', 'contacted', 'demo_scheduled', 'converted', 'closed'] as const;

/**
 * GET /api/demo-requests — list all demo requests (Platform Hub inbox).
 * super_admin only; demo requests are platform-level leads, not tenant data.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('demo_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[demo-requests] list error:', error);
    return NextResponse.json({ error: 'Failed to load demo requests' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

/**
 * PATCH /api/demo-requests — update a lead's status/notes (body: { id, status?, notes? }).
 * super_admin only.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { id, status, notes } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      update.status = status;
    }
    if (notes !== undefined) update.notes = typeof notes === 'string' ? notes.slice(0, 5000) : null;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('demo_requests')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[demo-requests] update error:', error);
      return NextResponse.json({ error: 'Failed to update demo request' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
